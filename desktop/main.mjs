/**
 * The desktop server without the desktop window: serves `dist/` on this
 * machine and opens it in the default browser.
 *
 *   npm run build && npm run desktop
 *
 * Useful for trying the app's server from a checkout without building the
 * installer. The installed app itself is `electron.mjs`.
 */

import { spawn } from 'node:child_process'
import path from 'node:path'

import { startServer } from './server.mjs'

const root = path.resolve(process.env.SONDRA_APP_DIR ?? 'dist')

try {
  const { url } = await startServer({ root, port: Number(process.env.PORT ?? 4199) })
  console.log(`Sondra läuft lokal auf ${url}`)
  if (!process.env.SONDRA_NO_BROWSER) {
    const [command, args] =
      process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : process.platform === 'darwin'
          ? ['open', [url]]
          : ['xdg-open', [url]]
    try {
      spawn(command, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: true }).unref()
    } catch {
      // The address is printed either way.
    }
  }
} catch (failure) {
  console.error(`Sondra konnte nicht starten: ${failure?.message ?? failure}`)
  process.exit(1)
}
