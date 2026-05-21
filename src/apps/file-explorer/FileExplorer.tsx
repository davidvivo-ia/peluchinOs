import { getApp } from '@/apps/registry'
import { createLogger } from '@/kernel/logger'
import { ROOT, dirname, join, toDosPath, vfs } from '@/kernel/vfs'
import type { DirEntry, VfsEvent } from '@/kernel/vfs'
import { useWMStore } from '@/kernel/window-manager'
import type { WindowState } from '@/kernel/window-manager'
import { useCallback, useEffect, useMemo, useState } from 'react'

const log = createLogger('explorer')

interface ExplorerInit {
  path?: string
}

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'conf',
  'log',
  'json',
  'js',
  'ts',
  'tsx',
  'html',
  'css',
])

export function FileExplorer({ window: w }: { window: WindowState }) {
  const initial = (w.initData as ExplorerInit | undefined)?.path ?? '/home/peluchin'
  const [cwd, setCwd] = useState<string>(initial)
  const [history, setHistory] = useState<string[]>([initial])
  const [historyIdx, setHistoryIdx] = useState<number>(0)
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [selection, setSelection] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const list = await vfs.readdir(cwd)
      setEntries(list)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
      setEntries([])
    }
  }, [cwd])

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the refresh signal
  useEffect(() => {
    refresh()
  }, [refresh, tick])

  useEffect(() => {
    const unsub = vfs.subscribe((event: VfsEvent) => {
      const affected = event.path
      const oldAffected = event.oldPath
      if (
        affected === cwd ||
        dirname(affected) === cwd ||
        (oldAffected && (oldAffected === cwd || dirname(oldAffected) === cwd))
      ) {
        setTick((t) => t + 1)
      }
    })
    return unsub
  }, [cwd])

  const goTo = useCallback(
    (path: string) => {
      setCwd(path)
      setHistory((h) => [...h.slice(0, historyIdx + 1), path])
      setHistoryIdx((i) => i + 1)
      setSelection(null)
    },
    [historyIdx],
  )

  const goBack = useCallback(() => {
    if (historyIdx <= 0) return
    setHistoryIdx((i) => i - 1)
    setCwd(history[historyIdx - 1])
    setSelection(null)
  }, [historyIdx, history])

  const goForward = useCallback(() => {
    if (historyIdx >= history.length - 1) return
    setHistoryIdx((i) => i + 1)
    setCwd(history[historyIdx + 1])
    setSelection(null)
  }, [historyIdx, history])

  const goUp = useCallback(() => {
    if (cwd === ROOT) return
    goTo(dirname(cwd))
  }, [cwd, goTo])

  const onEntryDoubleClick = useCallback(
    async (entry: DirEntry) => {
      const path = cwd === ROOT ? `/${entry.name}` : join(cwd, entry.name)
      if (entry.type === 'directory') {
        goTo(path)
        return
      }
      // Open file
      const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
      if (TEXT_EXTENSIONS.has(ext) || entry.size < 1_000_000) {
        const notepad = getApp('notepad')
        if (notepad) {
          useWMStore.getState().open({
            appId: notepad.id,
            title: `${entry.name} — Notepad`,
            icon: notepad.icon,
            defaultSize: notepad.defaultSize,
            minSize: notepad.minSize,
            resizable: notepad.resizable,
            initData: { path },
          })
          log.info(`opened ${path} in notepad`)
        }
      }
    },
    [cwd, goTo],
  )

  const onNewFolder = useCallback(async () => {
    const name = prompt('New folder name:', 'New Folder')
    if (!name) return
    try {
      await vfs.mkdir(join(cwd, name))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [cwd])

  const onDelete = useCallback(async () => {
    if (!selection) return
    const path = cwd === ROOT ? `/${selection}` : join(cwd, selection)
    if (!confirm(`Delete ${selection}?`)) return
    try {
      const stat = await vfs.stat(path)
      if (stat.type === 'directory') {
        await vfs.rmdir(path, { recursive: true })
      } else {
        await vfs.unlink(path)
      }
      setSelection(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [selection, cwd])

  const onRename = useCallback(async () => {
    if (!selection) return
    const newName = prompt('Rename to:', selection)
    if (!newName || newName === selection) return
    const oldPath = cwd === ROOT ? `/${selection}` : join(cwd, selection)
    const newPath = cwd === ROOT ? `/${newName}` : join(cwd, newName)
    try {
      await vfs.rename(oldPath, newPath)
      setSelection(newName)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [selection, cwd])

  const breadcrumbs = useMemo(() => {
    const parts = cwd === ROOT ? [''] : cwd.split('/')
    const result: { label: string; path: string }[] = []
    let acc = ''
    for (let i = 0; i < parts.length; i++) {
      if (i === 0) {
        result.push({ label: 'C:', path: ROOT })
        continue
      }
      acc += `/${parts[i]}`
      result.push({ label: parts[i], path: acc })
    }
    return result
  }, [cwd])

  return (
    <div className="h-full w-full flex flex-col bg-[var(--color-win-gray)] text-[11px]">
      <Toolbar
        onBack={goBack}
        canBack={historyIdx > 0}
        onForward={goForward}
        canForward={historyIdx < history.length - 1}
        onUp={goUp}
        canUp={cwd !== ROOT}
        onRefresh={() => setTick((t) => t + 1)}
        onNewFolder={onNewFolder}
        onDelete={onDelete}
        onRename={onRename}
        canModify={selection !== null}
      />
      <AddressBar crumbs={breadcrumbs} onNavigate={goTo} dosPath={toDosPath(cwd)} />
      <div className="flex flex-1 min-h-0 m-1.5 mt-0 gap-1.5">
        <Tree current={cwd} onNavigate={goTo} />
        <FileGrid
          entries={entries}
          selection={selection}
          onSelect={setSelection}
          onActivate={onEntryDoubleClick}
          error={error}
        />
      </div>
      <StatusBar count={entries.length} selected={selection} cwd={cwd} />
    </div>
  )
}

function Toolbar({
  onBack,
  canBack,
  onForward,
  canForward,
  onUp,
  canUp,
  onRefresh,
  onNewFolder,
  onDelete,
  onRename,
  canModify,
}: {
  onBack: () => void
  canBack: boolean
  onForward: () => void
  canForward: boolean
  onUp: () => void
  canUp: boolean
  onRefresh: () => void
  onNewFolder: () => void
  onDelete: () => void
  onRename: () => void
  canModify: boolean
}) {
  return (
    <div className="flex items-center gap-1 px-1 py-1 border-b border-[var(--color-win-gray-dark)]">
      <TBtn onClick={onBack} disabled={!canBack} title="Back">
        ←
      </TBtn>
      <TBtn onClick={onForward} disabled={!canForward} title="Forward">
        →
      </TBtn>
      <TBtn onClick={onUp} disabled={!canUp} title="Up">
        ↑
      </TBtn>
      <TBtn onClick={onRefresh} title="Refresh">
        ⟳
      </TBtn>
      <div className="w-px h-4 bg-[var(--color-win-gray-dark)] mx-1" />
      <TBtn onClick={onNewFolder} title="New folder">
        📁+
      </TBtn>
      <TBtn onClick={onDelete} disabled={!canModify} title="Delete">
        🗑
      </TBtn>
      <TBtn onClick={onRename} disabled={!canModify} title="Rename">
        ✎
      </TBtn>
    </div>
  )
}

function TBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="bevel-out bg-[var(--color-win-gray)] px-1.5 py-0.5 active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}

function AddressBar({
  crumbs,
  dosPath,
  onNavigate,
}: {
  crumbs: { label: string; path: string }[]
  dosPath: string
  onNavigate: (p: string) => void
}) {
  return (
    <div className="px-1.5 py-1 border-b border-[var(--color-win-gray-dark)] flex items-center gap-1">
      <span className="text-[10px]">Address:</span>
      <div className="bevel-in bg-white px-2 py-0.5 flex-1 flex items-center gap-1 font-mono text-[11px]">
        {crumbs.map((c, i) => (
          <span key={c.path} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-500">\</span>}
            <button
              type="button"
              onClick={() => onNavigate(c.path)}
              className="hover:underline text-[var(--color-win-blue)]"
            >
              {c.label}
            </button>
          </span>
        ))}
        <span className="ml-auto text-gray-500 text-[10px]">{dosPath}</span>
      </div>
    </div>
  )
}

function Tree({ current, onNavigate }: { current: string; onNavigate: (p: string) => void }) {
  const [nodes, setNodes] = useState<{ path: string; name: string; expanded: boolean }[]>([])

  const loadRoot = useCallback(async () => {
    const top = await vfs.readdir(ROOT)
    setNodes([
      { path: ROOT, name: 'C:', expanded: true },
      ...top
        .filter((e) => e.type === 'directory')
        .map((e) => ({ path: `/${e.name}`, name: e.name, expanded: false })),
    ])
  }, [])

  useEffect(() => {
    loadRoot()
    const unsub = vfs.subscribe(() => loadRoot())
    return unsub
  }, [loadRoot])

  return (
    <div className="bevel-in bg-white w-44 shrink-0 overflow-auto py-1 text-[11px]">
      {nodes.map((n) => (
        <button
          key={n.path}
          type="button"
          onClick={() => onNavigate(n.path)}
          data-active={n.path === current}
          className="w-full text-left px-2 py-0.5 flex items-center gap-1 data-[active=true]:bg-[var(--color-win-title-from)] data-[active=true]:text-white"
        >
          {n.path === ROOT ? '💾' : '📁'}
          <span>{n.name}</span>
        </button>
      ))}
    </div>
  )
}

function FileGrid({
  entries,
  selection,
  onSelect,
  onActivate,
  error,
}: {
  entries: DirEntry[]
  selection: string | null
  onSelect: (name: string) => void
  onActivate: (e: DirEntry) => void
  error: string | null
}) {
  if (error) {
    return <div className="flex-1 bevel-in bg-white p-3 text-red-700 italic">Error: {error}</div>
  }
  if (entries.length === 0) {
    return <div className="flex-1 bevel-in bg-white p-3 text-gray-500 italic">(empty)</div>
  }
  return (
    <div
      className="flex-1 bevel-in bg-white overflow-auto p-2 grid gap-2"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', alignContent: 'start' }}
    >
      {entries.map((e) => (
        <button
          key={e.name}
          type="button"
          onClick={() => onSelect(e.name)}
          onDoubleClick={() => onActivate(e)}
          data-selected={selection === e.name}
          className="flex flex-col items-center gap-1 p-1 data-[selected=true]:bg-[var(--color-win-title-from)] data-[selected=true]:text-white rounded"
        >
          <span className="text-3xl leading-none">
            {e.type === 'directory' ? '📁' : iconFor(e.name)}
          </span>
          <span className="text-[10px] text-center break-all">{e.name}</span>
        </button>
      ))}
    </div>
  )
}

function iconFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (TEXT_EXTENSIONS.has(ext)) return '📄'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼'
  if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return '🎵'
  if (['mp4', 'avi', 'mkv', 'mov'].includes(ext)) return '🎬'
  return '📄'
}

function StatusBar({
  count,
  selected,
  cwd,
}: {
  count: number
  selected: string | null
  cwd: string
}) {
  return (
    <div className="bevel-in bg-[var(--color-win-gray)] m-1 mt-0 mx-1.5 px-2 py-0.5 flex gap-4 text-[10px]">
      <span>
        {count} object{count !== 1 ? 's' : ''}
      </span>
      {selected && <span>Selected: {selected}</span>}
      <span className="ml-auto">{cwd}</span>
    </div>
  )
}
