/**
 * Setting up a local cobalt instance.
 *
 * A web page cannot start a server on the machine that is viewing it, and that
 * is not an oversight — a page that could run software on your computer would
 * be a catastrophe. So this goes as far as a page honestly can: it writes the
 * configuration for you, hands you one file and one command, and then finds the
 * instance by itself once it is running.
 *
 * Everything here is generated in the browser. No template is fetched, nothing
 * is reported anywhere, and the files are plain text you can read before running
 * them — which you should, with any script a website hands you.
 */

import type { Platform } from './platform'

/**
 * Reads a stored value, falling back to the key this app used under its old
 * name. Renaming the product should not quietly throw away what someone saved.
 */
function readStored(key: string, previous: string): string | null {
  try {
    const current = localStorage.getItem(key)
    if (current !== null) return current
    const legacy = localStorage.getItem(previous)
    if (legacy !== null) localStorage.setItem(key, legacy)
    return legacy
  } catch {
    return null
  }
}

export const COBALT_IMAGE = 'ghcr.io/imputnet/cobalt:11'
export const DEFAULT_PORT = 9000
/** Where the bridge listens. The service itself stays on its usual port. */
export const BRIDGE_PORT = 9001
/** Where the mirror serves the app back. */
export const MIRROR_PORT = 8787

const STORAGE_KEY = 'sondra:instances'
const MAX_REMEMBERED = 6

/**
 * Addresses that have worked before.
 *
 * Setting an instance up is a one-off; picking it again should not be. Only
 * endpoints that actually answered are remembered, and only the address — never
 * a key, never anything about what was fetched through it.
 */
export function rememberedInstances(): string[] {
  try {
    const raw = readStored(STORAGE_KEY, 'lizge:instances')
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

export function rememberInstance(endpoint: string): string[] {
  const clean = endpoint.trim()
  if (!clean) return rememberedInstances()
  // Most recent first, no duplicates.
  const next = [clean, ...rememberedInstances().filter((entry) => entry !== clean)].slice(0, MAX_REMEMBERED)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* storage blocked; the list simply will not survive a reload */
  }
  return next
}

export function forgetInstance(endpoint: string): string[] {
  const next = rememberedInstances().filter((entry) => entry !== endpoint)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* nothing to do */
  }
  return next
}

/**
 * Addresses a local instance is likely to be reachable at.
 *
 * The bridge's port is in the list too, and before the plain ones: if somebody
 * went to the trouble of starting it, it is the address that will actually work
 * from a hosted page, and finding it first saves two doomed attempts.
 */
export function localCandidates(port = DEFAULT_PORT): string[] {
  return [
    `http://localhost:${BRIDGE_PORT}/`,
    `http://localhost:${port}/`,
    `http://127.0.0.1:${port}/`,
    // Docker Desktop on Windows and macOS sometimes lands here instead.
    `http://host.docker.internal:${port}/`,
  ]
}

/**
 * The compose file.
 *
 * Bound to 127.0.0.1 rather than 0.0.0.0: an instance on a laptop has no reason
 * to be reachable from the café's wifi. `CORS_WILDCARD` stays at its default of
 * 1, which is what lets this page talk to it at all.
 */
export function composeFile(port = DEFAULT_PORT): string {
  return `# cobalt, für den eigenen Rechner.
# Erzeugt von Sondra. Vor dem Ausführen lesen — das gilt für jede Datei,
# die eine Webseite Ihnen gibt.
#
# Starten:  docker compose up -d
# Anhalten: docker compose down
# Neustart nach Update: docker compose pull && docker compose up -d

services:
  cobalt:
    image: ${COBALT_IMAGE}
    container_name: cobalt
    init: true
    read_only: true
    restart: unless-stopped

    # Nur lokal erreichbar. Ohne die 127.0.0.1 davor hört der Dienst im
    # ganzen Netz zu, was auf einem Laptop selten gemeint ist.
    ports:
      - 127.0.0.1:${port}:${port}

    environment:
      # Muss der Adresse entsprechen, unter der Sie den Dienst erreichen,
      # sonst funktionieren die Tunnel nicht.
      API_URL: "http://localhost:${port}/"
      API_PORT: "${port}"

      # CORS_WILDCARD steht per Voreinstellung auf 1 und erlaubt damit
      # Anfragen von jeder Seite — genau das braucht Sondra hier.
      # Auf einem öffentlichen Server würden Sie das einschränken.

      # Optional: Dienste abschalten, die Sie nicht brauchen.
      # DISABLED_SERVICES: "bilibili,vk"

      # Optional: Längenbegrenzung in Sekunden, Vorgabe 10800 (3 Stunden).
      # DURATION_LIMIT: "10800"
`
}

