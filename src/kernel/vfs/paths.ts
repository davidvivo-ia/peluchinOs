export const ROOT = '/'

export function normalize(p: string): string {
  if (!p) return ROOT
  const swapped = p.replace(/\\/g, '/')
  const isAbs = swapped.startsWith('/')
  const parts = swapped.split('/').filter(Boolean)
  const out: string[] = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..') {
      if (out.length > 0) out.pop()
      continue
    }
    out.push(part)
  }
  const joined = out.join('/')
  if (isAbs) return joined ? `/${joined}` : ROOT
  return joined
}

export function isAbsolute(p: string): boolean {
  return p.startsWith('/') || p.startsWith('\\') || /^[a-zA-Z]:[/\\]/.test(p)
}

export function resolve(cwd: string, p: string): string {
  if (!p) return normalize(cwd)
  if (p.startsWith('~')) {
    const rest = p.slice(1)
    return normalize(`/home/peluchin${rest}`)
  }
  if (/^[a-zA-Z]:[/\\]/.test(p)) {
    return normalize(p.slice(2))
  }
  if (p.startsWith('/') || p.startsWith('\\')) {
    return normalize(p)
  }
  return normalize(`${cwd}/${p}`)
}

export function dirname(p: string): string {
  const n = normalize(p)
  if (n === ROOT) return ROOT
  const idx = n.lastIndexOf('/')
  if (idx <= 0) return ROOT
  return n.slice(0, idx)
}

export function basename(p: string): string {
  const n = normalize(p)
  if (n === ROOT) return ''
  const idx = n.lastIndexOf('/')
  return n.slice(idx + 1)
}

export function join(...parts: string[]): string {
  return normalize(parts.join('/'))
}

export function toDosPath(p: string): string {
  const n = normalize(p)
  if (n === ROOT) return 'C:\\'
  return `C:${n.replace(/\//g, '\\')}`
}

export function fromDosPath(p: string): string {
  if (/^[a-zA-Z]:[/\\]?/.test(p)) {
    return normalize(p.slice(2) || '/')
  }
  return normalize(p)
}
