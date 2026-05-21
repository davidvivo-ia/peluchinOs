import type { AppManifest } from '../types'
import { FileExplorer } from './FileExplorer'

export const fileExplorerManifest: AppManifest = {
  id: 'file-explorer',
  name: 'File Explorer',
  icon: '🗂',
  component: FileExplorer,
  defaultSize: { width: 720, height: 460 },
  minSize: { width: 480, height: 320 },
  resizable: true,
  showInStartMenu: true,
}