/** A shell script that writes the compose file and starts it. */
export function unixScript(port = DEFAULT_PORT): string {
  return `#!/usr/bin/env bash
# cobalt lokal starten. Erzeugt von Sondra.
# Vor dem Ausführen lesen. Das Skript legt einen Ordner an, schreibt eine
# docker-compose.yml hinein und startet den Container — sonst nichts.
set -euo pipefail

DIR="\${1:-\$HOME/cobalt}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker fehlt. Installieren: https://docs.docker.com/get-docker/" >&2
  exit 1
fi

mkdir -p "\$DIR"
cd "\$DIR"

cat > docker-compose.yml <<'COMPOSE'
${composeFile(port)}COMPOSE

echo "Konfiguration liegt in \$DIR/docker-compose.yml"
docker compose up -d

echo
echo "Läuft auf http://localhost:${port}/"
echo "In Sondra auf „Suchen“ klicken — die Adresse wird dann selbst gefunden."
echo "Anhalten: cd \$DIR && docker compose down"
`
}

/** The same for PowerShell. */
export function windowsScript(port = DEFAULT_PORT): string {
  return `# cobalt lokal starten. Erzeugt von Sondra.
# Vor dem Ausfuehren lesen. Das Skript legt einen Ordner an, schreibt eine
# docker-compose.yml hinein und startet den Container - sonst nichts.
$ErrorActionPreference = "Stop"

$Dir = if ($args[0]) { $args[0] } else { Join-Path $HOME "cobalt" }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker fehlt. Installieren: https://docs.docker.com/get-docker/"
  exit 1
}

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Set-Location $Dir

@'
${composeFile(port)}
'@ | Set-Content -Path "docker-compose.yml" -Encoding UTF8

Write-Host "Konfiguration liegt in $Dir\\docker-compose.yml"
docker compose up -d

Write-Host ""
Write-Host "Laeuft auf http://localhost:${port}/"
Write-Host "In Sondra auf 'Suchen' klicken - die Adresse wird dann selbst gefunden."
Write-Host "Anhalten: cd $Dir; docker compose down"
`
}

/** A single command, for people who would rather not run a script at all. */
export function oneLiner(port = DEFAULT_PORT): string {
  return (
    `docker run -d --name cobalt --restart unless-stopped ` +
    `-p 127.0.0.1:${port}:${port} ` +
    `-e API_URL="http://localhost:${port}/" ${COBALT_IMAGE}`
  )
}

/* -------------------------------------------------------------------------- */
/* Without Docker                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The same service, run directly on Node.
 *
 * Docker Desktop on Windows drags in WSL2, which drags in a virtual machine,
 * and that stack has failure modes a person cannot fix — an open WSL bug refuses
 * to attach its own system disk with "the request is not supported", and no
 * amount of reinstalling helps. None of it is needed here: cobalt's API is a
 * Node program, and Node is a plain installer with no virtualisation behind it.
 *
 * Slightly more to type, far less to go wrong.
 */
export const NODE_REQUIREMENTS = 'Node.js 18.17 oder neuer und Git'

/** The steps, for showing rather than running. */
export function nodeSteps(port = DEFAULT_PORT): string[] {
  return [
    'git clone --depth 1 https://github.com/imputnet/cobalt',
    'cd cobalt/api',
    'corepack enable pnpm',
    'pnpm install',
    `echo API_URL=http://localhost:${port}/ > .env`,
    'pnpm start',
  ]
}

