import { LOG_LEVELS, useLogStore } from '@/kernel/logger'
import type { LogEntry, LogLevel } from '@/kernel/logger'
import { LOG_LEVEL_RANK } from '@/kernel/logger'
import { useEffect, useMemo, useRef, useState } from 'react'

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: '#666',
  debug: '#0a5',
  info: '#000',
  warn: '#b45a00',
  error: '#c00',
  fatal: '#fff',
}

const LEVEL_BG: Partial<Record<LogLevel, string>> = {
  fatal: '#c00',
}

export function EventViewer() {
  const entries = useLogStore((s) => s.entries)
  const paused = useLogStore((s) => s.paused)
  const setPaused = useLogStore((s) => s.setPaused)
  const clear = useLogStore((s) => s.clear)

  const [minLevel, setMinLevel] = useState<LogLevel>('trace')
  const [source, setSource] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const sources = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) set.add(e.source)
    return ['all', ...Array.from(set).sort()]
  }, [entries])

  const filtered = useMemo(() => {
    const minRank = LOG_LEVEL_RANK[minLevel]
    const q = query.trim().toLowerCase()
    return entries.filter((e) => {
      if (LOG_LEVEL_RANK[e.level] < minRank) return false
      if (source !== 'all' && e.source !== source) return false
      if (q && !e.message.toLowerCase().includes(q) && !e.source.toLowerCase().includes(q))
        return false
      return true
    })
  }, [entries, minLevel, source, query])

  const listRef = useRef<HTMLDivElement | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-scroll when new entries arrive
  useEffect(() => {
    if (!autoScroll || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [filtered.length, autoScroll])

  const selected = filtered.find((e) => e.id === selectedId) ?? null

  return (
    <div className="h-full flex flex-col bg-[var(--color-win-gray)] text-[11px]">
      <Toolbar
        paused={paused}
        onPauseToggle={() => setPaused(!paused)}
        onClear={() => {
          clear()
          setSelectedId(null)
        }}
        onExport={() => exportJson(filtered)}
        autoScroll={autoScroll}
        onAutoScrollToggle={() => setAutoScroll(!autoScroll)}
        count={filtered.length}
        total={entries.length}
      />
      <Filters
        minLevel={minLevel}
        onMinLevelChange={setMinLevel}
        source={source}
        sources={sources}
        onSourceChange={setSource}
        query={query}
        onQueryChange={setQuery}
      />
      <div ref={listRef} className="flex-1 min-h-0 overflow-auto bevel-in bg-white mx-1">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-[var(--color-win-gray)] text-left">
            <tr>
              <Th className="w-[68px]">Time</Th>
              <Th className="w-[58px]">Level</Th>
              <Th className="w-[120px]">Source</Th>
              <Th>Message</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <Row
                key={e.id}
                entry={e}
                selected={e.id === selectedId}
                onClick={() => setSelectedId(e.id === selectedId ? null : e.id)}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="p-3 text-center text-gray-500 italic">
                  No log entries match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Details entry={selected} />
      <StatusBar
        filtered={filtered.length}
        total={entries.length}
        paused={paused}
        autoScroll={autoScroll}
      />
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-1.5 py-0.5 font-bold border-r border-b border-[var(--color-win-gray-dark)] ${className}`}
    >
      {children}
    </th>
  )
}

function Row({
  entry,
  selected,
  onClick,
}: {
  entry: LogEntry
  selected: boolean
  onClick: () => void
}) {
  const bg = LEVEL_BG[entry.level]
  return (
    <tr
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      tabIndex={0}
      className="cursor-default hover:bg-[#e6f0ff] focus:outline-none focus:bg-[#dde9ff]"
      style={
        selected
          ? { background: 'var(--color-win-title-from)', color: 'white' }
          : bg
            ? { background: bg, color: 'white' }
            : undefined
      }
    >
      <Td>{formatTime(entry.ts)}</Td>
      <Td>
        <span
          style={{
            color: selected || bg ? 'white' : LEVEL_COLORS[entry.level],
            fontWeight: 'bold',
          }}
        >
          {entry.level.toUpperCase()}
        </span>
      </Td>
      <Td className="font-mono">{entry.source}</Td>
      <Td className="truncate max-w-0">{entry.message}</Td>
    </tr>
  )
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-1.5 py-0.5 align-top ${className}`}>{children}</td>
}

interface ToolbarProps {
  paused: boolean
  onPauseToggle: () => void
  onClear: () => void
  onExport: () => void
  autoScroll: boolean
  onAutoScrollToggle: () => void
  count: number
  total: number
}

function Toolbar({
  paused,
  onPauseToggle,
  onClear,
  onExport,
  autoScroll,
  onAutoScrollToggle,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-1 py-1 border-b border-[var(--color-win-gray-dark)]">
      <ToolbarButton onClick={onPauseToggle}>{paused ? '▶ Resume' : '❚❚ Pause'}</ToolbarButton>
      <ToolbarButton onClick={onClear}>🗑 Clear</ToolbarButton>
      <ToolbarButton onClick={onExport}>⤓ Export JSON</ToolbarButton>
      <div className="w-px h-4 bg-[var(--color-win-gray-dark)] mx-1" />
      <label className="flex items-center gap-1 text-[11px]">
        <input type="checkbox" checked={autoScroll} onChange={onAutoScrollToggle} />
        Auto-scroll
      </label>
    </div>
  )
}

function ToolbarButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bevel-out bg-[var(--color-win-gray)] px-2 py-0.5 active:translate-y-px text-[11px]"
    >
      {children}
    </button>
  )
}

