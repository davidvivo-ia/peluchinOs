import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { sounds } from '../audio'
import { createLogger } from '../logger'
import type { OpenWindowInput, Position, Size, WindowState } from './types'

const log = createLogger('wm')

interface WMState {
  windows: WindowState[]
  topZ: number
  open: (input: OpenWindowInput) => string
  close: (id: string) => void
  focus: (id: string) => void
  move: (id: string, position: Position) => void
  resize: (id: string, size: Size) => void
  minimize: (id: string) => void
  restore: (id: string) => void
  toggleMaximize: (id: string) => void
}

const cascadeOffset = (count: number): Position => ({
  x: 56 + (count % 8) * 28,
  y: 36 + (count % 8) * 28,
})

export const useWMStore = create<WMState>((set, get) => ({
  windows: [],
  topZ: 10,
  open: (input) => {
    const id = nanoid(8)
    const topZ = get().topZ + 1
    const position = input.position ?? cascadeOffset(get().windows.length)
    const size = input.defaultSize ?? { width: 520, height: 360 }
    const minSize = input.minSize ?? { width: 240, height: 160 }
    const next: WindowState = {
      id,
      appId: input.appId,
      title: input.title,
      icon: input.icon,
      position,
      size,
      minSize,
      zIndex: topZ,
      focused: true,
      minimized: false,
      maximized: false,
      resizable: input.resizable ?? true,
      initData: input.initData,
    }
    set((s) => ({
      windows: s.windows.map((w) => ({ ...w, focused: false })).concat(next),
      topZ,
    }))
    log.info(`window opened: ${input.appId}`, { id, title: input.title })
    sounds.windowOpen()
    return id
  },
  close: (id) => {
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) }))
    sounds.windowClose()
    log.debug('window closed', { id })
  },
  focus: (id) =>
    set((s) => {
      const target = s.windows.find((w) => w.id === id)
      if (!target) return s
      const topZ = s.topZ + 1
      return {
        windows: s.windows.map((w) =>
          w.id === id
            ? { ...w, focused: true, zIndex: topZ, minimized: false }
            : { ...w, focused: false },
        ),
        topZ,
      }
    }),
  move: (id, position) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, position } : w)),
    })),
  resize: (id, size) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, size } : w)),
    })),
  minimize: (id) => {
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true, focused: false } : w)),
    }))
    log.trace('window minimized', { id })
  },
  restore: (id) =>
    set((s) => {
      const topZ = s.topZ + 1
      return {
        windows: s.windows.map((w) =>
          w.id === id
            ? { ...w, minimized: false, focused: true, zIndex: topZ }
            : { ...w, focused: false },
        ),
        topZ,
      }
    }),
  toggleMaximize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w
        if (w.maximized && w.preMaximize) {
          return {
            ...w,
            maximized: false,
            position: w.preMaximize.position,
            size: w.preMaximize.size,
            preMaximize: undefined,
          }
        }
        return {
          ...w,
          maximized: true,
          preMaximize: { position: w.position, size: w.size },
        }
      }),
    })),
}))
