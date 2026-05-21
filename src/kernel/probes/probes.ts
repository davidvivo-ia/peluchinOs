import { apps, getApp } from '@/apps/registry'
import { createLogger, useLogStore } from '@/kernel/logger'
import { bootstrapFilesystem, vfs } from '@/kernel/vfs'
import { useWMStore } from '@/kernel/window-manager'
import type { Probe, ProbeResult } from './types'

export async function runProbe(probe: Probe): Promise<ProbeResult> {
  try {
    return await probe.run()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { status: 'failed', detail: msg || 'unknown error' }
  }
}

export const probes: readonly Probe[] = [
  {
    service: 'Kernel Logger Subsystem',
    run: () => {
      const store = useLogStore.getState()
      const before = store.entries.length
      createLogger('boot:probe:logger').trace('self-test')
      const after = useLogStore.getState().entries.length
      return after > before
        ? { status: 'ok' }
        : { status: 'failed', detail: 'log buffer did not accept entry' }
    },
  },
  {
    service: 'Event Bus',
    run: () => {
      if (typeof useLogStore.subscribe !== 'function') {
        return { status: 'failed', detail: 'store.subscribe missing' }
      }
      let observed = 0
      const unsub = useLogStore.subscribe(() => {
        observed++
      })
      useLogStore.getState().setMinLevel(useLogStore.getState().minLevel)
      unsub()
      return observed > 0
        ? { status: 'ok' }
        : { status: 'warn', detail: 'subscriber never notified — store may be inert' }
    },
  },
  {
    service: 'Window Manager (wm.service)',
    run: () => {
      const wm = useWMStore.getState()
      const id = wm.open({ appId: '__selftest__', title: '__selftest__' })
      const found = useWMStore.getState().windows.some((w) => w.id === id)
      useWMStore.getState().close(id)
      if (!found) return { status: 'failed', detail: 'window did not register in store' }
      const stillThere = useWMStore.getState().windows.some((w) => w.id === id)
      return stillThere
        ? { status: 'failed', detail: 'close() did not remove window' }
        : { status: 'ok' }
    },
  },
  {
    service: 'Application Registry',
    run: () => {
      if (apps.length === 0) return { status: 'failed', detail: 'no apps registered' }
      const first = apps[0]
      const lookup = getApp(first.id)
      return lookup?.id === first.id
        ? { status: 'ok' }
        : { status: 'failed', detail: `lookup mismatch for ${first.id}` }
    },
  },
  {
    service: 'Theme Engine (win2k-hybrid)',
    run: () => {
      const v = getComputedStyle(document.body)
        .getPropertyValue('--color-win-gray')
        .trim()
        .toLowerCase()
      if (!v) return { status: 'failed', detail: 'theme token --color-win-gray not exposed' }
      return v === '#c0c0c0'
        ? { status: 'ok' }
        : { status: 'warn', detail: `expected #c0c0c0, got ${v}` }
    },
  },
  {
    service: 'Render Loop (rAF)',
    run: () =>
      typeof requestAnimationFrame === 'function'
        ? { status: 'ok' }
        : { status: 'failed', detail: 'requestAnimationFrame undefined' },
  },
  {
    service: 'Web Crypto (crypto.randomUUID)',
    run: () => {
      if (typeof crypto === 'undefined') {
        return { status: 'failed', detail: 'crypto unavailable' }
      }
      if (typeof crypto.randomUUID !== 'function') {
        return { status: 'warn', detail: 'crypto.randomUUID missing — using nanoid fallback' }
      }
      const id = crypto.randomUUID()
      return /^[0-9a-f-]{36}$/.test(id)
        ? { status: 'ok' }
        : { status: 'warn', detail: `unexpected UUID shape: ${id}` }
    },
  },
  {
    service: 'Local Storage Backend',
    run: () => {
      try {
        const key = '__peluchinos_probe__'
        localStorage.setItem(key, '1')
        const val = localStorage.getItem(key)
        localStorage.removeItem(key)
        return val === '1'
          ? { status: 'ok' }
          : { status: 'warn', detail: 'value mismatch on readback' }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { status: 'warn', detail: `localStorage threw: ${msg}` }
      }
    },
  },
  {
    service: 'Persistence Layer (vfs.service)',
    run: async () => {
      if (typeof indexedDB === 'undefined') {
        return { status: 'warn', detail: 'IndexedDB unavailable — falling back to memory' }
      }
      const dbName = '__peluchinos_probe__'
      return new Promise<ProbeResult>((resolve) => {
        let settled = false
        const settle = (r: ProbeResult) => {
          if (settled) return
          settled = true
          resolve(r)
        }
        try {
          const req = indexedDB.open(dbName, 1)
          req.onupgradeneeded = () => {
            req.result.createObjectStore('probe')
          }
          req.onsuccess = () => {
            req.result.close()
            const del = indexedDB.deleteDatabase(dbName)
            del.onsuccess = () => settle({ status: 'ok' })
            del.onerror = () => settle({ status: 'ok', detail: 'opened but cleanup delete failed' })
            del.onblocked = () => settle({ status: 'ok' })
          }
          req.onerror = () =>
            settle({
              status: 'warn',
              detail: `IndexedDB open failed: ${req.error?.message ?? 'unknown'}`,
            })
          req.onblocked = () => settle({ status: 'warn', detail: 'IndexedDB blocked' })
          setTimeout(
            () => settle({ status: 'warn', detail: 'IndexedDB probe timed out (300ms)' }),
            300,
          )
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          settle({ status: 'warn', detail: `indexedDB threw: ${msg}` })
        }
      })
    },
  },
  {
    service: 'Plushie File System (plushfs)',
    run: async () => {
      await bootstrapFilesystem()
      const probePath = '/tmp/__probe__'
      const sentinel = `probe-${Date.now()}`
      try {
        await vfs.writeFile(probePath, sentinel)
        const read = await vfs.readFile(probePath)
        await vfs.unlink(probePath)
        if (read !== sentinel) {
          return { status: 'warn', detail: 'read-back content mismatch' }
        }
        const stat = await vfs.stat('/etc/peluchinos.conf').catch(() => null)
        if (!stat) return { status: 'warn', detail: '/etc/peluchinos.conf missing after bootstrap' }
        return { status: 'ok' }
      } catch (e) {
        return { status: 'failed', detail: (e as Error).message }
      }
    },
  },
  {
    service: 'Touch Input Driver',
    run: () => {
      const hasTouch =
        'ontouchstart' in window ||
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
      return hasTouch
        ? { status: 'ok' }
        : { status: 'warn', detail: 'no touch device detected — running in mouse mode' }
    },
  },
  {
    service: 'Notification Service',
    run: () => {
      if (!('Notification' in window)) {
        return { status: 'warn', detail: 'Notifications API unavailable' }
      }
      const perm = Notification.permission
      if (perm === 'granted') return { status: 'ok' }
      if (perm === 'denied') return { status: 'warn', detail: 'permission denied by user' }
      return { status: 'warn', detail: 'permission not yet granted (default)' }
    },
  },
  {
    service: 'Session Manager',
    run: () => {
      const root = document.getElementById('root')
      if (!root) return { status: 'failed', detail: 'no #root element' }
      if (root.children.length === 0) return { status: 'failed', detail: 'React did not mount' }
      return { status: 'ok' }
    },
  },
  {
    service: 'Host Bridge (tauri.service)',
    run: async () => {
      const w = window as unknown as { __TAURI_INTERNALS__?: unknown }
      if (!w.__TAURI_INTERNALS__) {
        return { status: 'warn', detail: 'running in browser, no native host bridge' }
      }
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const info = (await invoke('host_info')) as { os?: string }
        return info?.os
          ? { status: 'ok' }
          : { status: 'warn', detail: 'host_info returned unexpected payload' }
      } catch (e) {
        return { status: 'failed', detail: (e as Error).message }
      }
    },
  },
]
