/**
 * Install prompt for the progressive web app.
 *
 * Installing matters more here than for most pages: an installed copy keeps the
 * 32 MB FFmpeg core and the app shell in its own cache, so it opens instantly
 * and keeps working with the network switched off entirely — which is the
 * strongest possible version of the claim that nothing is uploaded.
 */

import { useCallback, useEffect, useState } from 'react'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallState {
  /** The browser has offered an install; the button is worth showing. */
  available: boolean
  /** Already running as an installed app. */
  installed: boolean
  install: () => Promise<void>
}

export function useInstallPrompt(): InstallState {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches,
  )

  useEffect(() => {
    const onPrompt = (incoming: Event) => {
      // Chrome fires this instead of showing its own bar; holding the event
      // lets the button appear where it belongs rather than as browser chrome.
      incoming.preventDefault()
      setEvent(incoming as InstallEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setEvent(null)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!event) return
    await event.prompt()
    const { outcome } = await event.userChoice
    // The event is single-use whatever the answer.
    setEvent(null)
    if (outcome === 'accepted') setInstalled(true)
  }, [event])

  return { available: event !== null, installed, install }
}
