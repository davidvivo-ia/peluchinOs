import { createLogger } from '@/kernel/logger'
import type { LogLevel } from '@/kernel/logger'
import { useEffect, useRef, useState } from 'react'

const log = createLogger('boot')

type LineKind = 'kernel' | 'ok' | 'failed' | 'warn' | 'tty'

interface QueueItem {
  delay: number
  kind: LineKind
  text: string
  logLevel?: LogLevel
}

interface RenderedLine {
  id: number
  kind: LineKind
  text: string
  ts: number
}

const QUEUE: ReadonlyArray<QueueItem> = [
  { delay: 0, kind: 'tty', text: 'Welcome to peluchinOs 0.0.1-fluffy (Linux 6.18.5-peluchin)!' },
  { delay: 40, kind: 'tty', text: '' },
  {
    delay: 10,
    kind: 'kernel',
    text: 'Linux version 6.18.5-peluchin (root@plushie-build) (gcc 14.1.0) #1 SMP',
  },
  {
    delay: 30,
    kind: 'kernel',
    text: 'Command line: BOOT_IMAGE=/peluchinOs ro quiet splash theme=win2k-hybrid',
  },
  {
    delay: 20,
    kind: 'kernel',
    text: 'CPU0: stuffed cotton @ 95.00 MHz (family 0x3, model 0x1, stepping 0x2)',
  },
  { delay: 18, kind: 'kernel', text: 'x86/fpu: Supported XSAVE features: hugs, pats, snuggles' },
  { delay: 15, kind: 'kernel', text: 'Memory: 128K/256K available (plushie heap @ 0xfeedface)' },
  { delay: 25, kind: 'kernel', text: 'ACPI: bus type PCI registered' },
  {
    delay: 20,
    kind: 'kernel',
    text: 'pci 0000:00:01.0: VGA-compatible controller [0300]: peluchin display',
  },
  { delay: 35, kind: 'kernel', text: 'usbcore: registered new interface driver usb-storage' },
  { delay: 30, kind: 'kernel', text: 'random: crng init done (entropy harvested from teddy bear)' },
  {
    delay: 40,
    kind: 'kernel',
    text: 'EXT4-fs (plush0): mounted filesystem with ordered data mode',
  },
  { delay: 30, kind: 'kernel', text: 'systemd[1]: peluchinOs 247.3-1pelu running in system mode' },
  { delay: 80, kind: 'tty', text: '' },
  { delay: 10, kind: 'ok', text: 'Started udev Kernel Device Manager' },
  { delay: 25, kind: 'ok', text: 'Mounted /home (plushfs)' },
  { delay: 25, kind: 'ok', text: 'Reached target Local File Systems' },
  { delay: 35, kind: 'ok', text: 'Started Kernel Logger Subsystem' },
  { delay: 25, kind: 'ok', text: 'Started Event Bus' },
  {
    delay: 25,
    kind: 'warn',
    text: 'plushfs autofsck not yet implemented — skipping integrity check',
    logLevel: 'warn',
  },
  { delay: 30, kind: 'ok', text: 'Started Window Manager (wm.service)' },
  { delay: 25, kind: 'ok', text: 'Started Theme Engine (win2k-hybrid)' },
  { delay: 25, kind: 'ok', text: 'Started Application Registry' },
  { delay: 25, kind: 'ok', text: 'Started peluchinOs Session Manager' },
  { delay: 30, kind: 'ok', text: 'Reached target Multi-User System' },
  { delay: 30, kind: 'ok', text: 'Reached target Graphical Interface' },
  { delay: 200, kind: 'tty', text: '' },
  { delay: 10, kind: 'tty', text: 'peluchinOs 0.0.1-fluffy ttyS0' },
  { delay: 250, kind: 'tty', text: '' },
  { delay: 80, kind: 'tty', text: 'peluchinOs login: peluchin' },
  { delay: 480, kind: 'tty', text: 'Password: ********' },
  { delay: 320, kind: 'tty', text: '' },
  { delay: 20, kind: 'tty', text: 'Last login: Wed May 20 23:47:11 2026 on ttyS0' },
  { delay: 20, kind: 'tty', text: 'peluchin@peluchinos:~$ startx' },
  { delay: 220, kind: 'tty', text: '  → connecting to display :0' },
  { delay: 110, kind: 'tty', text: '  → loading wm.service' },
  { delay: 110, kind: 'tty', text: '  → mounting desktop environment' },
] as const

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
    let elapsedSec = 0
    let i = 0
    let nextId = 0

    setLines([])

    function step() {
      if (cancelled) return
      if (i >= QUEUE.length) {
        timeoutId = setTimeout(() => {
          if (!cancelled) onCompleteRef.current()
        }, 650)
        return
      }
      const item = QUEUE[i]
      timeoutId = setTimeout(() => {
        if (cancelled) return
        elapsedSec += item.delay / 1000
        const line: RenderedLine = {
          id: nextId++,
          kind: item.kind,
          text: item.text,
          ts: elapsedSec,
        }
        setLines((prev) => [...prev, line])

        if (item.text) {
          const level: LogLevel =
            item.logLevel ??
            (item.kind === 'failed' ? 'error' : item.kind === 'warn' ? 'warn' : 'info')
          log[level](item.text)
        }
        i++
        step()
      }, item.delay)
    }

    step()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: pin to lines.length
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
