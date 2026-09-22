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

// One Sondra at a time: a second start brings the first window forward
// instead of fighting it for the port.
if (!app.requestSingleInstanceLock()) app.quit()

let window = null

app.on('second-instance', () => {
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
})

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

async function open() {
  const root = path.join(app.getAppPath(), 'app')
  const { url } = await startServer({ root, port: PORT })
  const origin = url.replace(/\/$/, '')

  // Permissions (microphone, clipboard, notifications) only for Sondra's own
  // page, never for anything it might end up framing.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback, details) => {
    callback(Boolean(details.requestingUrl?.startsWith(origin)))
  })

  // The default menu is English and mostly developer tools; the page carries
  // its own navigation.
  Menu.setApplicationMenu(null)

  window = new BrowserWindow({
    title: 'Sondra',
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 480,
    show: false,
    // The canvas colour of the matching theme, so there is no white flash
    // before the first paint.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#090d0b' : '#f4f3ee',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // The page title is written for a browser tab; the window is just "Sondra".
  window.on('page-title-updated', (event) => event.preventDefault())
  window.once('ready-to-show', () => {
    if (!SMOKE) window.show()
  })
  window.on('closed', () => {
    window = null
  })
  keepInside(window.webContents, origin)

  if (SMOKE) {
    window.webContents.once('did-finish-load', async () => {
      // Long enough for the service worker's one reload, if it takes one.
      await new Promise((resolve) => setTimeout(resolve, 4000))
      const seen = await window.webContents.executeJavaScript(
        `({ isolated: crossOriginIsolated, heading: document.querySelector('h1,h2')?.textContent ?? null,
            tools: document.querySelectorAll('section button').length })`,
      )
      fs.writeFileSync(SMOKE, JSON.stringify({ url, ...seen }))
      app.exit(0)
    })
  }

  await window.loadURL(url)
}

app.setAppUserModelId('ch.lizge.sondra')

app.whenReady().then(() =>
  open().catch((failure) => {
    if (SMOKE) fs.writeFileSync(SMOKE, JSON.stringify({ error: String(failure?.message ?? failure) }))
    else dialog.showErrorBox('Sondra konnte nicht starten', String(failure?.message ?? failure))
    app.exit(1)
  }),
)

app.on('window-all-closed', () => app.quit())
