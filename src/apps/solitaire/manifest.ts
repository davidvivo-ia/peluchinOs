import type { AppManifest } from '../types'
import { Solitaire } from './Solitaire'

export const solitaireManifest: AppManifest = {
  id: 'solitaire',
  name: 'Solitaire',
  icon: '🂡',
  component: Solitaire,
  defaultSize: { width: 700, height: 540 },
  minSize: { width: 560, height: 420 },
  resizable: true,
  showInStartMenu: true,
}