export function nodeUnixScript(port = DEFAULT_PORT): string {
  return `#!/usr/bin/env bash
# cobalt ohne Docker starten. Erzeugt von Sondra.
# Vor dem Ausführen lesen. Das Skript holt den Quelltext, installiert die
# Abhängigkeiten in einen Ordner und startet den Dienst — sonst nichts.
set -euo pipefail

DIR="\${1:-\$HOME/cobalt}"

for tool in git node; do
  if ! command -v "\$tool" >/dev/null 2>&1; then
    echo "\$tool fehlt. Node.js: https://nodejs.org/  Git: https://git-scm.com/" >&2
    exit 1
  fi
done

if [ ! -d "\$DIR" ]; then
  git clone --depth 1 https://github.com/imputnet/cobalt "\$DIR"
fi
cd "\$DIR/api"

# corepack gehört zu Node und holt pnpm in der passenden Fassung.
corepack enable pnpm
pnpm install

cat > .env <<'ENVFILE'
API_URL=http://localhost:${port}/
API_PORT=${port}
ENVFILE

echo
echo "Startet auf http://localhost:${port}/ — dieses Fenster offen lassen."
echo "In Sondra passiert der Rest von selbst."
pnpm start
`
}

export function nodeWindowsScript(port = DEFAULT_PORT): string {
  return `# cobalt ohne Docker starten. Erzeugt von Sondra.
# Vor dem Ausfuehren lesen. Das Skript holt den Quelltext, installiert die
# Abhaengigkeiten in einen Ordner und startet den Dienst - sonst nichts.
#
# Falls PowerShell das Ausfuehren verweigert, einmalig in derselben Sitzung:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
$ErrorActionPreference = "Stop"

$Dir = if ($args[0]) { $args[0] } else { Join-Path $HOME "cobalt" }

foreach ($tool in @("git", "node")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Write-Error "$tool fehlt. Node.js: https://nodejs.org/  Git: https://git-scm.com/"
    exit 1
  }
}

if (-not (Test-Path $Dir)) {
  git clone --depth 1 https://github.com/imputnet/cobalt $Dir
}
Set-Location (Join-Path $Dir "api")

# corepack gehoert zu Node und holt pnpm in der passenden Fassung.
corepack enable pnpm
pnpm install

@"
API_URL=http://localhost:${port}/
API_PORT=${port}
"@ | Set-Content -Path ".env" -Encoding UTF8

Write-Host ""
Write-Host "Startet auf http://localhost:${port}/ - dieses Fenster offen lassen."
Write-Host "In Sondra passiert der Rest von selbst."
pnpm start
`
}

/* -------------------------------------------------------------------------- */
/* Without Docker and without Git                                              */
/* -------------------------------------------------------------------------- */

/**
 * The same service again, for a machine that has neither Docker nor Git.
 *
 * Git is a developer's tool, and needing it to run a program is an accident of
 * how the program is distributed. GitHub serves every repository as an archive
 * too, and unpacking one needs nothing that is not already there: `tar`
 * everywhere, `Expand-Archive` in PowerShell. Node is then the only install.
 *
 * One catch, found by running it rather than by reading about it: the service
 * refuses to start outside a git checkout. It walks up from the working
 * directory looking for `.git` and dies with "no git repository root found" —
 * not because it uses git, but because it reads its own version, branch and
 * remote out of three files in there. Writing those three by hand satisfies it,
 * and needs no git at all.
 *
 * The cost of an archive is updating: no history to pull, so a newer version
 * means fetching it again. For a service that sits in the background and works,
 * that is the right trade.
 */
export const NODE_ONLY_REQUIREMENTS = 'nur Node.js 18.17 oder neuer'

const ARCHIVE_TAR = 'https://github.com/imputnet/cobalt/archive/refs/heads/main.tar.gz'
const ARCHIVE_ZIP = 'https://github.com/imputnet/cobalt/archive/refs/heads/main.zip'
/** What the archive unpacks into — GitHub names it after the branch. */
const ARCHIVE_DIR = 'cobalt-main'
/** The placeholder commit in the stub; the service only echoes it back. */
const STUB_COMMIT = '0'.repeat(40)

