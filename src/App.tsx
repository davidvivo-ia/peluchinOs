import { useEffect, useState } from 'react'
import { BootScreen } from './shell/boot/BootScreen'
import { Desktop } from './shell/desktop/Desktop'

type SystemState = 'booting' | 'ready'

const BOOT_DURATION_MS = 3200

export function App() {
  const [state, setState] = useState<SystemState>('booting')

  useEffect(() => {
    const id = setTimeout(() => setState('ready'), BOOT_DURATION_MS)
    return () => clearTimeout(id)
  }, [])

  return state === 'booting' ? <BootScreen /> : <Desktop />
}
