import { nanoid } from 'nanoid'
import { useLogStore } from './store'
import type { LogLevel, LogSource } from './types'

const nativeConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
}

export function getNativeConsole() {
  return nativeConsole
}

let mirrorToConsole = import.meta.env.DEV

export function setMirrorToConsole(value: boolean) {
  mirrorToConsole = value
}

function emit(level: LogLevel, source: LogSource, message: string, payload?: unknown) {
  useLogStore.getState().append({
    id: nanoid(8),
    ts: Date.now(),
    level,
    source,
    message,
    payload,
  })

  if (!mirrorToConsole) return
  const fn =
    level === 'error' || level === 'fatal'
      ? nativeConsole.error
      : level === 'warn'
        ? nativeConsole.warn
        : level === 'debug' || level === 'trace'
          ? nativeConsole.debug
          : nativeConsole.info
  if (payload !== undefined) fn(`[${source}] ${message}`, payload)
  else fn(`[${source}] ${message}`)
}

export interface Logger {
  trace: (msg: string, payload?: unknown) => void
  debug: (msg: string, payload?: unknown) => void
  info: (msg: string, payload?: unknown) => void
  warn: (msg: string, payload?: unknown) => void
  error: (msg: string, payload?: unknown) => void
  fatal: (msg: string, payload?: unknown) => void
  scope: (sub: LogSource) => Logger
}

export function createLogger(source: LogSource): Logger {
  return {
    trace: (msg, p) => emit('trace', source, msg, p),
    debug: (msg, p) => emit('debug', source, msg, p),
    info: (msg, p) => emit('info', source, msg, p),
    warn: (msg, p) => emit('warn', source, msg, p),
    error: (msg, p) => emit('error', source, msg, p),
    fatal: (msg, p) => emit('fatal', source, msg, p),
    scope: (sub) => createLogger(`${source}:${sub}`),
  }
}

export const logger = createLogger('kernel')
