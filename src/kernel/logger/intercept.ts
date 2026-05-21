import { createLogger, getNativeConsole } from './logger'

let installed = false

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return a.stack ?? a.message
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

export function installGlobalCapture() {
  if (installed) return
  installed = true

  const native = getNativeConsole()
  const consoleLog = createLogger('console')

  console.log = (...args: unknown[]) => {
    native.log(...args)
    consoleLog.info(format(args))
  }
  console.info = (...args: unknown[]) => {
    native.info(...args)
    consoleLog.info(format(args))
  }
  console.warn = (...args: unknown[]) => {
    native.warn(...args)
    consoleLog.warn(format(args))
  }
  console.error = (...args: unknown[]) => {
    native.error(...args)
    consoleLog.error(format(args))
  }
  console.debug = (...args: unknown[]) => {
    native.debug(...args)
    consoleLog.debug(format(args))
  }

  const windowLog = createLogger('window')

  window.addEventListener('error', (e) => {
    windowLog.error(`Uncaught: ${e.message}`, {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    windowLog.error(`Unhandled rejection: ${String(e.reason)}`, { reason: e.reason })
  })
}
