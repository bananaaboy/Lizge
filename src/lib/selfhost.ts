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

export const COBALT_IMAGE = 'ghcr.io/imputnet/cobalt:11'
export const DEFAULT_PORT = 9000

const STORAGE_KEY = 'lizge:instances'
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
    const raw = localStorage.getItem(STORAGE_KEY)
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

/** Addresses a local instance is likely to be reachable at. */
export function localCandidates(port = DEFAULT_PORT): string[] {
  return [
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
# Erzeugt von Lizge. Vor dem Ausführen lesen — das gilt für jede Datei,
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
      # Anfragen von jeder Seite — genau das braucht Lizge hier.
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
# cobalt lokal starten. Erzeugt von Lizge.
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
echo "In Lizge auf „Suchen“ klicken — die Adresse wird dann selbst gefunden."
echo "Anhalten: cd \$DIR && docker compose down"
`
}

/** The same for PowerShell. */
export function windowsScript(port = DEFAULT_PORT): string {
  return `# cobalt lokal starten. Erzeugt von Lizge.
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
Write-Host "In Lizge auf 'Suchen' klicken - die Adresse wird dann selbst gefunden."
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
# cobalt ohne Docker starten. Erzeugt von Lizge.
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
echo "In Lizge passiert der Rest von selbst."
pnpm start
`
}

export function nodeWindowsScript(port = DEFAULT_PORT): string {
  return `# cobalt ohne Docker starten. Erzeugt von Lizge.
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
Write-Host "In Lizge passiert der Rest von selbst."
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
    '# cobalt ohne Docker und ohne Git starten. Erzeugt von Lizge.',
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
    'echo "In Lizge passiert der Rest von selbst."',
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
    '# cobalt ohne Docker und ohne Git starten. Erzeugt von Lizge.',
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
    'Write-Host "In Lizge passiert der Rest von selbst."',
    'pnpm start',
    '',
  ].join('\n')
}
