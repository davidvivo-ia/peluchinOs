import { create } from 'zustand'
import type { LogEntry, LogLevel } from './types'
import { LOG_LEVEL_RANK } from './types'

const BUFFER_SIZE = 1000

interface LogState {
  entries: LogEntry[]
  paused: boolean
  minLevel: LogLevel
  append: (entry: LogEntry) => void
  clear: () => void
  setPaused: (paused: boolean) => void
  setMinLevel: (level: LogLevel) => void
}

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  paused: false,
  minLevel: 'trace',
  append: (entry) =>
    set((s) => {
      if (s.paused) return s
      if (LOG_LEVEL_RANK[entry.level] < LOG_LEVEL_RANK[s.minLevel]) return s
      const next =
        s.entries.length >= BUFFER_SIZE
          ? s.entries.slice(s.entries.length - BUFFER_SIZE + 1)
          : s.entries.slice()
      next.push(entry)
      return { entries: next }
    }),
  clear: () => set({ entries: [] }),
  setPaused: (paused) => set({ paused }),
  setMinLevel: (minLevel) => set({ minLevel }),
}))

export const BUFFER_LIMIT = BUFFER_SIZE
