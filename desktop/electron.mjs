/**
 * Sondra as an installed Windows app: its own window, its own entry in the
 * start menu, no browser in between.
 *
 * The window is Electron's Chromium pointed at `server.mjs` on 127.0.0.1. A
 * local server rather than a `file://` page or a custom protocol, for two
 * reasons: the two API functions need a real HTTP endpoint, and the isolation
 * headers (and with them SharedArrayBuffer and multi-threaded FFmpeg) come for
 * free from the same code the website already runs.
 *
 * The port is fixed where possible because the port is part of the origin,
 * and the origin is what the page's storage — theme, connected service,
 * cached FFmpeg core — is filed under. A random port every start would begin
 * every session from nothing.
 *
 * `SONDRA_SMOKE=<file>` makes the app load once, write what it saw to that
 * file, and quit. The Windows CI job uses it to test the installed app.
 */

import fs from 'node:fs'
import path from 'node:path'

import { app, BrowserWindow, dialog, Menu, nativeTheme, session, shell } from 'electron'

import { startServer } from './server.mjs'

const PORT = 47199
const SMOKE = process.env.SONDRA_SMOKE

/**
 * One Sondra at a time: a second start brings the first window forward
 * instead of fighting it for the port.
 *
 * `exit`, not `quit`: `quit` only asks, and the rest of this file went on
 * running in the second copy — it started its own server on a fallback port
 * and began opening a window before the request to quit caught up with it.
 */
const primary = app.requestSingleInstanceLock()
if (!primary) app.exit(0)

let window = null

/**
 * Sondra's own log, `sondra.log` in the app's data folder
 * (%APPDATA%\Sondra on Windows). A desktop app has no console anyone reads,
 * and a start that fails with one line in a dialog is otherwise a guess.
 */
function logFile() {
  return path.join(app.getPath('userData'), 'sondra.log')
}

function log(message) {
  try {
    fs.appendFileSync(logFile(), `${new Date().toISOString()}  +${Math.round(performance.now())} ms  ${message}\n`)
  } catch {
    // Logging must never be the reason the app fails.
  }
}

/** Keep the log to one session's worth once it grows past a megabyte. */
function trimLog() {
  try {
    if (fs.statSync(logFile()).size > 1_000_000) fs.writeFileSync(logFile(), '')
  } catch {
    // No log yet.
  }
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])

/**
 * What the window shows when the page will not load: the reason, where the
 * log is, and a way to try again — instead of a dialog and a vanished app.
 */
