/**
 * Whether an extraction service is connected, kept where anything can see it.
 *
 * The connection used to live inside the downloader panel, which meant the one
 * question people actually have — am I connected or not — could only be
 * answered by opening the right tab, switching the right toggle on and reading
 * a line halfway down a card. That is not an answer, that is a scavenger hunt.
 *
 * So the state moves out here, next to the other facts about this session, and
 * the capability strip can show it on every tab. Same subscribe-and-notify shape
 * as the FFmpeg status, for the same reason: several places need to read it and
 * none of them should own it.
 */

import type { ServiceInfo } from './service'

export interface ServiceConnection {
  /** The address in use, or null when nothing has answered. */
  endpoint: string | null
  info: ServiceInfo | null
  /** The page is currently looking for one on this machine. */
  searching: boolean
  /** The feature is switched on at all. */
  enabled: boolean
}

type Handler = (state: ServiceConnection) => void

const handlers = new Set<Handler>()

let state: ServiceConnection = { endpoint: null, info: null, searching: false, enabled: false }

export function serviceConnection(): ServiceConnection {
  return state
}

/** Subscribe to connection changes. Fires immediately with the current state. */
export function onServiceConnection(handler: Handler): () => void {
  handlers.add(handler)
  handler(state)
  return () => {
    handlers.delete(handler)
  }
}

export function setServiceConnection(patch: Partial<ServiceConnection>): void {
  state = { ...state, ...patch }
  handlers.forEach((handler) => handler(state))
}
