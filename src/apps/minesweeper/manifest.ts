import type { AppManifest } from '../types'
import { Minesweeper } from './Minesweeper'

export const minesweeperManifest: AppManifest = {
  id: 'minesweeper',
  name: 'Minesweeper',
  icon: '💣',
  component: Minesweeper,
  defaultSize: { width: 240, height: 320 },
  minSize: { width: 220, height: 280 },
  resizable: false,
  showInStartMenu: true,
}
