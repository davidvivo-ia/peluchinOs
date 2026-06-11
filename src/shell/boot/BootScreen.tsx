import { createLogger } from '@/kernel/logger'
import type { LogLevel } from '@/kernel/logger'
import { probes, runProbe } from '@/kernel/probes'
import type { Probe } from '@/kernel/probes'
import { useEffect, useRef, useState } from 'react'

const log = createLogger('boot')

type LineKind = 'kernel' | 'ok' | 'failed' | 'warn' | 'tty' | 'detail'

interface StaticItem {
  kind: 'static'
  delay: number
  lineKind: Exclude<LineKind, 'detail'>
  text: string
  logLevel?: LogLevel
}

interface ProbeItem {
  kind: 'probe'
  delay: number
  probe: Probe
}

type QueueItem = StaticItem | ProbeItem

interface RenderedLine {
  id: number
  kind: LineKind
  text: string
  ts: number
}

const t = (
  delay: number,
  lineKind: StaticItem['lineKind'],
  text: string,
  logLevel?: LogLevel,
): StaticItem => ({ kind: 'static', delay, lineKind, text, logLevel })

const KERNEL_INTRO: QueueItem[] = [
  t(0, 'tty', 'Welcome to peluchinOs 0.0.1-fluffy (Linux 6.18.5-peluchin)!'),
  t(40, 'tty', ''),
  t(10, 'kernel', 'Linux version 6.18.5-peluchin (root@plushie-build) (gcc 14.1.0) #1 SMP'),
  t(30, 'kernel', 'Command line: BOOT_IMAGE=/peluchinOs ro quiet splash theme=win2k-hybrid'),
  t(20, 'kernel', 'CPU0: stuffed cotton @ 95.00 MHz (family 0x3, model 0x1, stepping 0x2)'),
  t(18, 'kernel', 'x86/fpu: Supported XSAVE features: hugs, pats, snuggles'),
  t(15, 'kernel', 'Memory: 128K/256K available (plushie heap @ 0xfeedface)'),
  t(25, 'kernel', 'ACPI: bus type PCI registered'),
  t(20, 'kernel', 'pci 0000:00:01.0: VGA-compatible controller [0300]: peluchin display'),
  t(35, 'kernel', 'usbcore: registered new interface driver usb-storage'),
  t(30, 'kernel', 'random: crng init done (entropy harvested from teddy bear)'),
  t(40, 'kernel', 'EXT4-fs (plush0): mounted filesystem with ordered data mode'),
  t(30, 'kernel', 'systemd[1]: peluchinOs 247.3-1pelu running in system mode'),
  t(60, 'tty', ''),
  t(0, 'tty', 'Running peluchinOs self-tests...'),
  t(20, 'tty', ''),
]

const REACHED_TARGETS: QueueItem[] = [
  t(60, 'tty', ''),
  t(20, 'ok', 'Reached target Multi-User System.'),
  t(20, 'ok', 'Reached target Graphical Interface.'),
]

const LOGIN_OUTRO: QueueItem[] = [
  t(160, 'tty', ''),
  t(10, 'tty', 'peluchinOs 0.0.1-fluffy ttyS0'),
  t(220, 'tty', ''),
  t(60, 'tty', 'peluchinOs login: peluchin'),
  t(420, 'tty', 'Password: ********'),
  t(280, 'tty', ''),
  t(20, 'tty', 'Last login: Wed May 20 23:47:11 2026 on ttyS0'),
  t(20, 'tty', 'peluchin@peluchinos:~$ startx'),
  t(200, 'tty', '  → connecting to display :0'),
  t(110, 'tty', '  → loading wm.service'),
  t(110, 'tty', '  → mounting desktop environment'),
]

function buildQueue(): QueueItem[] {
  const probeItems: ProbeItem[] = probes.map((probe) => ({
    kind: 'probe',
    delay: 45,
    probe,
  }))
  return [...KERNEL_INTRO, ...probeItems, ...REACHED_TARGETS, ...LOGIN_OUTRO]
}

interface BootScreenProps {
  onComplete: () => void
}

