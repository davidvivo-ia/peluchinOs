import { create } from 'zustand'

export type SystemMode = 'booting' | 'ready' | 'bsod' | 'shutdown'

interface SystemState {
  mode: SystemMode
  setMode: (mode: SystemMode) => void
  requestBsod: () => void
  requestShutdown: () => void
  requestReboot: () => void
}

export const useSystemStore = create<SystemState>((set) => ({
  mode: 'booting',
  setMode: (mode) => set({ mode }),
  requestBsod: () => set({ mode: 'bsod' }),
  requestShutdown: () => set({ mode: 'shutdown' }),
  requestReboot: () => {
    setTimeout(() => location.reload(), 200)
  },
}))
