import type { AppManifest } from '../types'
import { Paint } from './Paint'

export const paintManifest: AppManifest = {
  id: 'paint',
  name: 'Paint',
  icon: '🎨',
  component: Paint,
  defaultSize: { width: 780, height: 560 },
  minSize: { width: 520, height: 400 },
  resizable: true,
  showInStartMenu: true,
}
