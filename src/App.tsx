import { useEffect } from 'react'
import { eventViewerManifest } from './apps/event-viewer/manifest'
import { installAudio, sounds } from './kernel/audio'
import { createLogger, installGlobalCapture, logger } from './kernel/logger'
import { useSystemStore } from './kernel/system'
import { useWMStore } from './kernel/window-manager'
import { BootScreen } from './shell/boot/BootScreen'
import { Bsod } from './shell/bsod/Bsod'
import { Desktop } from './shell/desktop/Desktop'
import { ShutdownScreen } from './shell/shutdown/ShutdownScreen'

const sys = createLogger('system')

export function App() {
  const mode = useSystemStore((s) => s.mode)
  const setMode = useSystemStore((s) => s.setMode)

  useEffect(() => {
    installGlobalCapture()
    installAudio()
    logger.info('peluchinOs starting')
  }, [])

  useEffect(() => {
    if (mode !== 'ready') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault()
        const variants = [
          () => sys.trace('trace probe', { rng: Math.random() }),
          () => sys.debug('debug probe', { rng: Math.random() }),
          () => sys.info('info probe'),
          () => sys.warn('warn probe — synthetic'),
          () => sys.error('error probe — synthetic'),
        ]
        variants[Math.floor(Math.random() * variants.length)]()
      }
      if (e.key === 'F3') {
        e.preventDefault()
        useWMStore.getState().open({
          appId: eventViewerManifest.id,
          title: eventViewerManifest.name,
          icon: eventViewerManifest.icon,
          defaultSize: eventViewerManifest.defaultSize,
          minSize: eventViewerManifest.minSize,
          resizable: eventViewerManifest.resizable,
        })
      }
      if (e.key === 'Delete' && e.ctrlKey && e.altKey) {
        e.preventDefault()
        sys.fatal('user triggered BSOD via Ctrl+Alt+Del')
        setMode('bsod')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mode, setMode])

  if (mode === 'booting') {
    return (
      <BootScreen
        onComplete={() => {
          sys.info('shell ready')
          sounds.startup()
          setMode('ready')
        }}
      />
    )
  }
  if (mode === 'bsod') return <Bsod onDismiss={() => setMode('booting')} />
  if (mode === 'shutdown') return <ShutdownScreen />
  return <Desktop />
}
