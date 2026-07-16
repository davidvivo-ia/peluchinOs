import type { Command } from '../types'
import { listCommands } from './registry'

const APP_START_TIME = Date.now()

const help: Command = {
  name: 'help',
  aliases: ['?'],
  description: 'Show available commands',
  usage: 'help [command]',
  run: (ctx) => {
    if (ctx.args[0]) {
      const cmd = listCommands().find(
        (c) => c.name === ctx.args[0] || (c.aliases ?? []).includes(ctx.args[0]),
      )
      if (!cmd) return { stderr: `help: no help for "${ctx.args[0]}"`, exitCode: 1 }
      const lines = [
        `${cmd.name} — ${cmd.description}`,
        cmd.usage ? `Usage: ${cmd.usage}` : '',
        cmd.aliases?.length ? `Aliases: ${cmd.aliases.join(', ')}` : '',
      ].filter(Boolean)
      return { stdout: `${lines.join('\n')}\n`, exitCode: 0 }
    }
    const all = listCommands()
    const lines = ['Available commands (use "help <cmd>" for details):', '']
    const width = 14
    const cols = 4
    const names = all.map((c) => c.name.padEnd(width))
    for (let i = 0; i < names.length; i += cols) {
      lines.push(`  ${names.slice(i, i + cols).join('')}`)
    }
    lines.push('')
    lines.push(`Total: ${all.length} commands.`)
    return { stdout: `${lines.join('\n')}\n`, exitCode: 0 }
  },
}

const ver: Command = {
  name: 'ver',
  description: 'Show OS version',
  run: () => ({ stdout: 'peluchinOs [Version 1.0.0-fluffy]\n', exitCode: 0 }),
}

const uname: Command = {
  name: 'uname',
  description: 'Print system information',
  usage: 'uname [-a]',
  run: (ctx) => {
    const all = ctx.args.includes('-a')
    if (all) {
      return {
        stdout: 'Linux peluchinos 6.18.5-peluchin #1 SMP fluffy x86_64 GNU/peluchin\n',
        exitCode: 0,
      }
    }
    return { stdout: 'Linux\n', exitCode: 0 }
  },
}

const hostname: Command = {
  name: 'hostname',
  description: 'Show hostname',
  run: async (ctx) => {
    try {
      const txt = await ctx.vfs.readFile('/etc/hostname')
      return { stdout: txt.endsWith('\n') ? txt : `${txt}\n`, exitCode: 0 }
    } catch {
      return { stdout: 'peluchinos\n', exitCode: 0 }
    }
  },
}

const whoami: Command = {
  name: 'whoami',
  description: 'Show current user',
  run: (ctx) => ({ stdout: `${ctx.env.USER ?? 'peluchin'}\n`, exitCode: 0 }),
}

const date: Command = {
  name: 'date',
  description: 'Show current date and time',
  run: () => ({ stdout: `${new Date().toString()}\n`, exitCode: 0 }),
}

const time: Command = {
  name: 'time',
  description: 'Show current time',
  run: () => {
    const d = new Date()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return { stdout: `${hh}:${mm}:${ss}\n`, exitCode: 0 }
  },
}

const uptime: Command = {
  name: 'uptime',
  description: 'Show how long peluchinOs has been running',
  run: () => {
    const ms = Date.now() - APP_START_TIME
    const sec = Math.floor(ms / 1000)
    const hh = Math.floor(sec / 3600)
    const mm = Math.floor((sec % 3600) / 60)
    const ss = sec % 60
    return {
      stdout: ` ${new Date().toLocaleTimeString()} up ${hh}h ${mm}m ${ss}s, 1 user, load average: 0.04, 0.02, 0.00\n`,
      exitCode: 0,
    }
  },
}

const env: Command = {
  name: 'env',
  description: 'List environment variables',
  run: (ctx) => {
    const lines = Object.entries(ctx.env)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
    return { stdout: `${lines.join('\n')}\n`, exitCode: 0 }
  },
}

const setCmd: Command = {
  name: 'set',
  aliases: ['export'],
  description: 'Set environment variable (set NAME=value)',
  usage: 'set NAME=value',
  run: (ctx) => {
    if (ctx.args.length === 0) {
      const lines = Object.entries(ctx.env)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
      return { stdout: `${lines.join('\n')}\n`, exitCode: 0 }
    }
    const change: Record<string, string> = {}
    for (const arg of ctx.args) {
      const idx = arg.indexOf('=')
      if (idx < 0) return { stderr: `set: invalid assignment: ${arg}`, exitCode: 1 }
      change[arg.slice(0, idx)] = arg.slice(idx + 1)
    }
    return { exitCode: 0, envChange: change }
  },
}

