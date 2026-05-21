import { basename, dirname, resolve, toDosPath } from '@/kernel/vfs'
import type { Command } from '../types'

function fmtSize(n: number): string {
  if (n < 1024) return `${n}`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`
  return `${(n / 1024 / 1024).toFixed(1)}M`
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy}  ${hh}:${mi}`
}

const dir: Command = {
  name: 'dir',
  description: 'List directory contents (DOS-style)',
  usage: 'dir [path] [/w]',
  run: async (ctx) => {
    const wide = ctx.args.includes('/w') || ctx.args.includes('/W')
    const positional = ctx.args.filter((a) => !a.startsWith('/'))
    const target = positional[0] ? resolve(ctx.cwd, positional[0]) : ctx.cwd
    const entries = await ctx.vfs.readdir(target)
    const lines: string[] = []
    lines.push(` Directory of ${toDosPath(target)}`)
    lines.push('')
    if (wide) {
      const cols = 4
      for (let i = 0; i < entries.length; i += cols) {
        const row = entries
          .slice(i, i + cols)
          .map((e) => (e.type === 'directory' ? `[${e.name}]` : e.name).padEnd(18))
          .join('')
        lines.push(row)
      }
    } else {
      let totalFiles = 0
      let totalBytes = 0
      for (const e of entries) {
        const left = `${fmtDate(e.mtime)}    `
        const mid =
          e.type === 'directory' ? '<DIR>          ' : `${fmtSize(e.size).padStart(10)}     `
        lines.push(`${left}${mid}${e.name}`)
        if (e.type === 'file') {
          totalFiles++
          totalBytes += e.size
        }
      }
      const dirs = entries.filter((e) => e.type === 'directory').length
      lines.push('')
      lines.push(`               ${totalFiles} File(s)        ${totalBytes} bytes`)
      lines.push(`               ${dirs} Dir(s)`)
    }
    return { stdout: `${lines.join('\n')}\n`, exitCode: 0 }
  },
}

const ls: Command = {
  name: 'ls',
  description: 'List directory contents (POSIX-style)',
  usage: 'ls [-l] [-a] [-1] [path...]',
  run: async (ctx) => {
    const flags = new Set<string>()
    const positional: string[] = []
    for (const a of ctx.args) {
      if (a.startsWith('-') && a.length > 1) {
        for (const ch of a.slice(1)) flags.add(ch)
      } else {
        positional.push(a)
      }
    }
    const targets = positional.length === 0 ? [ctx.cwd] : positional.map((p) => resolve(ctx.cwd, p))
    const out: string[] = []
    for (const target of targets) {
      if (targets.length > 1) out.push(`${target}:`)
      const stat = await ctx.vfs.stat(target).catch(() => null)
      if (!stat) {
        out.push(`ls: cannot access '${target}': No such file or directory`)
        continue
      }
      if (stat.type === 'file') {
        out.push(target)
        continue
      }
      let entries = await ctx.vfs.readdir(target)
      if (!flags.has('a')) entries = entries.filter((e) => !e.name.startsWith('.'))
      if (flags.has('l')) {
        for (const e of entries) {
          const t = e.type === 'directory' ? 'd' : '-'
          out.push(
            `${t}rw-r--r-- 1 peluchin peluchin ${String(e.size).padStart(6)} ${fmtDate(e.mtime)} ${e.name}`,
          )
        }
      } else if (flags.has('1')) {
        for (const e of entries) out.push(e.name)
      } else {
        const names = entries.map((e) => (e.type === 'directory' ? `${e.name}/` : e.name))
        out.push(names.join('  '))
      }
    }
    return { stdout: `${out.join('\n')}\n`, exitCode: 0 }
  },
}

const cd: Command = {
  name: 'cd',
  aliases: ['chdir'],
  description: 'Change current directory',
  usage: 'cd [path]',
  run: async (ctx) => {
    const target = ctx.args[0] ?? '/home/peluchin'
    const resolved = resolve(ctx.cwd, target)
    const stat = await ctx.vfs.stat(resolved).catch(() => null)
    if (!stat) return { stderr: `cd: ${target}: No such file or directory`, exitCode: 1 }
    if (stat.type !== 'directory') return { stderr: `cd: ${target}: Not a directory`, exitCode: 1 }
    return { cwdChange: resolved, exitCode: 0 }
  },
}

const pwd: Command = {
  name: 'pwd',
  description: 'Print working directory',
  run: (ctx) => ({ stdout: `${ctx.cwd}\n`, exitCode: 0 }),
}

