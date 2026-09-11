/**
 * Shared session state.
 *
 * Deliberately in-memory only. Nothing here is persisted to localStorage,
 * IndexedDB or anywhere else: closing the tab is the delete button, and there is
 * no leftover state for a later visitor to a shared machine to find. The one
 * exception is the small settings slice, which holds no media at all.
 */

import { create } from 'zustand'

import { DEFAULT_CONVERT, type ConvertSettings } from '../lib/convert'
import { DEFAULT_NORMALIZATION, type NormalizationSettings } from '../lib/loudness'
import { DEFAULT_SEPARATION, type SeparationOptions } from '../lib/separation'
import type { AudioData } from '../lib/wav'

export type AssetKind = 'audio' | 'video' | 'unknown'

export interface Asset {
  id: string
  name: string
  /** Raw container bytes, exactly as they arrived. */
  bytes: Uint8Array
  mime: string
  sizeBytes: number
  kind: AssetKind
  /** Decoded audio, filled in on demand — decoding is not free. */
  audio: AudioData | null
  durationSeconds: number | null
  origin: 'file' | 'download' | 'derived'
  createdAt: number
}

export interface LogLine {
  id: number
  at: number
  level: 'info' | 'warn' | 'error'
  scope: string
  message: string
}

export type PanelId = 'downloader' | 'converter' | 'stems' | 'normalize' | 'sampler' | 'harmony'

interface SessionState {
  assets: Asset[]
  activeAssetId: string | null
  panel: PanelId
  logs: LogLine[]

  convert: ConvertSettings
  normalization: NormalizationSettings
  separation: SeparationOptions

  addAsset: (asset: Omit<Asset, 'id' | 'createdAt'>) => Asset
  updateAsset: (id: string, patch: Partial<Asset>) => void
  removeAsset: (id: string) => void
  clearAssets: () => void
  setActiveAsset: (id: string | null) => void
  setPanel: (panel: PanelId) => void

  log: (scope: string, message: string, level?: LogLine['level']) => void
  clearLogs: () => void

  setConvert: (patch: Partial<ConvertSettings>) => void
  setNormalization: (patch: Partial<NormalizationSettings>) => void
  setSeparation: (patch: Partial<SeparationOptions>) => void
}

let logCounter = 0

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const useSession = create<SessionState>((set, get) => ({
  assets: [],
  activeAssetId: null,
  panel: 'converter',
  logs: [],

  convert: DEFAULT_CONVERT,
  normalization: DEFAULT_NORMALIZATION,
  separation: DEFAULT_SEPARATION,

  addAsset: (input) => {
    const asset: Asset = { ...input, id: makeId(), createdAt: Date.now() }
    set((state) => ({ assets: [...state.assets, asset], activeAssetId: asset.id }))
    return asset
  },

  updateAsset: (id, patch) =>
    set((state) => ({
      assets: state.assets.map((asset) => (asset.id === id ? { ...asset, ...patch } : asset)),
    })),

  removeAsset: (id) =>
    set((state) => {
      const assets = state.assets.filter((asset) => asset.id !== id)
      return {
        assets,
        activeAssetId: state.activeAssetId === id ? (assets.at(-1)?.id ?? null) : state.activeAssetId,
      }
    }),

  clearAssets: () => set({ assets: [], activeAssetId: null }),

  setActiveAsset: (id) => set({ activeAssetId: id }),
  setPanel: (panel) => set({ panel }),

  log: (scope, message, level = 'info') =>
    set((state) => ({
      // A rolling buffer — the log is a diagnostic, not an archive.
      logs: [...state.logs, { id: (logCounter += 1), at: Date.now(), level, scope, message }].slice(-250),
    })),

  clearLogs: () => set({ logs: [] }),

  setConvert: (patch) => set({ convert: { ...get().convert, ...patch } }),
  setNormalization: (patch) => set({ normalization: { ...get().normalization, ...patch } }),
  setSeparation: (patch) => set({ separation: { ...get().separation, ...patch } }),
}))

/** The asset the panels currently act on. */
export function useActiveAsset(): Asset | null {
  return useSession((state) => state.assets.find((asset) => asset.id === state.activeAssetId) ?? null)
}

export function kindFromMime(mime: string, name: string): AssetKind {
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  if (['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'aiff', 'wma'].includes(extension)) return 'audio'
  if (['mp4', 'webm', 'mkv', 'mov', 'avi', 'ts', 'm4v', 'flv'].includes(extension)) return 'video'
  return 'unknown'
}
