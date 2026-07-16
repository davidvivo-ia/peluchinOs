import type { Command } from '../types'
import { FS_COMMANDS } from './fs'
import { PELUCHIN_COMMANDS } from './peluchin'
import { PKG_COMMANDS } from './pkg'
import { SYSTEM_COMMANDS } from './system'

const ALL_COMMANDS: Command[] = [
  ...FS_COMMANDS,
  ...SYSTEM_COMMANDS,
  ...PELUCHIN_COMMANDS,
  ...PKG_COMMANDS,
]

const byName = new Map<string, Command>()
for (const cmd of ALL_COMMANDS) {
  byName.set(cmd.name.toLowerCase(), cmd)
  for (const alias of cmd.aliases ?? []) {
    byName.set(alias.toLowerCase(), cmd)
  }
}

export function getCommand(name: string): Command | undefined {
  if (!name) return undefined
  return byName.get(name.toLowerCase())
}

export function listCommands(): Command[] {
  return [...ALL_COMMANDS].sort((a, b) => a.name.localeCompare(b.name))
}

export function commandNames(): string[] {
  return Array.from(byName.keys()).sort()
}
