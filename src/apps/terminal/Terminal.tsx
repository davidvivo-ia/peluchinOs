import { getApp } from '@/apps/registry'
import { createLogger } from '@/kernel/logger'
import { useSystemStore } from '@/kernel/system'
import { bootstrapFilesystem, toDosPath } from '@/kernel/vfs'
import { useWMStore } from '@/kernel/window-manager'
import type { WindowState } from '@/kernel/window-manager'
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { complete } from './completion'
import { type ExecState, execute } from './executor'
import type { TerminalApi } from './types'

const log = createLogger('terminal')

interface OutLine {
  id: number
  stream: 'stdout' | 'stderr' | 'prompt' | 'info'
  text: string
}

const INITIAL_BANNER =
  'peluchinOs 1.0.0-fluffy — Linux 6.18.5-peluchin\nType "help" for a list of commands.\n'

export function Terminal({ window: w }: { window: WindowState }) {
  const [lines, setLines] = useState<OutLine[]>([{ id: 0, stream: 'info', text: INITIAL_BANNER }])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState<number>(-1)
  const [state, setState] = useState<ExecState>({
    cwd: '/home/peluchin',
    env: {
      USER: 'peluchin',
      HOME: '/home/peluchin',
      HOSTNAME: 'peluchinos',
      PATH: '/usr/bin',
      SHELL: '/bin/peluchsh',
      TERM: 'xterm-peluchin',
      __HISTORY__: '[]',
    },
  })
  const [executing, setExecuting] = useState(false)
  const [vfsReady, setVfsReady] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const nextIdRef = useRef(1)

  useEffect(() => {
    let cancelled = false
    bootstrapFilesystem()
      .then(() => {
        if (!cancelled) setVfsReady(true)
      })
      .catch((e) => {
        if (cancelled) return
        log.error(`vfs bootstrap failed: ${(e as Error).message}`)
        setLines((prev) => [
          ...prev,
          {
            id: nextIdRef.current++,
            stream: 'stderr',
            text: `vfs bootstrap failed: ${(e as Error).message}`,
          },
        ])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to bottom on each new line
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines.length])

  useEffect(() => {
    if (w.focused && !w.minimized) inputRef.current?.focus()
  }, [w.focused, w.minimized])

  const terminalApiRef = useRef<TerminalApi>({
    clear: () => setLines([]),
    exit: () => useWMStore.getState().close(w.id),
    reboot: () => {
      log.info('terminal: reboot requested')
      useSystemStore.getState().requestReboot()
    },
    shutdown: () => {
      log.warn('terminal: shutdown requested')
      useSystemStore.getState().requestShutdown()
    },
    open: (appId: string) => {
      const app = getApp(appId)
      if (!app) return
      useWMStore.getState().open({
        appId: app.id,
        title: app.name,
        icon: app.icon,
        defaultSize: app.defaultSize,
        minSize: app.minSize,
        resizable: app.resizable,
      })
    },
  })
  terminalApiRef.current.exit = () => useWMStore.getState().close(w.id)

  const pushLines = useCallback((newLines: Omit<OutLine, 'id'>[]) => {
    setLines((prev) => [...prev, ...newLines.map((l) => ({ ...l, id: nextIdRef.current++ }))])
  }, [])

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (executing || !vfsReady) return
      const cmd = input
      pushLines([{ stream: 'prompt', text: `${prompt(state.cwd)} ${cmd}` }])
      setInput('')
      if (cmd.trim()) {
        const newHistory = [...history, cmd]
        setHistory(newHistory)
        setHistoryIdx(-1)
        setState((s) => ({ ...s, env: { ...s.env, __HISTORY__: JSON.stringify(newHistory) } }))
      }
      if (!cmd.trim()) return
      setExecuting(true)
      try {
        const result = await execute(cmd, state, terminalApiRef.current)
        const next: Omit<OutLine, 'id'>[] = result.lines.map((l) => ({
          stream: l.stream === 'info' ? 'info' : l.stream,
          text: l.text,
        }))
        if (next.length > 0) pushLines(next)
        setState((s) => ({
          cwd: result.cwd,
          env: { ...s.env, ...result.env },
        }))
      } finally {
        setExecuting(false)
      }
    },
    [executing, vfsReady, input, state, history, pushLines],
  )

  const onKey = useCallback(
    async (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (history.length === 0) return
        const newIdx = historyIdx < 0 ? history.length - 1 : Math.max(0, historyIdx - 1)
        setHistoryIdx(newIdx)
        setInput(history[newIdx])
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (history.length === 0 || historyIdx < 0) return
        const newIdx = historyIdx + 1
        if (newIdx >= history.length) {
          setHistoryIdx(-1)
          setInput('')
        } else {
          setHistoryIdx(newIdx)
          setInput(history[newIdx])
        }
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const result = await complete(input, state.cwd)
        if (result.completion) {
          setInput(input + result.completion)
        } else if (result.candidates.length > 1) {
          pushLines([
            { stream: 'prompt', text: `${prompt(state.cwd)} ${input}` },
            { stream: 'info', text: result.candidates.join('  ') },
          ])
        }
        return
      }
      if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault()
        terminalApiRef.current.clear()
        return
      }
      if (e.key === 'c' && e.ctrlKey) {
        e.preventDefault()
        pushLines([{ stream: 'prompt', text: `${prompt(state.cwd)} ${input}^C` }])
        setInput('')
        return
      }
    },
    [history, historyIdx, input, state.cwd, pushLines],
  )

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: input below already takes keyboard focus
    <div
      className="h-full w-full bg-black text-[#c9c9c9] font-mono text-[12px] leading-[1.4] flex flex-col"
      onClick={() => inputRef.current?.focus()}
    >
      <div ref={containerRef} className="flex-1 overflow-y-auto px-2 py-1 whitespace-pre-wrap">
        {lines.map((l) => (
          <div
            key={l.id}
            className={
              l.stream === 'stderr'
                ? 'text-[#ff7878]'
                : l.stream === 'prompt'
                  ? 'text-[#aaffaa]'
                  : l.stream === 'info'
                    ? 'text-[#9cd6ff]'
                    : 'text-[#c9c9c9]'
            }
          >
            {l.text || ' '}
          </div>
        ))}
        <form onSubmit={onSubmit} className="flex items-center">
          <span className="text-[#aaffaa]">{prompt(state.cwd)}</span>
          <span className="text-[#aaffaa]">&nbsp;</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={executing || !vfsReady}
            className="flex-1 bg-transparent border-0 outline-0 text-[#c9c9c9] font-mono text-[12px] caret-[#c9c9c9]"
            autoComplete="off"
            spellCheck={false}
          />
        </form>
      </div>
    </div>
  )
}

function prompt(cwd: string): string {
  return `${toDosPath(cwd)}>`
}
