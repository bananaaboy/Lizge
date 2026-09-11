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
