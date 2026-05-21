import { createLogger } from '../logger'

const log = createLogger('audio')

let ctx: AudioContext | null = null
let enabled = true
let volume = 0.4

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const C =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function setAudioEnabled(v: boolean): void {
  enabled = v
}

export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v))
}

function tone(freq: number, duration: number, type: OscillatorType = 'sine', when = 0): void {
  if (!enabled) return
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime + when)
  const start = c.currentTime + when
  const end = start + duration
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(volume, start + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.001, end)
  osc.connect(gain).connect(c.destination)
  osc.start(start)
  osc.stop(end)
}

export const sounds = {
  boot(): void {
    tone(440, 0.15, 'sine', 0)
    tone(660, 0.15, 'sine', 0.12)
    tone(880, 0.25, 'sine', 0.24)
  },
  click(): void {
    tone(2000, 0.02, 'square', 0)
  },
  error(): void {
    tone(220, 0.12, 'sawtooth', 0)
    tone(180, 0.18, 'sawtooth', 0.08)
  },
  ding(): void {
    tone(880, 0.06, 'sine', 0)
    tone(1320, 0.12, 'sine', 0.04)
  },
  windowOpen(): void {
    tone(800, 0.05, 'triangle', 0)
    tone(1200, 0.08, 'triangle', 0.03)
  },
  windowClose(): void {
    tone(1200, 0.05, 'triangle', 0)
    tone(800, 0.05, 'triangle', 0.03)
  },
  startup(): void {
    tone(523, 0.18, 'sine', 0)
    tone(659, 0.18, 'sine', 0.12)
    tone(784, 0.18, 'sine', 0.24)
    tone(1047, 0.3, 'sine', 0.36)
  },
  shutdown(): void {
    tone(1047, 0.18, 'sine', 0)
    tone(784, 0.18, 'sine', 0.12)
    tone(659, 0.18, 'sine', 0.24)
    tone(523, 0.3, 'sine', 0.36)
  },
}

let installed = false

export function installAudio(): void {
  if (installed) return
  installed = true
  log.info('audio subsystem ready (Web Audio)')
  // Prime on first user interaction (browser policy)
  function prime() {
    getCtx()
    window.removeEventListener('pointerdown', prime)
    window.removeEventListener('keydown', prime)
  }
  window.addEventListener('pointerdown', prime, { once: true })
  window.addEventListener('keydown', prime, { once: true })
}