/** The steps without Git, for showing rather than running. */
export function nodeOnlySteps(port = DEFAULT_PORT): string[] {
  return [
    'curl -L ' + ARCHIVE_TAR + ' | tar xz',
    'cd ' + ARCHIVE_DIR,
    'mkdir -p .git/logs',
    "printf 'ref: refs/heads/main\\n' > .git/HEAD",
    "printf '" + STUB_COMMIT + ' ' + STUB_COMMIT + " archiv <a@b> 0 +0000\\tarchive\\n' > .git/logs/HEAD",
    'printf \'[remote "origin"]\\n\\turl = https://github.com/imputnet/cobalt\\n\' > .git/config',
    'cd api',
    'corepack enable pnpm',
    'pnpm install',
    'echo API_URL=http://localhost:' + port + '/ > .env',
    'pnpm start',
  ]
}

export function nodeOnlyUnixScript(port = DEFAULT_PORT): string {
  return [
    '#!/usr/bin/env bash',
    '# cobalt ohne Docker und ohne Git starten. Erzeugt von Sondra.',
    '# Vor dem Ausführen lesen. Das Skript lädt den Quelltext als Archiv, packt',
    '# ihn in einen Ordner, installiert die Abhängigkeiten und startet den Dienst.',
    'set -euo pipefail',
    '',
    'DIR="${1:-$HOME/cobalt}"',
    '',
    'if ! command -v node >/dev/null 2>&1; then',
    '  echo "Node.js fehlt. Installieren: https://nodejs.org/" >&2',
    '  exit 1',
    'fi',
    '',
    'mkdir -p "$DIR"',
    'cd "$DIR"',
    '',
    '# Kein git nötig: GitHub liefert jeden Stand auch als Archiv, und tar ist',
    '# überall vorhanden.',
    'echo "Quelltext wird geholt…"',
    'curl -fsSL "' + ARCHIVE_TAR + '" | tar xz',
    '',
    'cd "' + ARCHIVE_DIR + '"',
    '',
    '# Der Dienst startet nur innerhalb eines git-Ordners — nicht weil er git',
    '# benutzt, sondern weil er daraus seine Versionsangabe liest. Drei Dateien',
    '# genügen ihm, und dafür braucht es kein git.',
    'mkdir -p .git/logs',
    "printf 'ref: refs/heads/main\\n' > .git/HEAD",
    "printf '" + STUB_COMMIT + ' ' + STUB_COMMIT + " archiv <a@b> 0 +0000\\tarchive\\n' > .git/logs/HEAD",
    'printf \'[remote "origin"]\\n\\turl = https://github.com/imputnet/cobalt\\n\' > .git/config',
    '',
    'cd api',
    '',
    '# corepack gehört zu Node und holt die festgelegte pnpm-Fassung. Die Abfrage',
    '# vorher abschalten, sonst wartet das Skript auf eine Eingabe.',
    'export COREPACK_ENABLE_DOWNLOAD_PROMPT=0',
    'corepack enable pnpm 2>/dev/null || npm install -g pnpm',
    'pnpm install',
    '',
    "cat > .env <<'ENVFILE'",
    'API_URL=http://localhost:' + port + '/',
    'API_PORT=' + port,
    'ENVFILE',
    '',
    'echo',
    'echo "Startet auf http://localhost:' + port + '/ — dieses Fenster offen lassen."',
    'echo "In Sondra passiert der Rest von selbst."',
    'pnpm start',
    '',
  ].join('\n')
}

