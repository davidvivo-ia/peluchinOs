import { createLogger } from '@/kernel/logger'
import { useEffect, useMemo, useState } from 'react'

const log = createLogger('boot')

const BOOT_STEPS = [
  { progress: 8, message: 'POST: ok' },
  { progress: 22, message: 'mounting kernel modules' },
  { progress: 38, message: 'starting logger subsystem' },
  { progress: 55, message: 'starting window manager' },
  { progress: 72, message: 'registering apps' },
  { progress: 88, message: 'loading shell' },
  { progress: 100, message: 'peluchinOs ready' },
] as const

export function BootScreen() {
  const [progress, setProgress] = useState(0)
  const [stepIndex, setStepIndex] = useState(-1)

  const nextStepProgress = useMemo(() => BOOT_STEPS[stepIndex + 1]?.progress ?? 100, [stepIndex])

  useEffect(() => {
    log.info('POST: power-on self-test')
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => Math.min(p + 3 + Math.random() * 6, 100))
    }, 110)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (progress >= nextStepProgress && stepIndex < BOOT_STEPS.length - 1) {
      const next = BOOT_STEPS[stepIndex + 1]
      log.info(next.message)
      setStepIndex(stepIndex + 1)
    }
  }, [progress, stepIndex, nextStepProgress])

  const currentMessage = stepIndex >= 0 ? BOOT_STEPS[stepIndex].message : 'POST: power-on self-test'

  return (
    <div className="h-full w-full bg-black flex flex-col items-center justify-center relative">
      <div className="flex flex-col items-center gap-7">
        <h1 className="text-6xl font-bold text-white tracking-wide">
          peluchin<span className="text-[var(--color-win-cyan)]">Os</span>
        </h1>
        <p className="text-white/70 text-[10px] uppercase tracking-[0.3em] h-3">{currentMessage}</p>
        <ProgressBar value={progress} />
      </div>
      <p className="absolute bottom-6 text-white/40 text-[10px]">
        v0.0.1 — built with vibes © 2026
      </p>
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-72 h-4 border border-white/30 bg-black p-[2px]">
      <div
        className="h-full transition-[width] duration-100 ease-linear"
        style={{
          width: `${value}%`,
          background:
            'linear-gradient(90deg, var(--color-win-blue) 0%, var(--color-win-cyan) 100%)',
        }}
      />
    </div>
  )
}