interface FiltersProps {
  minLevel: LogLevel
  onMinLevelChange: (l: LogLevel) => void
  source: string
  sources: string[]
  onSourceChange: (s: string) => void
  query: string
  onQueryChange: (q: string) => void
}

function Filters({
  minLevel,
  onMinLevelChange,
  source,
  sources,
  onSourceChange,
  query,
  onQueryChange,
}: FiltersProps) {
  return (
    <div className="flex items-center gap-2 px-1 py-1 border-b border-[var(--color-win-gray-dark)]">
      <label className="flex items-center gap-1">
        <span>Level:</span>
        <select
          value={minLevel}
          onChange={(e) => onMinLevelChange(e.target.value as LogLevel)}
          className="bevel-in bg-white px-1"
        >
          {LOG_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <span>Source:</span>
        <select
          value={source}
          onChange={(e) => onSourceChange(e.target.value)}
          className="bevel-in bg-white px-1 max-w-[160px]"
        >
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 flex-1">
        <span>Find:</span>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="message or source…"
          className="bevel-in bg-white px-1 flex-1"
        />
      </label>
    </div>
  )
}

function Details({ entry }: { entry: LogEntry | null }) {
  if (!entry) return null
  return (
    <div className="border-t border-[var(--color-win-gray-dark)] bg-[var(--color-win-gray-light)] p-1.5 max-h-32 overflow-auto">
      <div className="flex gap-2 mb-1">
        <strong>{entry.level.toUpperCase()}</strong>
        <span className="font-mono">{entry.source}</span>
        <span>{new Date(entry.ts).toISOString()}</span>
      </div>
      <div className="font-mono whitespace-pre-wrap break-all">{entry.message}</div>
      {entry.payload !== undefined && (
        <pre className="mt-1 bg-white p-1 bevel-in text-[10px] overflow-auto">
          {safeStringify(entry.payload)}
        </pre>
      )}
    </div>
  )
}

function StatusBar({
  filtered,
  total,
  paused,
  autoScroll,
}: {
  filtered: number
  total: number
  paused: boolean
  autoScroll: boolean
}) {
  return (
    <div className="bevel-in bg-[var(--color-win-gray)] px-2 py-0.5 text-[10px] flex gap-3 m-1 mt-0">
      <span>
        {filtered} shown / {total} total
      </span>
      {paused && <span className="text-[#b45a00] font-bold">PAUSED</span>}
      {!autoScroll && <span className="text-gray-600">auto-scroll off</span>}
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function exportJson(entries: LogEntry[]) {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `peluchinOs-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