export function nodeOnlyWindowsScript(port = DEFAULT_PORT): string {
  // Every file below is written with a literal here-string (@'…'@) rather than
  // a quoted value. PowerShell does not expand escapes inside single quotes, so
  // a `n in one would land in the file as two characters — and the whole point
  // of these three files is that the service can parse them.
  return [
    '# cobalt ohne Docker und ohne Git starten. Erzeugt von Sondra.',
    '# Vor dem Ausfuehren lesen. Das Skript laedt den Quelltext als Archiv, packt',
    '# ihn in einen Ordner, installiert die Abhaengigkeiten und startet den Dienst.',
    '#',
    '# Falls PowerShell das Ausfuehren verweigert, einmalig in derselben Sitzung:',
    '#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass',
    '$ErrorActionPreference = "Stop"',
    '',
    '$Dir = if ($args[0]) { $args[0] } else { Join-Path $HOME "cobalt" }',
    '',
    'if (-not (Get-Command node -ErrorAction SilentlyContinue)) {',
    '  Write-Error "Node.js fehlt. Installieren: https://nodejs.org/"',
    '  exit 1',
    '}',
    '',
    'New-Item -ItemType Directory -Force -Path $Dir | Out-Null',
    'Set-Location $Dir',
    '',
    '# Kein git noetig: GitHub liefert jeden Stand auch als Archiv, und',
    '# Expand-Archive gehoert zu PowerShell.',
    'Write-Host "Quelltext wird geholt..."',
    '$Zip = Join-Path $Dir "cobalt.zip"',
    'Invoke-WebRequest -Uri "' + ARCHIVE_ZIP + '" -OutFile $Zip',
    'Expand-Archive -Path $Zip -DestinationPath $Dir -Force',
    'Remove-Item $Zip',
    '',
    '$Root = Join-Path $Dir "' + ARCHIVE_DIR + '"',
    'Set-Location $Root',
    '',
    '# Der Dienst startet nur innerhalb eines git-Ordners - nicht weil er git',
    '# benutzt, sondern weil er daraus seine Versionsangabe liest. Drei Dateien',
    '# genuegen ihm, und dafuer braucht es kein git.',
    'New-Item -ItemType Directory -Force -Path ".git\\logs" | Out-Null',
    '',
    "@'",
    'ref: refs/heads/main',
    "'@ | Set-Content -Path \".git\\HEAD\" -Encoding ascii",
    '',
    "@'",
    // Only the second field is read back, so a space where git writes a tab
    // changes nothing and saves an escape that PowerShell would not expand.
    STUB_COMMIT + ' ' + STUB_COMMIT + ' archiv <a@b> 0 +0000 archive',
    "'@ | Set-Content -Path \".git\\logs\\HEAD\" -Encoding ascii",
    '',
    "@'",
    '[remote "origin"]',
    '\turl = https://github.com/imputnet/cobalt',
    "'@ | Set-Content -Path \".git\\config\" -Encoding ascii",
    '',
    'Set-Location (Join-Path $Root "api")',
    '',
    '# corepack gehoert zu Node und holt die festgelegte pnpm-Fassung. Die Abfrage',
    '# vorher abschalten, sonst wartet das Skript auf eine Eingabe.',
    '$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"',
    'try { corepack enable pnpm } catch { npm install -g pnpm }',
    'pnpm install',
    '',
    '# Set-Content statt ">", weil PowerShell sonst UTF-16 schreibt und der',
    '# Dienst die Datei nicht lesen kann.',
    '@"',
    'API_URL=http://localhost:' + port + '/',
    'API_PORT=' + port,
    '"@ | Set-Content -Path ".env" -Encoding UTF8',
    '',
    'Write-Host ""',
    'Write-Host "Startet auf http://localhost:' + port + '/ - dieses Fenster offen lassen."',
    'Write-Host "In Sondra passiert der Rest von selbst."',
    'pnpm start',
    '',
  ].join('\n')
}

/* -------------------------------------------------------------------------- */
/* Putting the steps together for one particular machine                       */
/* -------------------------------------------------------------------------- */

/** Where Node comes from when no package manager is at hand. */
export const NODE_DOWNLOAD = 'https://nodejs.org/en/download'

/**
 * A one-line way to install Node, where the system has one that is already
 * present. Windows has had winget since 2019 and macOS users mostly have
 * Homebrew; Linux has a dozen package managers and no safe guess, so it gets
 * the download page instead of a command that might be wrong.
 */
export function nodeInstallCommand(platform: Platform): string | null {
  if (platform === 'windows') return 'winget install -e --id OpenJS.NodeJS.LTS'
  if (platform === 'macos') return 'brew install node'
  return null
}

