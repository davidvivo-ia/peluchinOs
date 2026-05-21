import type { Size, WindowState } from '@/kernel/window-manager'
import type { ComponentType } from 'react'

export interface AppManifest {
  id: string
  name: string
  icon: string
  component: ComponentType<{ window: WindowState }>
  defaultSize?: Size
  minSize?: Size
  resizable?: boolean
  showInStartMenu?: boolean
}
