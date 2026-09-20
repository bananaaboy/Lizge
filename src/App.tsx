import { CommandPalette } from './components/CommandPalette'
import { Dashboard } from './components/Dashboard'
import { DropOverlay, Footer, Header, SessionBar } from './components/AppShell'
import { useFfmpegPrefetch } from './hooks/useFfmpegPrefetch'
import { useGlobalIngest } from './hooks/useGlobalIngest'
import { useInstallPrompt } from './hooks/useInstallPrompt'
import { useTheme } from './hooks/useTheme'

export default function App() {
  const { choice, resolved, setChoice } = useTheme()
  const { dragging } = useGlobalIngest()
  const install = useInstallPrompt()
  useFfmpegPrefetch()

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <Header themeChoice={choice} onThemeChange={setChoice} install={install} />
      <SessionBar />
      <main className="flex-1">
        <Dashboard theme={resolved} />
      </main>
      <Footer />
      <DropOverlay visible={dragging} />
      <CommandPalette />
    </div>
  )
}
