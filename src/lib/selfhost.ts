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
export const NODE_REQUIREMENTS = 'Node.js 18 oder neuer und Git'

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
