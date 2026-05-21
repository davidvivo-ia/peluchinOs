export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const

export const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
}

export type LogSource = string

export interface LogEntry {
  id: string
  ts: number
  level: LogLevel
  source: LogSource
  message: string
  payload?: unknown
}
