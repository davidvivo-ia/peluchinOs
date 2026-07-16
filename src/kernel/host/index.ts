import { createLogger } from '../logger'

const log = createLogger('host')

export interface HostInfo {
  os: string
  arch: string
  family: string
  hostname: string
  cwd: string
  epoch_ms: number
  tauri_version: string
  allowed_roots: string[]
}

export interface HostReadResult {
  path: string
  content: string
  bytes: number
}

export interface HostListEntry {
  name: string
  is_dir: boolean
  size: number
}

interface TauriInternals {
  __TAURI_INTERNALS__?: unknown
  __TAURI_INVOKE__?: unknown
}

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as TauriInternals
  return Boolean(w.__TAURI_INTERNALS__ ?? w.__TAURI_INVOKE__)
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core')
  return mod.invoke<T>(cmd, args)
}

export async function getHostInfo(): Promise<HostInfo> {
  if (!isTauri()) {
    return {
      os: 'web',
      arch: navigator?.userAgent?.includes('arm') ? 'arm' : 'x86',
      family: 'browser',
      hostname: location.host,
      cwd: '/',
      epoch_ms: Date.now(),
      tauri_version: 'n/a (browser mode)',
      allowed_roots: [],
    }
  }
  try {
    return await invokeTauri<HostInfo>('host_info')
  } catch (e) {
    log.error(`host_info failed: ${(e as Error).message}`)
    throw e
  }
}

export async function readHostFile(path: string): Promise<HostReadResult> {
  if (!isTauri()) throw new Error('host file I/O only available in Tauri build')
  return invokeTauri<HostReadResult>('host_read_file', { path })
}

export async function writeHostFile(path: string, content: string): Promise<number> {
  if (!isTauri()) throw new Error('host file I/O only available in Tauri build')
  return invokeTauri<number>('host_write_file', { path, content })
}

export async function listHostDir(path: string): Promise<HostListEntry[]> {
  if (!isTauri()) throw new Error('host file I/O only available in Tauri build')
  return invokeTauri<HostListEntry[]>('host_list_dir', { path })
}