export function BootScreen({ onComplete }: BootScreenProps) {
  const [lines, setLines] = useState<RenderedLine[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let pendingResolve: (() => void) | null = null
    let elapsedSec = 0
    let nextId = 0
    const queue = buildQueue()
    const probeStartTime = Date.now()
    let probesProcessed = 0
    const tally = { ok: 0, warn: 0, failed: 0 }
    const totalProbes = queue.filter((q) => q.kind === 'probe').length

    setLines([])

    function wait(ms: number) {
      return new Promise<void>((resolve) => {
        pendingResolve = resolve
        timeoutId = setTimeout(() => {
          pendingResolve = null
          resolve()
        }, ms)
      })
    }

    function pushLine(line: Omit<RenderedLine, 'id'>) {
      const id = nextId++
      setLines((prev) => [...prev, { ...line, id }])
    }

    function logForStatic(item: StaticItem) {
      if (!item.text) return
      const level: LogLevel =
        item.logLevel ??
        (item.lineKind === 'failed' ? 'error' : item.lineKind === 'warn' ? 'warn' : 'info')
      log[level](item.text)
    }

    async function processProbe(item: ProbeItem) {
      const result = await runProbe(item.probe)
      if (cancelled) return
      const text =
        result.status === 'failed'
          ? `Failed to start ${item.probe.service}.`
          : `Started ${item.probe.service}.`
      const lineKind: LineKind =
        result.status === 'ok' ? 'ok' : result.status === 'warn' ? 'warn' : 'failed'
      pushLine({ kind: lineKind, text, ts: elapsedSec })

      const logLevel: LogLevel =
        result.status === 'ok' ? 'info' : result.status === 'warn' ? 'warn' : 'error'
      log[logLevel](text, result.detail ? { detail: result.detail } : undefined)

      if (result.detail && result.status !== 'ok') {
        pushLine({ kind: 'detail', text: result.detail, ts: elapsedSec })
      }

      tally[result.status]++
      probesProcessed++

      if (probesProcessed === totalProbes) {
        const took = ((Date.now() - probeStartTime) / 1000).toFixed(3)
        const summary = `systemd[1]: Startup finished in ${took}s — ${tally.ok} ok, ${tally.warn} warn, ${tally.failed} failed.`
        pushLine({ kind: 'kernel', text: summary, ts: elapsedSec })
        const summaryLevel: LogLevel = tally.failed > 0 ? 'error' : tally.warn > 0 ? 'warn' : 'info'
        log[summaryLevel](summary, { ...tally, durationSec: took })
      }
    }

    async function run() {
      for (const item of queue) {
        if (cancelled) return
        await wait(item.delay)
        if (cancelled) return
        elapsedSec += item.delay / 1000

        if (item.kind === 'static') {
          pushLine({ kind: item.lineKind, text: item.text, ts: elapsedSec })
          logForStatic(item)
        } else {
          await processProbe(item)
        }
      }
      if (cancelled) return
      await wait(650)
      if (!cancelled) onCompleteRef.current()
    }

    run().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`boot sequence crashed: ${msg}`)
      // Fail open: a crashed boot animation must never strand the user
      // on the boot screen. Whatever subsystem broke will surface its
      // own errors once the desktop is up.
      if (!cancelled) onCompleteRef.current()
    })

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      if (pendingResolve) pendingResolve()
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-scroll on every new line
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines.length])

  return (
    <div className="h-full w-full bg-black">
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-auto p-3 font-mono text-[12px] leading-[1.35] text-[#d4d4d4]"
      >
        {lines.map((l) => (
          <Line key={l.id} line={l} />
        ))}
        <span className="animate-cursor inline-block w-[7px] h-[12px] bg-[#d4d4d4] align-text-bottom" />
      </div>
    </div>
  )
}

function Line({ line }: { line: RenderedLine }) {
  if (line.kind === 'tty' && !line.text) return <div>&nbsp;</div>
  if (line.kind === 'tty') {
    return <div className="whitespace-pre-wrap">{line.text}</div>
  }
  if (line.kind === 'detail') {
    return (
      <div className="whitespace-pre-wrap">
        <span className="text-[#888]">{'         └─ '}</span>
        <span className="text-[#bbb]">{line.text}</span>
      </div>
    )
  }
  if (line.kind === 'kernel') {
    return (
      <div className="whitespace-pre-wrap">
        <span className="text-[#7c7c7c]">[{formatTs(line.ts)}]</span>{' '}
        <span className="text-[#d4d4d4]">{line.text}</span>
      </div>
    )
  }
  if (line.kind === 'ok') {
    return (
      <div className="whitespace-pre-wrap">
        <span className="text-[#5fd75f] font-bold">{'[  OK  ]'}</span>{' '}
        <span className="text-[#d4d4d4]">{line.text}</span>
      </div>
    )
  }
  if (line.kind === 'warn') {
    return (
      <div className="whitespace-pre-wrap">
        <span className="text-[#ffaf00] font-bold">{'[ WARN ]'}</span>{' '}
        <span className="text-[#d4d4d4]">{line.text}</span>
      </div>
    )
  }
  return (
    <div className="whitespace-pre-wrap">
      <span className="text-[#ff5f5f] font-bold">{'[FAILED]'}</span>{' '}
      <span className="text-[#d4d4d4]">{line.text}</span>
    </div>
  )
}

function formatTs(seconds: number): string {
  return seconds.toFixed(6).padStart(11, ' ')
}
