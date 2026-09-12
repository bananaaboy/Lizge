/**
 * The program that does what a browser cannot.
 *
 * A page cannot fetch from YouTube. That is not a missing feature — portals
 * serve their media without `Access-Control-Allow-Origin`, so the browser
 * refuses to hand the bytes to a foreign page, and no amount of cleverness in
 * this app changes that. Something outside the browser has to do the fetching.
 *
 * The usual answer is "run a server", which for most people is not an answer at
 * all. A normal program with a normal installer is: double-click, paste a link,
 * get a file — and the file goes straight into Lizge afterwards. It is one more
 * program, but it is the kind of program people already know how to install.
 *
 * Nothing here is fetched or phoned home; these are static facts about where to
 * find a well-known open-source downloader, kept in one place so the panel does
 * not have to reason about operating systems.
 */

export type Platform = 'windows' | 'macos' | 'linux' | 'unknown'

export interface Companion {
  /** Where the installer lives. */
  url: string
  /** What the button should say about it. */
  label: string
  /** How it arrives on this system, in a few words. */
  note: string
}

const RELEASES = 'https://github.com/NickvisionApps/Parabolic/releases/latest'
const FLATHUB = 'https://flathub.org/apps/org.nickvision.tubeconverter'

/** The program itself, named once so the UI never spells it differently. */
export const COMPANION_NAME = 'Parabolic'
export const COMPANION_SOURCE = 'https://github.com/NickvisionApps/Parabolic'

/**
 * Which system this is.
 *
 * `userAgentData` where it exists, the user agent string otherwise. Getting it
 * wrong costs nothing — every route is still one click away — so this stays a
 * hint rather than a gate.
 */
export function detectPlatform(): Platform {
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  const raw = `${data?.platform ?? ''} ${navigator.userAgent}`.toLowerCase()
  if (raw.includes('win')) return 'windows'
  if (raw.includes('mac') || raw.includes('iphone') || raw.includes('ipad')) return 'macos'
  if (raw.includes('linux') || raw.includes('android')) return 'linux'
  return 'unknown'
}

export function companionFor(platform: Platform): Companion {
  switch (platform) {
    case 'windows':
      return {
        url: RELEASES,
        label: `${COMPANION_NAME} für Windows laden`,
        note: 'Unter „Assets" die Datei NickvisionParabolicSetup.exe — ganz normales Setup.',
      }
    case 'macos':
      return {
        url: RELEASES,
        label: `${COMPANION_NAME} für macOS laden`,
        note: 'Unter „Assets" die Datei Parabolic-macOS — für neuere Macs die arm64-Fassung.',
      }
    case 'linux':
      return {
        url: FLATHUB,
        label: `${COMPANION_NAME} über Flathub laden`,
        note: 'Installiert sich über die Software-Verwaltung wie jede andere App.',
      }
    default:
      return {
        url: RELEASES,
        label: `${COMPANION_NAME} laden`,
        note: 'Es gibt Fassungen für Windows, macOS und Linux.',
      }
  }
}