function failurePage(reason, retryUrl) {
  const dark = nativeTheme.shouldUseDarkColors
  const [ground, ink, prose] = dark ? ['#090d0b', '#c9e3cc', '#dfe6e0'] : ['#f4f3ee', '#0f3e1c', '#1b231d']
  const html = `<!doctype html><html lang="de"><meta charset="utf-8"><title>Sondra</title>
<body style="margin:0;background:${ground};color:${prose};font:16px/1.55 system-ui,sans-serif">
<main style="max-width:560px;padding:64px 32px">
<h1 style="color:${ink};font-size:24px;margin:0 0 12px">Sondra konnte die Oberfläche nicht laden</h1>
<p style="margin:0 0 16px">${escapeHtml(reason)}</p>
<p style="margin:0 0 24px">Einzelheiten stehen im Protokoll:<br><code>${escapeHtml(logFile())}</code></p>
<p style="margin:0"><a href="${escapeHtml(retryUrl)}" style="color:${ink}">Erneut versuchen</a></p>
</main></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

app.on('second-instance', () => {
  log('Zweiter Start: bringe das offene Fenster nach vorn.')
  if (!window) return
  // `show` as well as `focus`: a window that is hidden does not come back
  // from `focus` alone, and the second start then looked like nothing at all.
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
})

/**
 * A GPU process that keeps dying leaves a window that paints nothing and then
 * closes. When it happens, the next start runs without hardware acceleration;
 * the page is 2D and the maths runs on the CPU either way.
 */
const NO_GPU = () => path.join(app.getPath('userData'), 'ohne-gpu')
try {
  if (fs.existsSync(NO_GPU())) app.disableHardwareAcceleration()
} catch {
  // No data folder yet: first start.
}

app.on('child-process-gone', (_event, details) => {
  log(`Hilfsprozess beendet: ${details.type} · ${details.reason} (${details.exitCode})`)
  if (details.type === 'GPU' && details.reason !== 'clean-exit') {
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true })
      fs.writeFileSync(NO_GPU(), 'Beim nächsten Start ohne Grafikbeschleunigung.\n')
    } catch {
      // Best effort; the log already says what happened.
    }
  }
})

process.on('uncaughtException', (failure) => log(`Unbehandelt: ${failure?.stack ?? failure}`))
process.on('unhandledRejection', (failure) => log(`Unbehandelt (Promise): ${failure?.stack ?? failure}`))

/** Links to anywhere but Sondra itself open in the default browser. */
function keepInside(contents, origin) {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) && !url.startsWith(origin)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (url.startsWith(origin)) return
    event.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })
}

/** Settle `promise`, or give up waiting after `ms` — whichever comes first. */
function within(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('timeout'), ms))])
}

async function open() {
  trimLog()
  log(`Start ${app.getVersion()} · ${process.platform} ${process.arch} · Electron ${process.versions.electron}`)

  // The default menu is English and mostly developer tools; the page carries
  // its own navigation.
  Menu.setApplicationMenu(null)

  // The window comes first and is visible at once, in the theme's canvas
  // colour. It used to wait, hidden, for the page to finish loading; a load
  // that hung left an invisible Sondra running, and every later start handed
  // over to it and ended — which looked like the app opening nothing.
  window = new BrowserWindow({
    title: 'Sondra',
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 480,
    show: !SMOKE,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#090d0b' : '#f4f3ee',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  log('Fenster offen')

  // The page title is written for a browser tab; the window is just "Sondra".
  window.on('page-title-updated', (event) => event.preventDefault())
  window.webContents.on('did-finish-load', () => log(`Geladen: ${window?.webContents.getURL().slice(0, 60)}`))
  window.on('closed', () => {
    window = null
  })

  // Earlier builds shipped the site's service worker, which then sat between
  // this window and the local server. This build does not ship it; whatever a
  // previous install registered — and the ~90 MB it cached — goes here. Not
  // worth a hang, though: after a few seconds the start goes on without it.
  try {
    const cleared = await within(
      session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }),
      4000,
    )
    if (cleared === 'timeout') log('Service Worker entfernen dauert zu lange, weiter ohne.')
    else log('Alte Service Worker entfernt')
  } catch (failure) {
    log(`Service Worker nicht entfernt: ${failure?.message ?? failure}`)
  }

  // Plain files next to the app archive (see scripts/build-desktop.mjs).
  const root = process.env.SONDRA_APP_DIR ?? path.join(process.resourcesPath, 'site')
  const { url } = await startServer({ root, port: PORT, onError: (message) => log(`Server: ${message}`) })
  const origin = url.replace(/\/$/, '')
  log(`Server auf ${url}`)

  // Permissions (microphone, clipboard, notifications) only for Sondra's own
  // page, never for anything it might end up framing.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback, details) => {
    callback(Boolean(details.requestingUrl?.startsWith(origin)))
  })

  if (!window) return // closed while starting
  keepInside(window.webContents, origin)

  const contents = window.webContents
  contents.on('did-fail-load', (_event, code, description, failedUrl, isMainFrame) => {
    log(`Laden fehlgeschlagen: ${code} ${description} · ${failedUrl}${isMainFrame ? ' (Seite)' : ''}`)
  })
  contents.on('render-process-gone', (_event, details) => {
    log(`Seitenprozess beendet: ${details.reason} (${details.exitCode})`)
    if (details.reason !== 'clean-exit' && window) void load()
  })
  contents.on('console-message', (event) => {
    if (event.level === 'error') log(`Seite: ${event.message}`)
  })

  if (SMOKE) {
    contents.once('did-finish-load', async () => {
      await new Promise((resolve) => setTimeout(resolve, 4000))
      const seen = await contents.executeJavaScript(
        `({ isolated: crossOriginIsolated, heading: document.querySelector('h1,h2')?.textContent ?? null,
            tools: document.querySelectorAll('section button').length })`,
      )
      fs.writeFileSync(SMOKE, JSON.stringify({ url, ...seen }))
      app.exit(0)
    })
  }

  /**
   * Load the page, a few times if need be. A first navigation can fail for
   * reasons that are gone a moment later — a virus scanner holding a file,
   * the loopback interface still settling after resume — and giving up on the
   * first one made a passing hiccup look like a broken install.
   */
  async function load() {
    let last = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (!window) return
      try {
        await window.loadURL(url)
        return
      } catch (failure) {
        last = failure
        log(`Versuch ${attempt}: ${failure?.message ?? failure}`)
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt))
      }
    }
    if (SMOKE) {
      fs.writeFileSync(SMOKE, JSON.stringify({ error: String(last?.message ?? last) }))
      app.exit(1)
      return
    }
    if (!window) return
    await window.loadURL(failurePage(String(last?.message ?? last), url))
    window.show()
  }

  await load()
}

app.setAppUserModelId('ch.lizge.sondra')

if (primary) app.whenReady().then(() =>
  open().catch((failure) => {
    const message = String(failure?.message ?? failure)
    log(`Start fehlgeschlagen: ${failure?.stack ?? failure}`)
    if (SMOKE) fs.writeFileSync(SMOKE, JSON.stringify({ error: message }))
    else dialog.showErrorBox('Sondra konnte nicht starten', `${message}\n\nProtokoll: ${logFile()}`)
    app.exit(1)
  }),
)

app.on('window-all-closed', () => app.quit())
