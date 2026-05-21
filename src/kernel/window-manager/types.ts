export interface Position {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface WindowState {
  id: string
  appId: string
  title: string
  icon?: string
  position: Position
  size: Size
  minSize: Size
  preMaximize?: { position: Position; size: Size }
  zIndex: number
  focused: boolean
  minimized: boolean
  maximized: boolean
  resizable: boolean
  initData?: unknown
}

export interface OpenWindowInput {
  appId: string
  title: string
  icon?: string
  defaultSize?: Size
  minSize?: Size
  resizable?: boolean
  position?: Position
  initData?: unknown
}