export interface LocalSetup {
  /** Node is already installed. When false, getting it comes first. */
  hasNode: boolean
  /** Git is already installed. When false, the source comes as an archive. */
  hasGit: boolean
  platform: Platform
  port?: number
}

/**
 * The commands for this machine, and only those.
 *
 * The point of asking what is already there is that nobody should have to read
 * past steps that do not apply to them, or work out for themselves which half
 * of an instruction they need. Two answers, four combinations, and each one
 * produces a list that can be pasted start to finish.
 */
export function localSteps({ hasNode, hasGit, platform, port = DEFAULT_PORT }: LocalSetup): string[] {
  const steps: string[] = []

  if (!hasNode) {
    const install = nodeInstallCommand(platform)
    if (install) steps.push(install)
  }

  steps.push(...(hasGit ? nodeSteps(port) : nodeOnlySteps(port)))
  return steps
}

/** What still has to be done by hand before the commands will work. */
export function manualPrerequisite({ hasNode, platform }: Pick<LocalSetup, 'hasNode' | 'platform'>): boolean {
  return !hasNode && nodeInstallCommand(platform) === null
}

/* -------------------------------------------------------------------------- */
/* The bridge                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A few lines of Node that let an older browser through.
 *
 * Before browsers grew a permission for this, the rule was that the *service*
 * had to vouch for the request: a page from the internet reaching a private
 * address triggers a preflight carrying `Access-Control-Request-Private-Network`,
 * and only an answer of `Access-Control-Allow-Private-Network: true` lets the
 * real request follow. cobalt does not send that header and has no reason to, so
 * something in front of it has to.
 *
 * That is all this is: it answers the preflight itself and passes everything
 * else through untouched, apart from replacing the CORS headers — leaving
 * cobalt's own in place would send two values for one header, which browsers
 * reject outright.
 *
 * Nothing is stored and nothing is logged. It listens only on the loopback
 * interface, so it is no more reachable from outside than the service behind it.
 */
export function bridgeScript(port = DEFAULT_PORT, bridgePort = BRIDGE_PORT): string {
  return [
    '// Brücke für Browser ohne Erlaubnis-Abfrage fürs lokale Netzwerk.',
    '// Erzeugt von Sondra. Vor dem Ausführen lesen — es sind keine 60 Zeilen.',
    '//',
    '// Starten mit:  node sondra-bruecke.mjs',
    `// Danach in Sondra die Adresse http://localhost:${bridgePort}/ eintragen.`,
    '',
    "import http from 'node:http'",
    '',
    `const TARGET = { host: '127.0.0.1', port: ${port} }`,
    `const LISTEN = ${bridgePort}`,
    '',
    '// Genau die Kopfzeilen, die eine Anfrage aus dem Netz an eine private',
    '// Adresse braucht. Der Ursprung wird gespiegelt statt auf "*" gesetzt,',
    '// weil "*" zusammen mit Anmeldedaten nicht erlaubt ist.',
    'const cors = (req) => ({',
    "  'Access-Control-Allow-Origin': req.headers.origin ?? '*',",
    "  'Access-Control-Allow-Private-Network': 'true',",
    "  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',",
    "  'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '*',",
    "  'Access-Control-Max-Age': '86400',",
    "  Vary: 'Origin',",
    '})',
    '',
    'http',
    '  .createServer((req, res) => {',
    '    // Die Vorabfrage beantwortet die Brücke selbst.',
    "    if (req.method === 'OPTIONS') {",
    '      res.writeHead(204, cors(req))',
    '      return res.end()',
    '    }',
    '',
    '    const upstream = http.request(',
    '      { ...TARGET, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${TARGET.port}` } },',
    '      (answer) => {',
    '        const headers = { ...answer.headers }',
    '        // Die eigenen CORS-Kopfzeilen des Dienstes müssen weg, sonst',
    '        // stünde jede doppelt da und der Browser verwirft die Antwort.',
    '        for (const name of Object.keys(headers)) {',
    "          if (name.toLowerCase().startsWith('access-control-')) delete headers[name]",
    '        }',
    '        res.writeHead(answer.statusCode ?? 502, { ...headers, ...cors(req) })',
    '        answer.pipe(res)',
    '      },',
    '    )',
    '',
    "    upstream.on('error', () => {",
    "      res.writeHead(502, { 'Content-Type': 'text/plain', ...cors(req) })",
    `      res.end('Der Dienst auf Port ${port} antwortet nicht.')`,
    '    })',
    '',
    '    req.pipe(upstream)',
    '  })',
    "  .listen(LISTEN, '127.0.0.1', () => {",
    '    console.log(`Brücke läuft: http://localhost:${LISTEN}/ → 127.0.0.1:${TARGET.port}`)',
    "    console.log('Diese Adresse in Sondra eintragen. Fenster offen lassen.')",
    '  })',
    '',
  ].join('\n')
}

