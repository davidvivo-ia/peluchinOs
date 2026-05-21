import type { Logger } from '@/kernel/logger'
import type { vfs } from '@/kernel/vfs'

export interface CommandContext {
  args: string[]
  cwd: string
  env: Record<string, string>
  stdin: string
  vfs: typeof vfs
  log: Logger
  terminal: TerminalApi
}

export interface CommandResult {
  stdout?: string
  stderr?: string
  exitCode: number
  cwdChange?: string
  envChange?: Record<string, string>
}

export interface Command {
  name: string
  aliases?: string[]
  description: string
  usage?: string
  run: (ctx: CommandContext) => Promise<CommandResult> | CommandResult
}

export interface ParsedCommand {
  argv: string[]
  redirectIn?: string
  redirectOut?: { path: string; append: boolean }
}

export interface ParsedPipeline {
  commands: ParsedCommand[]
}

export interface ParseError {
  message: string
  column: number
}

export interface TerminalApi {
  clear: () => void
  exit: () => void
  reboot: () => void
  shutdown: () => void
  open: (appId: string) => void
}
