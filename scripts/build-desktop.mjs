/**
 * Builds the Windows desktop program: a portable folder with `Sondra.exe`,
 * the site under `app/`, and the licence — zipped, ready to unpack anywhere.
 *
 *   npm run build:desktop   →   release/Sondra-Windows-x64.zip
 *
 * How: `desktop/main.mjs` and the two API functions are bundled into one
 * CommonJS script, turned into a Node single-executable blob, and injected
 * into an official `node.exe` of exactly the Node version running this build
 * (the blob format is tied to it). The runtime is downloaded once, checked
 * against the SHA-256 list nodejs.org publishes, and cached under
 * `release/.cache`.
 *
 * The folder carries what the website serves, minus the files that only make
 * sense on a deployment (`_headers`, `staticwebapp.config.json`) and the
 * yt-dlp bridge script, which the desktop program does not ship or start.
 * Nothing is removed from the repository by this.
 *
 * Built on Linux, the result cannot be started here; the server inside it is
 * the same bundle `node release/.work/sondra.cjs` runs, so that is what gets
 * tested before packing.
 */

import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { build } from 'esbuild'

const VERSION = process.version // e.g. v22.22.2
const RELEASE = path.resolve('release')
const CACHE = path.join(RELEASE, '.cache')
const WORK = path.join(RELEASE, '.work')
const OUT = path.join(RELEASE, 'Sondra')
const ZIP = path.join(RELEASE, 'Sondra-Windows-x64.zip')

/** Not part of the desktop folder: deployment config, and the yt-dlp bridge. */
const LEFT_OUT = new Set(['_headers', 'staticwebapp.config.json', 'sondra-ytdlp.mjs'])

function step(message) {
  console.log(`· ${message}`)
}

if (!fs.existsSync('dist/index.html')) {
  console.error('dist/ fehlt. Zuerst `npm run build` (oder gleich `npm run build:desktop`).')
  process.exit(1)
}

fs.rmSync(WORK, { recursive: true, force: true })
fs.rmSync(OUT, { recursive: true, force: true })
fs.rmSync(ZIP, { force: true })
fs.mkdirSync(CACHE, { recursive: true })
fs.mkdirSync(WORK, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })

/* -- 1. the server, as one CommonJS file ----------------------------------- */

step('Server bündeln')
const bundle = path.join(WORK, 'sondra.cjs')
await build({
  entryPoints: ['desktop/main.mjs'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: bundle,
  logLevel: 'warning',
})

/* -- 2. the Windows runtime, verified -------------------------------------- */

const archive = `node-${VERSION}-win-x64.zip`
const cached = path.join(CACHE, archive)

async function download(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

if (!fs.existsSync(cached)) {
  step(`${archive} laden`)
  fs.writeFileSync(cached, await download(`https://nodejs.org/dist/${VERSION}/${archive}`))
}

step('Prüfsumme vergleichen')
const sums = (await download(`https://nodejs.org/dist/${VERSION}/SHASUMS256.txt`)).toString()
const expected = sums.split('\n').find((line) => line.endsWith(`  ${archive}`))?.split(/\s+/)[0]
const actual = crypto.createHash('sha256').update(fs.readFileSync(cached)).digest('hex')
if (!expected || expected !== actual) {
  fs.rmSync(cached, { force: true })
  console.error(`Prüfsumme stimmt nicht für ${archive} (erwartet ${expected}, war ${actual}).`)
  process.exit(1)
}

execFileSync('unzip', ['-q', '-o', '-j', cached, `node-${VERSION}-win-x64/node.exe`, '-d', WORK])

/* -- 3. blob, injected into a copy of node.exe ----------------------------- */

/**
 * node.exe without its Authenticode signature.
 *
 * Injecting the blob changes the file the signature covers, so it would be
 * left behind broken — and Windows treats a broken signature with more
 * suspicion than none at all. The certificate table is the Security entry in
 * the PE data directories and sits at the very end of the file, so dropping
 * it is zeroing that entry and cutting the file short.
 */
function unsigned(image) {
  const pe = image.readUInt32LE(0x3c)
  if (image.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error('node.exe ist keine PE-Datei')
  const optional = pe + 24
  const magic = image.readUInt16LE(optional)
  // Data directories start after the fixed fields: 96 bytes in PE32, 112 in PE32+.
  const directories = optional + (magic === 0x20b ? 112 : 96)
  const security = directories + 4 * 8
  const offset = image.readUInt32LE(security)
  const size = image.readUInt32LE(security + 4)
  if (offset === 0 || size === 0) return image
  if (offset + size !== image.length) throw new Error('Signatur liegt nicht am Dateiende')
  const copy = Buffer.from(image.subarray(0, offset))
  copy.writeUInt32LE(0, security)
  copy.writeUInt32LE(0, security + 4)
  return copy
}

step('Einzeldatei-Blob erzeugen')
const blob = path.join(WORK, 'sondra.blob')
const seaConfig = path.join(WORK, 'sea-config.json')
fs.writeFileSync(
  seaConfig,
  JSON.stringify({
    main: bundle,
    output: blob,
    disableExperimentalSEAWarning: true,
    // A code cache is specific to the platform that produced it; this one
    // is produced on the build machine, not on Windows.
    useCodeCache: false,
    useSnapshot: false,
  }),
)
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' })

step('In Sondra.exe einsetzen')
const exe = path.join(OUT, 'Sondra.exe')
fs.writeFileSync(exe, unsigned(fs.readFileSync(path.join(WORK, 'node.exe'))))
execFileSync(
  'npx',
  [
    '--yes',
    'postject@1.0.0-alpha.6',
    exe,
    'NODE_SEA_BLOB',
    blob,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ],
  { stdio: 'inherit' },
)

/* -- 4. the site, and the words that go with it ---------------------------- */

step('Oberfläche kopieren')
fs.cpSync('dist', path.join(OUT, 'app'), {
  recursive: true,
  filter: (source) => !LEFT_OUT.has(path.basename(source)),
})

fs.copyFileSync('desktop/LIZENZ.txt', path.join(OUT, 'LIZENZ.txt'))
fs.copyFileSync('desktop/LIESMICH.txt', path.join(OUT, 'LIESMICH.txt'))

// Third-party licences: the GPL notice for the FFmpeg core lives in
// desktop/lizenzen (the npm package ships none); the rest come from the
// runtime archive and from node_modules.
const licences = path.join(OUT, 'lizenzen')
fs.cpSync('desktop/lizenzen', licences, { recursive: true })
execFileSync('unzip', ['-q', '-o', '-j', cached, `node-${VERSION}-win-x64/LICENSE`, '-d', WORK])
fs.copyFileSync(path.join(WORK, 'LICENSE'), path.join(licences, 'node.js.txt'))
for (const [name, file] of [
  ['react.txt', 'node_modules/react/LICENSE'],
  ['tone.txt', 'node_modules/tone/LICENSE.md'],
  ['wavesurfer.js.txt', 'node_modules/wavesurfer.js/LICENSE'],
  ['zustand.txt', 'node_modules/zustand/LICENSE'],
]) {
  fs.copyFileSync(file, path.join(licences, name))
}

/* -- 5. packed -------------------------------------------------------------- */

step('Packen')
execFileSync('zip', ['-q', '-r', '-9', ZIP, 'Sondra'], { cwd: RELEASE })

const mb = (file) => (fs.statSync(file).size / 1e6).toFixed(1)
console.log(`\nFertig: ${path.relative(process.cwd(), ZIP)} (${mb(ZIP)} MB, Sondra.exe ${mb(exe)} MB)`)