const cat: Command = {
  name: 'cat',
  aliases: ['type'],
  description: 'Print file contents',
  usage: 'cat <file>...',
  run: async (ctx) => {
    if (ctx.args.length === 0 && ctx.stdin) return { stdout: ctx.stdin, exitCode: 0 }
    if (ctx.args.length === 0) return { stderr: 'cat: missing operand', exitCode: 1 }
    const parts: string[] = []
    for (const f of ctx.args) {
      const path = resolve(ctx.cwd, f)
      try {
        parts.push(await ctx.vfs.readFile(path))
      } catch (e) {
        return { stderr: `cat: ${f}: ${(e as Error).message}`, exitCode: 1 }
      }
    }
    return { stdout: parts.join(''), exitCode: 0 }
  },
}

const echo: Command = {
  name: 'echo',
  description: 'Echo arguments to stdout',
  usage: 'echo [-n] <text>',
  run: (ctx) => {
    const noNewline = ctx.args[0] === '-n'
    const text = (noNewline ? ctx.args.slice(1) : ctx.args).join(' ')
    return { stdout: text + (noNewline ? '' : '\n'), exitCode: 0 }
  },
}

const mkdir: Command = {
  name: 'mkdir',
  aliases: ['md'],
  description: 'Create a directory',
  usage: 'mkdir [-p] <path>...',
  run: async (ctx) => {
    const recursive = ctx.args.includes('-p')
    const targets = ctx.args.filter((a) => a !== '-p')
    if (targets.length === 0) return { stderr: 'mkdir: missing operand', exitCode: 1 }
    for (const t of targets) {
      try {
        await ctx.vfs.mkdir(resolve(ctx.cwd, t), { recursive })
      } catch (e) {
        return { stderr: `mkdir: ${t}: ${(e as Error).message}`, exitCode: 1 }
      }
    }
    return { exitCode: 0 }
  },
}

const rmdir: Command = {
  name: 'rmdir',
  aliases: ['rd'],
  description: 'Remove an empty directory',
  usage: 'rmdir <path>...',
  run: async (ctx) => {
    if (ctx.args.length === 0) return { stderr: 'rmdir: missing operand', exitCode: 1 }
    for (const t of ctx.args) {
      try {
        await ctx.vfs.rmdir(resolve(ctx.cwd, t))
      } catch (e) {
        return { stderr: `rmdir: ${t}: ${(e as Error).message}`, exitCode: 1 }
      }
    }
    return { exitCode: 0 }
  },
}

const rm: Command = {
  name: 'rm',
  aliases: ['del', 'erase'],
  description: 'Remove files or directories',
  usage: 'rm [-r] [-f] <path>...',
  run: async (ctx) => {
    const recursive = ctx.args.some((a) => a === '-r' || a === '-rf' || a === '-R')
    const force = ctx.args.some((a) => a === '-f' || a === '-rf')
    const targets = ctx.args.filter((a) => !a.startsWith('-'))
    if (targets.length === 0) return { stderr: 'rm: missing operand', exitCode: 1 }
    for (const t of targets) {
      const path = resolve(ctx.cwd, t)
      const stat = await ctx.vfs.stat(path).catch(() => null)
      if (!stat) {
        if (force) continue
        return { stderr: `rm: ${t}: No such file or directory`, exitCode: 1 }
      }
      try {
        if (stat.type === 'directory') {
          if (!recursive) return { stderr: `rm: ${t}: is a directory (use -r)`, exitCode: 1 }
          await ctx.vfs.rmdir(path, { recursive: true })
        } else {
          await ctx.vfs.unlink(path)
        }
      } catch (e) {
        return { stderr: `rm: ${t}: ${(e as Error).message}`, exitCode: 1 }
      }
    }
    return { exitCode: 0 }
  },
}

const cp: Command = {
  name: 'cp',
  aliases: ['copy'],
  description: 'Copy files or directories',
  usage: 'cp [-r] <src>... <dst>',
  run: async (ctx) => {
    const recursive = ctx.args.some((a) => a === '-r' || a === '-R')
    const positional = ctx.args.filter((a) => !a.startsWith('-'))
    if (positional.length < 2) return { stderr: 'cp: missing operand', exitCode: 1 }
    const dst = resolve(ctx.cwd, positional[positional.length - 1])
    const sources = positional.slice(0, -1)
    const dstStat = await ctx.vfs.stat(dst).catch(() => null)
    const dstIsDir = dstStat?.type === 'directory'
    if (sources.length > 1 && !dstIsDir) {
      return { stderr: `cp: target '${dst}' is not a directory`, exitCode: 1 }
    }
    for (const s of sources) {
      const src = resolve(ctx.cwd, s)
      const targetPath = dstIsDir ? `${dst}/${basename(src)}` : dst
      try {
        await ctx.vfs.copy(src, targetPath, { recursive })
      } catch (e) {
        return { stderr: `cp: ${s}: ${(e as Error).message}`, exitCode: 1 }
      }
    }
    return { exitCode: 0 }
  },
}

