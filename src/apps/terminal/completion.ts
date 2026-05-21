import { basename, dirname, resolve } from '@/kernel/vfs'
import { vfs } from '@/kernel/vfs'
import { commandNames } from './commands/registry'

export interface CompletionResult {
  /** What to append to the partial token to complete it (or the new full token if multiple) */
  completion: string
  /** All matching candidates (for display when ambiguous) */
  candidates: string[]
}

export async function complete(input: string, cwd: string): Promise<CompletionResult> {
  const trailingSpace = /[ \t]$/.test(input)
  const tokens = input.split(/\s+/).filter(Boolean)
  const isFirstToken = tokens.length === 0 || (tokens.length === 1 && !trailingSpace)

  if (isFirstToken) {
    const partial = trailingSpace ? '' : (tokens[0] ?? '')
    const all = commandNames()
    const matches = all.filter((n) => n.startsWith(partial.toLowerCase()))
    return { completion: bestCommon(partial, matches), candidates: matches }
  }

  const partial = trailingSpace ? '' : tokens[tokens.length - 1]
  const dirPart = partial.includes('/') || partial.includes('\\') ? dirname(partial) : ''
  const namePart = basename(partial)
  const dirAbs = resolve(cwd, dirPart || '.')

  let entries: { name: string; type: string }[] = []
  try {
    entries = (await vfs.readdir(dirAbs)).map((e) => ({ name: e.name, type: e.type }))
  } catch {
    return { completion: '', candidates: [] }
  }
  const matches = entries.filter((e) => e.name.startsWith(namePart))
  const decorated = matches.map((m) => (m.type === 'directory' ? `${m.name}/` : m.name))

  const lcp = longestCommonPrefix(decorated.map((d) => d.replace(/\/$/, '')))
  const remainder = lcp.slice(namePart.length)
  let completion = remainder
  if (matches.length === 1 && remainder) {
    completion = matches[0].type === 'directory' ? `${remainder}/` : `${remainder} `
  }
  return { completion, candidates: decorated }
}

function bestCommon(partial: string, matches: string[]): string {
  if (matches.length === 0) return ''
  if (matches.length === 1) return `${matches[0].slice(partial.length)} `
  const lcp = longestCommonPrefix(matches)
  return lcp.slice(partial.length)
}

function longestCommonPrefix(strs: string[]): string {
  if (strs.length === 0) return ''
  let pre = strs[0]
  for (let i = 1; i < strs.length; i++) {
    while (!strs[i].startsWith(pre)) {
      pre = pre.slice(0, -1)
      if (!pre) return ''
    }
  }
  return pre
}
