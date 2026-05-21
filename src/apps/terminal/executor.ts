import { createLogger } from '@/kernel/logger'
import { vfs } from '@/kernel/vfs'
import { resolve } from '@/kernel/vfs'
import { getCommand } from './commands/registry'
import { isParseError, parse } from './parser'
import type { ParsedCommand, TerminalApi } from './types'

const log = createLogger('terminal')

export interface ExecState {
  cwd: string
  env: Record<string, string>
}

export interface ExecOutput {
  lines: Array<{ text: string; stream: 'stdout' | 'stderr' | 'info' }>
  cwd: string
  env: Record<string, string>
  exitCode: number
}

export async function execute(
  input: string,
  state: ExecState,
  terminal: TerminalApi,
): Promise<ExecOutput> {
  const out: ExecOutput = {
    lines: [],
    cwd: state.cwd,
    env: { ...state.env },
    exitCode: 0,
  }

  const trimmed = input.trim()
  if (!trimmed) return out

  const parsed = parse(trimmed)
  if (isParseError(parsed)) {
    out.lines.push({ text: `peluchsh: parse error: ${parsed.message}`, stream: 'stderr' })
    out.exitCode = 2
    return out
  }

  if (parsed.commands.length === 0) return out

  log.debug(`exec: ${trimmed}`, { commandCount: parsed.commands.length })

  let pipeBuffer = ''
  for (let idx = 0; idx < parsed.commands.length; idx++) {
    const pc = parsed.commands[idx]
    const isLast = idx === parsed.commands.length - 1

    let stdin = pipeBuffer
    if (pc.redirectIn) {
      const path = resolve(out.cwd, pc.redirectIn)
      try {
        stdin = await vfs.readFile(path)
      } catch (e) {
        out.lines.push({
          text: `peluchsh: ${pc.redirectIn}: ${(e as Error).message}`,
          stream: 'stderr',
        })
        out.exitCode = 1
        return out
      }
    }

    const result = await runOne(pc, stdin, out.cwd, out.env, terminal)

    if (result.cwdChange) {
      const next = resolve(out.cwd, result.cwdChange)
      out.cwd = next
    }
    if (result.envChange) {
      out.env = { ...out.env, ...result.envChange }
    }

    out.exitCode = result.exitCode

    if (pc.redirectOut) {
      const target = resolve(out.cwd, pc.redirectOut.path)
      try {
        if (pc.redirectOut.append) {
          await vfs.appendFile(target, result.stdout ?? '')
        } else {
          await vfs.writeFile(target, result.stdout ?? '')
        }
      } catch (e) {
        out.lines.push({
          text: `peluchsh: ${pc.redirectOut.path}: ${(e as Error).message}`,
          stream: 'stderr',
        })
        out.exitCode = 1
        return out
      }
      pipeBuffer = ''
    } else if (isLast) {
      if (result.stdout) {
        for (const line of result.stdout.replace(/\n$/, '').split('\n')) {
          out.lines.push({ text: line, stream: 'stdout' })
        }
      }
      pipeBuffer = ''
    } else {
      pipeBuffer = result.stdout ?? ''
    }

    if (result.stderr) {
      for (const line of result.stderr.replace(/\n$/, '').split('\n')) {
        out.lines.push({ text: line, stream: 'stderr' })
      }
    }

    if (result.exitCode !== 0 && !isLast) {
      log.debug(`pipeline aborted at command ${idx}`, { exitCode: result.exitCode })
    }
  }

  return out
}

async function runOne(
  pc: ParsedCommand,
  stdin: string,
  cwd: string,
  env: Record<string, string>,
  terminal: TerminalApi,
) {
  const [name, ...args] = pc.argv
  const command = getCommand(name)
  if (!command) {
    return {
      stdout: '',
      stderr: `peluchsh: ${name}: command not found`,
      exitCode: 127,
    }
  }
  try {
    const result = await command.run({
      args,
      cwd,
      env,
      stdin,
      vfs,
      log: createLogger(`terminal:${command.name}`),
      terminal,
    })
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.exitCode,
      cwdChange: result.cwdChange,
      envChange: result.envChange,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { stdout: '', stderr: `peluchsh: ${name}: ${msg}`, exitCode: 1 }
  }
}