const mv: Command = {
  name: 'mv',
  aliases: ['move', 'ren', 'rename'],
  description: 'Move or rename a file/directory',
  usage: 'mv <src> <dst>',
  run: async (ctx) => {
    if (ctx.args.length < 2) return { stderr: 'mv: missing operand', exitCode: 1 }
    const src = resolve(ctx.cwd, ctx.args[0])
    let dst = resolve(ctx.cwd, ctx.args[1])
    const dstStat = await ctx.vfs.stat(dst).catch(() => null)
    if (dstStat?.type === 'directory') dst = `${dst}/${basename(src)}`
    try {
      await ctx.vfs.rename(src, dst)
    } catch (e) {
      return { stderr: `mv: ${(e as Error).message}`, exitCode: 1 }
    }
    return { exitCode: 0 }
  },
}

const touch: Command = {
  name: 'touch',
  description: 'Create empty file (or update mtime)',
  usage: 'touch <file>...',
  run: async (ctx) => {
    if (ctx.args.length === 0) return { stderr: 'touch: missing operand', exitCode: 1 }
    for (const f of ctx.args) {
      const path = resolve(ctx.cwd, f)
      if (await ctx.vfs.exists(path)) {
        const content = await ctx.vfs.readFile(path)
        await ctx.vfs.writeFile(path, content)
      } else {
        await ctx.vfs.writeFile(path, '')
      }
    }
    return { exitCode: 0 }
  },
}

const head: Command = {
  name: 'head',
  description: 'Print first lines of a file',
  usage: 'head [-n N] <file>',
  run: async (ctx) => {
    let n = 10
    const args: string[] = []
    for (let i = 0; i < ctx.args.length; i++) {
      if (ctx.args[i] === '-n') {
        n = Number.parseInt(ctx.args[++i] ?? '10', 10)
      } else if (/^-\d+$/.test(ctx.args[i])) {
        n = Number.parseInt(ctx.args[i].slice(1), 10)
      } else {
        args.push(ctx.args[i])
      }
    }
    const text = args.length === 0 ? ctx.stdin : await ctx.vfs.readFile(resolve(ctx.cwd, args[0]))
    const lines = text.split('\n').slice(0, n)
    return { stdout: `${lines.join('\n')}\n`, exitCode: 0 }
  },
}

const tail: Command = {
  name: 'tail',
  description: 'Print last lines of a file',
  usage: 'tail [-n N] <file>',
  run: async (ctx) => {
    let n = 10
    const args: string[] = []
    for (let i = 0; i < ctx.args.length; i++) {
      if (ctx.args[i] === '-n') {
        n = Number.parseInt(ctx.args[++i] ?? '10', 10)
      } else if (/^-\d+$/.test(ctx.args[i])) {
        n = Number.parseInt(ctx.args[i].slice(1), 10)
      } else {
        args.push(ctx.args[i])
      }
    }
    const text = args.length === 0 ? ctx.stdin : await ctx.vfs.readFile(resolve(ctx.cwd, args[0]))
    const lines = text.split('\n')
    const slice = lines.slice(
      Math.max(0, lines.length - n - (lines[lines.length - 1] === '' ? 1 : 0)),
    )
    return { stdout: slice.join('\n'), exitCode: 0 }
  },
}

const wc: Command = {
  name: 'wc',
  description: 'Count lines, words, characters',
  usage: 'wc [-l|-w|-c] [<file>]',
  run: async (ctx) => {
    const flags = new Set<string>()
    const args: string[] = []
    for (const a of ctx.args) {
      if (a.startsWith('-')) for (const ch of a.slice(1)) flags.add(ch)
      else args.push(a)
    }
    const text = args.length === 0 ? ctx.stdin : await ctx.vfs.readFile(resolve(ctx.cwd, args[0]))
    const lines = text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
    const chars = text.length
    const filename = args[0] ?? ''
    if (flags.has('l'))
      return { stdout: `${lines}${filename ? ` ${filename}` : ''}\n`, exitCode: 0 }
    if (flags.has('w'))
      return { stdout: `${words}${filename ? ` ${filename}` : ''}\n`, exitCode: 0 }
    if (flags.has('c'))
      return { stdout: `${chars}${filename ? ` ${filename}` : ''}\n`, exitCode: 0 }
    return {
      stdout: `${String(lines).padStart(6)} ${String(words).padStart(6)} ${String(chars).padStart(6)}${filename ? ` ${filename}` : ''}\n`,
      exitCode: 0,
    }
  },
}

