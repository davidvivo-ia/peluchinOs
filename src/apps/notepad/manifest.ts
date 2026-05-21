import type { AppManifest } from '../types'
import { Notepad } from './Notepad'

export const notepadManifest: AppManifest = {
  id: 'notepad',
  name: 'Notepad',
  icon: '📝',
  component: Notepad,
  defaultSize: { width: 560, height: 380 },
  minSize: { width: 320, height: 200 },
  resizable: true,
  showInStartMenu: true,
}
