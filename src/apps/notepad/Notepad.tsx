import { createLogger } from '@/kernel/logger'
import { basename, vfs } from '@/kernel/vfs'
import { useWMStore } from '@/kernel/window-manager'
import type { WindowState } from '@/kernel/window-manager'
import { useCallback, useEffect, useState } from 'react'

const log = createLogger('notepad')

interface NotepadInit {
  path?: string
}

export function Notepad({ window: w }: { window: WindowState }) {
  const initial = (w.initData as NotepadInit | undefined)?.path
  const [path, setPath] = useState<string | null>(initial ?? null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('Untitled')

  const updateTitle = useCallback(() => {
    const wm = useWMStore.getState()
    const win = wm.windows.find((x) => x.id === w.id)
    if (!win) return
    const name = path ? basename(path) : 'Untitled'
    win.title = `${dirty ? '*' : ''}${name} — Notepad`
  }, [path, dirty, w.id])

  useEffect(() => {
    let cancelled = false
    if (initial) {
      vfs
        .readFile(initial)
        .then((text) => {
          if (cancelled) return
          setContent(text)
          setDirty(false)
          setStatus(initial)
        })
        .catch((e) => {
          if (cancelled) return
          setStatus(`error: ${(e as Error).message}`)
        })
    }
    return () => {
      cancelled = true
    }
  }, [initial])

  useEffect(() => {
    updateTitle()
  }, [updateTitle])

  const save = useCallback(async () => {
    if (!path) {
      const target = prompt('Save as (absolute path):', '/home/peluchin/Untitled.txt')
      if (!target) return
      try {
        await vfs.writeFile(target, content)
        setPath(target)
        setDirty(false)
        setStatus(`saved to ${target}`)
        log.info(`saved ${target}`)
      } catch (e) {
        setStatus(`save failed: ${(e as Error).message}`)
      }
      return
    }
    try {
      await vfs.writeFile(path, content)
      setDirty(false)
      setStatus(`saved to ${path}`)
      log.info(`saved ${path}`)
    } catch (e) {
      setStatus(`save failed: ${(e as Error).message}`)
    }
  }, [path, content])

  const openFile = useCallback(async () => {
    const target = prompt('Open file (absolute path):', '/home/peluchin/Documents/readme.txt')
    if (!target) return
    try {
      const text = await vfs.readFile(target)
      setContent(text)
      setPath(target)
      setDirty(false)
      setStatus(`opened ${target}`)
    } catch (e) {
      setStatus(`open failed: ${(e as Error).message}`)
    }
  }, [])

  const newFile = useCallback(() => {
    if (dirty && !confirm('Discard unsaved changes?')) return
    setContent('')
    setPath(null)
    setDirty(false)
    setStatus('Untitled')
  }, [dirty])

  const onChange = useCallback((value: string) => {
    setContent(value)
    setDirty(true)
  }, [])

  const lineCount = content.split('\n').length
  const charCount = content.length

  return (
    <div className="h-full w-full flex flex-col bg-[var(--color-win-gray)] text-[11px]">
      <MenuBar onNew={newFile} onOpen={openFile} onSave={save} />
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="flex-1 bevel-in bg-white m-1 mx-1.5 p-1.5 font-mono text-[12px] resize-none outline-none"
      />
      <div className="bevel-in bg-[var(--color-win-gray)] m-1 mt-0 mx-1.5 px-2 py-0.5 flex gap-4">
        <span>{status}</span>
        <span className="ml-auto">
          Ln {lineCount}, Ch {charCount}
        </span>
      </div>
    </div>
  )
}

interface MenuBarProps {
  onNew: () => void
  onOpen: () => void
  onSave: () => void
}

function MenuBar({ onNew, onOpen, onSave }: MenuBarProps) {
  const [open, setOpen] = useState<'file' | null>(null)
  return (
    <div className="flex items-center gap-2 px-1.5 py-1 border-b border-[var(--color-win-gray-dark)] relative">
      <MenuTrigger
        label="File"
        active={open === 'file'}
        onToggle={() => setOpen(open === 'file' ? null : 'file')}
      />
      {open === 'file' && (
        <div className="absolute top-full left-1.5 bevel-out bg-[var(--color-win-gray)] min-w-32 py-1 z-10">
          <MenuItem
            label="New"
            shortcut="Ctrl+N"
            onClick={() => {
              setOpen(null)
              onNew()
            }}
          />
          <MenuItem
            label="Open…"
            shortcut="Ctrl+O"
            onClick={() => {
              setOpen(null)
              onOpen()
            }}
          />
          <MenuItem
            label="Save"
            shortcut="Ctrl+S"
            onClick={() => {
              setOpen(null)
              onSave()
            }}
          />
        </div>
      )}
    </div>
  )
}

function MenuTrigger({
  label,
  active,
  onToggle,
}: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-active={active}
      onClick={onToggle}
      className="px-1.5 py-0.5 data-[active=true]:bg-[var(--color-win-title-from)] data-[active=true]:text-white"
    >
      {label}
    </button>
  )
}

function MenuItem({
  label,
  shortcut,
  onClick,
}: { label: string; shortcut?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-0.5 flex items-center gap-6 hover:bg-[var(--color-win-title-from)] hover:text-white"
    >
      <span>{label}</span>
      {shortcut && <span className="ml-auto text-[10px] text-gray-500">{shortcut}</span>}
    </button>
  )
}