const grep: Command = {
  name: 'grep',
  aliases: ['findstr'],
  description: 'Search for a pattern',
  usage: 'grep [-i] [-v] <pattern> [<file>]',
  run: async (ctx) => {
    const flags = new Set<string>()
    const args: string[] = []
    for (const a of ctx.args) {
      if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
        for (const ch of a.slice(1)) flags.add(ch)
      } else args.push(a)
    }
    if (args.length === 0) return { stderr: 'grep: missing pattern', exitCode: 2 }
    const [pattern, ...rest] = args
    const text = rest.length === 0 ? ctx.stdin : await ctx.vfs.readFile(resolve(ctx.cwd, rest[0]))
    const re = new RegExp(pattern, flags.has('i') ? 'i' : '')
    const invert = flags.has('v')
    const matched = text.split('\n').filter((line) => (invert ? !re.test(line) : re.test(line)))
    if (matched.length === 0) return { stdout: '', exitCode: 1 }
    return { stdout: `${matched.join('\n')}\n`, exitCode: 0 }
  },
}

const find: Command = {
  name: 'find',
  description: 'Find paths under a directory',
  usage: 'find <path> [-name <glob>]',
  run: async (ctx) => {
    const startArg = ctx.args[0] ?? '.'
    const start = resolve(ctx.cwd, startArg)
    let nameGlob: string | undefined
    for (let i = 1; i < ctx.args.length; i++) {
      if (ctx.args[i] === '-name') nameGlob = ctx.args[++i]
    }
    const re = nameGlob ? globToRegex(nameGlob) : undefined
    const results: string[] = []
    async function walk(p: string) {
      const stat = await ctx.vfs.stat(p).catch(() => null)
      if (!stat) return
      const name = basename(p) || p
      if (!re || re.test(name)) results.push(p)
      if (stat.type === 'directory') {
        const children = await ctx.vfs.readdir(p)
        for (const c of children) await walk(p === '/' ? `/${c.name}` : `${p}/${c.name}`)
      }
    }
    await walk(start)
    return { stdout: `${results.join('\n')}\n`, exitCode: 0 }
  },
}

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
}

const tree: Command = {
  name: 'tree',
  description: 'Show directory tree',
  usage: 'tree [path]',
  run: async (ctx) => {
    const start = resolve(ctx.cwd, ctx.args[0] ?? '.')
    const out: string[] = [start]
    async function walk(p: string, prefix: string) {
      const stat = await ctx.vfs.stat(p).catch(() => null)
      if (!stat || stat.type !== 'directory') return
      const children = await ctx.vfs.readdir(p)
      for (let i = 0; i < children.length; i++) {
        const c = children[i]
        const last = i === children.length - 1
        const branch = last ? '└── ' : '├── '
        out.push(prefix + branch + c.name + (c.type === 'directory' ? '/' : ''))
        if (c.type === 'directory') {
          const next = prefix + (last ? '    ' : '│   ')
          await walk(p === '/' ? `/${c.name}` : `${p}/${c.name}`, next)
        }
      }
    }
    await walk(start, '')
    return { stdout: `${out.join('\n')}\n`, exitCode: 0 }
  },
}

const stat: Command = {
  name: 'stat',
  description: 'Show file stat',
  usage: 'stat <path>',
  run: async (ctx) => {
    if (ctx.args.length === 0) return { stderr: 'stat: missing operand', exitCode: 1 }
    const path = resolve(ctx.cwd, ctx.args[0])
    const s = await ctx.vfs.stat(path).catch(() => null)
    if (!s) return { stderr: `stat: ${ctx.args[0]}: No such file or directory`, exitCode: 1 }
    return {
      stdout:
        `  File: ${s.path}\n` +
        `  Size: ${s.size}\t${s.type === 'directory' ? 'directory' : 'regular file'}\n` +
        `Modify: ${new Date(s.mtime).toISOString()}\n` +
        `Change: ${new Date(s.ctime).toISOString()}\n`,
      exitCode: 0,
    }
  },
}

const dirnameCmd: Command = {
  name: 'dirname',
  description: 'Return directory portion of a path',
  run: (ctx) => ({ stdout: `${dirname(ctx.args[0] ?? '')}\n`, exitCode: 0 }),
}

const basenameCmd: Command = {
  name: 'basename',
  description: 'Return file portion of a path',
  run: (ctx) => ({ stdout: `${basename(ctx.args[0] ?? '')}\n`, exitCode: 0 }),
}

export const FS_COMMANDS: Command[] = [
  dir,
  ls,
  cd,
  pwd,
  cat,
  echo,
  mkdir,
  rmdir,
  rm,
  cp,
  mv,
  touch,
  head,
  tail,
  wc,
  grep,
  find,
  tree,
  stat,
  dirnameCmd,
  basenameCmd,
]