const which: Command = {
  name: 'which',
  description: 'Show path of a command',
  usage: 'which <command>',
  run: (ctx) => {
    if (ctx.args.length === 0) return { stderr: 'which: missing operand', exitCode: 1 }
    const all = listCommands()
    const lines: string[] = []
    let anyMissing = false
    for (const arg of ctx.args) {
      const hit = all.find((c) => c.name === arg || (c.aliases ?? []).includes(arg))
      if (hit) lines.push(`/usr/bin/${hit.name}`)
      else {
        lines.push(`which: no ${arg} in /usr/bin`)
        anyMissing = true
      }
    }
    return { stdout: `${lines.join('\n')}\n`, exitCode: anyMissing ? 1 : 0 }
  },
}

const cls: Command = {
  name: 'cls',
  aliases: ['clear'],
  description: 'Clear the screen',
  run: (ctx) => {
    ctx.terminal.clear()
    return { exitCode: 0 }
  },
}

const exit: Command = {
  name: 'exit',
  aliases: ['quit', 'logout'],
  description: 'Close the terminal',
  run: (ctx) => {
    ctx.terminal.exit()
    return { exitCode: 0 }
  },
}

const sleep: Command = {
  name: 'sleep',
  description: 'Pause for N seconds',
  usage: 'sleep <seconds>',
  run: async (ctx) => {
    const n = Number.parseFloat(ctx.args[0] ?? '1')
    if (Number.isNaN(n)) return { stderr: 'sleep: bad number', exitCode: 1 }
    await new Promise((r) => setTimeout(r, Math.max(0, n) * 1000))
    return { exitCode: 0 }
  },
}

const seq: Command = {
  name: 'seq',
  description: 'Print a sequence of numbers',
  usage: 'seq <start> [<end>]',
  run: (ctx) => {
    const nums = ctx.args.map((a) => Number.parseInt(a, 10))
    if (nums.some(Number.isNaN)) return { stderr: 'seq: bad number', exitCode: 1 }
    let start = 1
    let end = 1
    if (nums.length === 1) {
      end = nums[0]
    } else if (nums.length >= 2) {
      start = nums[0]
      end = nums[1]
    }
    const out: number[] = []
    if (start <= end) for (let i = start; i <= end; i++) out.push(i)
    else for (let i = start; i >= end; i--) out.push(i)
    return { stdout: `${out.join('\n')}\n`, exitCode: 0 }
  },
}

const yesCmd: Command = {
  name: 'yes',
  description: 'Print y (or argument) some times',
  usage: 'yes [text] [-n N]',
  run: (ctx) => {
    let n = 5
    const text: string[] = []
    for (let i = 0; i < ctx.args.length; i++) {
      if (ctx.args[i] === '-n') n = Number.parseInt(ctx.args[++i] ?? '5', 10)
      else text.push(ctx.args[i])
    }
    const value = text.length === 0 ? 'y' : text.join(' ')
    return { stdout: `${Array(Math.max(1, n)).fill(value).join('\n')}\n`, exitCode: 0 }
  },
}

const trueCmd: Command = {
  name: 'true',
  description: 'Exit with status 0',
  run: () => ({ exitCode: 0 }),
}

const falseCmd: Command = {
  name: 'false',
  description: 'Exit with status 1',
  run: () => ({ exitCode: 1 }),
}

const banner: Command = {
  name: 'banner',
  description: 'Print the peluchinOs banner',
  run: () => ({
    stdout:
      '\n' +
      '   ____  ____  __    _  _   ___  _   _  ____  __ _   __   ___\n' +
      '  (  _ \\(  __)(  )  / )( \\ / __)( )_( )(_  _)(  ( \\ /  \\ / __)\n' +
      '   ) __/ ) _) / (_/\\) \\/ (( (__  ) _ (  _)(_ /    /(  O )\\__ \\\n' +
      '  (__)  (____)\\____/\\____/ \\___)(_) (_)(____)\\_)__) \\__/ (___/\n' +
      '\n' +
      '   peluchinOs 1.0.0-fluffy — Linux 6.18.5-peluchin — type `help` to begin\n\n',
    exitCode: 0,
  }),
}

const cowsay: Command = {
  name: 'cowsay',
  description: 'A peluchin says something',
  usage: 'cowsay <text>',
  run: (ctx) => {
    const text = ctx.args.length === 0 ? ctx.stdin.trim() || 'moo' : ctx.args.join(' ')
    const top = ` ${'_'.repeat(text.length + 2)}`
    const mid = `< ${text} >`
    const bot = ` ${'-'.repeat(text.length + 2)}`
    const cow = `
        \\   ʕ•ᴥ•ʔ
         \\  / o o \\
            \\__ ⌣__/
            /     \\
           ( peluchin )
`
    return { stdout: `${top}\n${mid}\n${bot}${cow}\n`, exitCode: 0 }
  },
}

export const SYSTEM_COMMANDS: Command[] = [
  help,
  ver,
  uname,
  hostname,
  whoami,
  date,
  time,
  uptime,
  env,
  setCmd,
  which,
  cls,
  exit,
  sleep,
  seq,
  yesCmd,
  trueCmd,
  falseCmd,
  banner,
  cowsay,
]
