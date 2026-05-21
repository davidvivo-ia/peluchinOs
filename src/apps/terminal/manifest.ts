import type { AppManifest } from '../types'
import { Terminal } from './Terminal'

export const terminalManifest: AppManifest = {
  id: 'terminal',
  name: 'Terminal',
  icon: '⌨',
  component: Terminal,
  defaultSize: { width: 640, height: 400 },
  minSize: { width: 360, height: 220 },
  resizable: true,
  showInStartMenu: true,
}
