/**
 * Which operating system this is.
 *
 * Only ever used to pick better wording or a better install command — every
 * route stays reachable whatever the answer, so a wrong guess costs nothing.
 * That is why this is a hint from the user agent rather than anything cleverer.
 */

export type Platform = 'windows' | 'macos' | 'linux' | 'unknown'

export function detectPlatform(): Platform {
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  const raw = `${data?.platform ?? ''} ${navigator.userAgent}`.toLowerCase()
  if (raw.includes('win')) return 'windows'
  if (raw.includes('mac') || raw.includes('iphone') || raw.includes('ipad')) return 'macos'
  if (raw.includes('linux') || raw.includes('android')) return 'linux'
  return 'unknown'
}
