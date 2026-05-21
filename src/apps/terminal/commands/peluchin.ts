import { apps, getApp } from '@/apps/registry'
import { getHostInfo, isTauri, listHostDir, readHostFile, writeHostFile } from '@/kernel/host'
import { useLogStore } from '@/kernel/logger'
import { useWMStore } from '@/kernel/window-manager'
import type { Command } from '../types'

function fmtTs(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

const dmesg: Command = {
  name: 'dmesg',
  aliases: ['journalctl'],
  description: 'Print the kernel ring buffer',
  usage: 'dmesg [-l <level>] [-n <count>] [-f <source>]',
  run: (ctx) => {
    let level: string | undefined
    let n: number | undefined
    let source: string | undefined
    for (let i = 0; i < ctx.args.length; i++) {
      if (ctx.args[i] === '-l') level = ctx.args[++i]
      else if (ctx.args[i] === '-n') n = Number.parseInt(ctx.args[++i] ?? '0', 10)
      else if (ctx.args[i] === '-f') source = ctx.args[++i]
    }
    const rank: Record<string, number> = {
      trace: 0,
      debug: 1,
      info: 2,
      warn: 3,
      error: 4,
      fatal: 5,
    }
    const minRank = level ? (rank[level] ?? 0) : 0
    let entries = useLogStore.getState().entries
    entries = entries.filter((e) => rank[e.level] >= minRank)
    if (source) entries = entries.filter((e) => e.source === source)
    if (n) entries = entries.slice(-n)
    const lines = entries.map(
      (e) =>
        `${fmtTs(e.ts)} ${e.level.toUpperCase().padEnd(5)} ${e.source.padEnd(14)} ${e.message}`,
    )
    return { stdout: `${lines.join('\n')}\n`, exitCode: 0 }
  },
}

const loggerCmd: Command = {
  name: 'logger',
  description: 'Write a message to the kernel log',
  usage: 'logger [-p <level>] [-t <source>] <message>...',
  run: (ctx) => {
    let level = 'info'
    let source = 'user'
    const text: string[] = []
    for (let i = 0; i < ctx.args.length; i++) {
      if (ctx.args[i] === '-p') level = ctx.args[++i]
      else if (ctx.args[i] === '-t') source = ctx.args[++i]
      else text.push(ctx.args[i])
    }
    if (text.length === 0) return { stderr: 'logger: missing message', exitCode: 1 }
    const message = text.join(' ')
    ctx.log.scope(source)[level as 'info'](message)
    return { exitCode: 0 }
  },
}

const ps: Command = {
  name: 'ps',
  description: 'List running windows (processes)',
  usage: 'ps [-a]',
  run: () => {
    const windows = useWMStore.getState().windows
    const lines = ['  PID APP             TITLE                       STATE     Z']
    for (const w of windows) {
      const state = w.minimized ? 'MIN' : w.maximized ? 'MAX' : w.focused ? 'FOC' : 'BG '
      lines.push(
        `  ${w.id.padEnd(4)} ${w.appId.padEnd(16)}${w.title.padEnd(28)}${state.padEnd(10)}${w.zIndex}`,
      )
    }
    lines.push('')
    lines.push(`${windows.length} window(s)`)
    return { stdout: `${lines.join('\n')}\n`, exitCode: 0 }
  },
}

const kill: Command = {
  name: 'kill',
  description: 'Close a window by PID',
  usage: 'kill <pid>...',
  run: (ctx) => {
    if (ctx.args.length === 0) return { stderr: 'kill: missing pid', exitCode: 1 }
    const wm = useWMStore.getState()
    let killed = 0
    for (const pid of ctx.args) {
      if (wm.windows.some((w) => w.id === pid)) {
        wm.close(pid)
        killed++
      } else {
        return { stderr: `kill: ${pid}: no such process`, exitCode: 1 }
      }
    }
    return { stdout: `killed ${killed} window(s)\n`, exitCode: 0 }
  },
}

const appsCmd: Command = {
  name: 'apps',
  description: 'List installed apps',
  run: () => {
    const lines = ['ID                NAME']
    for (const a of apps) {
      lines.push(`${a.id.padEnd(18)}${a.name}`)
    }
    return { stdout: `${lines.join('\n')}\n`, exitCode: 0 }
  },
}

const start: Command = {
  name: 'start',
  aliases: ['open'],
  description: 'Launch an app by id',
  usage: 'start <app-id>',
  run: (ctx) => {
    if (ctx.args.length === 0) return { stderr: 'start: missing app id', exitCode: 1 }
    const app = getApp(ctx.args[0])
    if (!app) return { stderr: `start: unknown app: ${ctx.args[0]}`, exitCode: 1 }
    ctx.terminal.open(app.id)
    return { stdout: `launched ${app.name}\n`, exitCode: 0 }
  },
}

const reboot: Command = {
  name: 'reboot',
  description: 'Restart peluchinOs',
  run: (ctx) => {
    ctx.terminal.reboot()
    return { exitCode: 0 }
  },
}

const shutdown: Command = {
  name: 'shutdown',
  aliases: ['poweroff', 'halt'],
  description: 'Shut down peluchinOs',
  run: (ctx) => {
    ctx.terminal.shutdown()
    return { exitCode: 0 }
  },
}

const history: Command = {
  name: 'history',
  description: 'Show terminal command history (last N entries)',
  run: (ctx) => {
    const raw = ctx.env.__HISTORY__ ?? '[]'
    try {
      const arr = JSON.parse(raw) as string[]
      const lines = arr.map((cmd, i) => `${String(i + 1).padStart(5)}  ${cmd}`)
      return { stdout: `${lines.join('\n')}\n`, exitCode: 0 }
    } catch {
      return { stdout: '', exitCode: 0 }
    }
  },
}

const host: Command = {
  name: 'host',
  description: 'Show host system info (Tauri only outside browser)',
  usage: 'host [info|read|write|ls] [args...]',
  run: async (ctx) => {
    const sub = ctx.args[0] ?? 'info'
    if (sub === 'info') {
      try {
        const info = await getHostInfo()
        const lines = [
          `tauri:        ${isTauri()}`,
          `os:           ${info.os}`,
          `arch:         ${info.arch}`,
          `family:       ${info.family}`,
          `hostname:     ${info.hostname}`,
          `cwd:          ${info.cwd}`,
          `tauri version: ${info.tauri_version}`,
          `epoch (ms):   ${info.epoch_ms}`,
        ]
        return { stdout: `${lines.join('\n')}\n`, exitCode: 0 }
      } catch (e) {
        return { stderr: `host: ${(e as Error).message}`, exitCode: 1 }
      }
    }
    if (sub === 'ls') {
      const path = ctx.args[1] ?? '.'
      try {
        const entries = await listHostDir(path)
        const lines = entries.map(
          (e) => `${e.is_dir ? 'd' : '-'}  ${String(e.size).padStart(8)}  ${e.name}`,
        )
        return { stdout: `${lines.join('\n')}\n`, exitCode: 0 }
      } catch (e) {
        return { stderr: `host ls: ${(e as Error).message}`, exitCode: 1 }
      }
    }
    if (sub === 'read') {
      const path = ctx.args[1]
      if (!path) return { stderr: 'host read: missing path', exitCode: 1 }
      try {
        const r = await readHostFile(path)
        return { stdout: r.content, exitCode: 0 }
      } catch (e) {
        return { stderr: `host read: ${(e as Error).message}`, exitCode: 1 }
      }
    }
    if (sub === 'write') {
      const path = ctx.args[1]
      if (!path) return { stderr: 'host write: missing path', exitCode: 1 }
      const text = ctx.stdin || ctx.args.slice(2).join(' ')
      try {
        const n = await writeHostFile(path, text)
        return { stdout: `wrote ${n} bytes to ${path}\n`, exitCode: 0 }
      } catch (e) {
        return { stderr: `host write: ${(e as Error).message}`, exitCode: 1 }
      }
    }
    return { stderr: `host: unknown sub-command: ${sub}`, exitCode: 1 }
  },
}

export const PELUCHIN_COMMANDS: Command[] = [
  dmesg,
  loggerCmd,
  ps,
  kill,
  appsCmd,
  start,
  reboot,
  shutdown,
  history,
  host,
]