/* -------------------------------------------------------------------------- */
/* The mirror                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Serves this very app back from the machine it is talking to.
 *
 * Every other approach here argues with the browser about whether a page from
 * the internet may touch `localhost`. This one removes the argument: it puts the
 * app on `localhost` too. Page and service then share an address space, no
 * permission applies, no preflight is needed, and it works the same in browsers
 * that never implemented any of it.
 *
 * It is a pass-through, not a copy: each request is fetched from the site and
 * handed on, so what you get is whatever the site currently serves. Two headers
 * are added on the way, the ones that unlock the multi-threaded FFmpeg core —
 * without them the app still runs, just slower, and losing that to a workaround
 * would be a poor trade. Content encoding and length are dropped because the
 * body is decoded in passing and the old numbers would no longer describe it.
 *
 * Nothing is stored, nothing is logged, and it listens on loopback only.
 */
export function mirrorScript(origin: string, port = MIRROR_PORT): string {
  return [
    '// Sondra lokal spiegeln. Erzeugt von Sondra selbst.',
    '// Vor dem Ausführen lesen — es ist eine Datei ohne Abhängigkeiten.',
    '//',
    '// Starten mit:  node sondra-spiegel.mjs',
    `// Dann http://localhost:${port}/ öffnen statt der Website.`,
    '//',
    '// Warum das hilft: Seite und Dienst liegen dann beide auf diesem Rechner.',
    '// Browser sperren nur den Weg von außen nach innen — den geht es dann nicht',
    '// mehr, also ist auch keine Erlaubnis nötig.',
    '',
    "import http from 'node:http'",
    '',
    `const SITE = '${origin.replace(/\/$/, '')}'`,
    `const LISTEN = ${port}`,
    '',
    'http',
    '  .createServer(async (req, res) => {',
    '    try {',
    '      const upstream = await fetch(SITE + req.url, {',
    '        method: req.method,',
    "        headers: { 'user-agent': req.headers['user-agent'] ?? 'sondra-spiegel', accept: req.headers.accept ?? '*/*' },",
    "        redirect: 'follow',",
    '      })',
    '',
    '      const headers = {}',
    '      upstream.headers.forEach((value, name) => {',
    '        // Der Rumpf wird beim Durchreichen entpackt, also beschreiben die',
    '        // alten Angaben ihn nicht mehr.',
    "        if (['content-encoding', 'content-length', 'transfer-encoding'].includes(name)) return",
    '        headers[name] = value',
    '      })',
    '',
    '      // Diese beiden schalten den mehrfädigen FFmpeg-Kern frei.',
    "      headers['cross-origin-opener-policy'] = 'same-origin'",
    "      headers['cross-origin-embedder-policy'] = 'credentialless'",
    '',
    '      res.writeHead(upstream.status, headers)',
    '      if (!upstream.body) return res.end()',
    '      for await (const chunk of upstream.body) res.write(chunk)',
    '      res.end()',
    '    } catch (error) {',
    "      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })",
    '      res.end(`Die Seite ${SITE} war nicht erreichbar: ${error.message}`)',
    '    }',
    '  })',
    "  .listen(LISTEN, '127.0.0.1', () => {",
    '    console.log(`Sondra läuft jetzt lokal: http://localhost:${LISTEN}/`)',
    "    console.log('Diese Adresse im Browser öffnen. Fenster offen lassen.')",
    '  })',
    '',
  ].join('\n')
}
