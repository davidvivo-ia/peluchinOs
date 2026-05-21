import { useEffect, useState } from 'react'
import { eventViewerManifest } from './apps/event-viewer/manifest'
import { createLogger, installGlobalCapture, logger } from './kernel/logger'
import { useWMStore } from './kernel/window-manager'
import { BootScreen } from './shell/boot/BootScreen'
import { Desktop } from './shell/desktop/Desktop'

type SystemState = 'booting' | 'ready'

const BOOT_DURATION_MS = 3400
const sys = createLogger('system')

export function App() {
  const [state, setState] = useState<SystemState>('booting')

  useEffect(() => {
    installGlobalCapture()
    logger.info('peluchinOs starting')
    const id = setTimeout(() => {
      sys.info('shell ready')
      setState('ready')
    }, BOOT_DURATION_MS)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (state !== 'ready') return
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
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [state])

  return state === 'booting' ? <BootScreen /> : <Desktop />
}
