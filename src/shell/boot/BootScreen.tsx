import { useEffect, useState } from 'react'

export function BootScreen() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => Math.min(p + 4 + Math.random() * 9, 100))
    }, 120)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="h-full w-full bg-black flex flex-col items-center justify-center relative">
      <div className="flex flex-col items-center gap-7">
        <h1 className="text-6xl font-bold text-white tracking-wide">
          peluchin<span className="text-[var(--color-win-cyan)]">Os</span>
        </h1>
        <p className="text-white/70 text-xs uppercase tracking-[0.3em]">Starting peluchinOs…</p>
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
