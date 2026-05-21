import { useEffect, useState } from 'react'

export function Taskbar() {
  return (
    <div
      className="h-7 bg-[var(--color-win-gray)] flex items-center px-1 gap-1 shrink-0"
      style={{ boxShadow: 'inset 0 1px 0 var(--color-win-white)' }}
    >
      <StartButton />
      <div className="flex-1" />
      <Clock />
    </div>
  )
}

function StartButton() {
  return (
    <button
      type="button"
      className="bevel-out px-2 py-0.5 text-[11px] font-bold flex items-center gap-1 bg-[var(--color-win-gray)] active:translate-y-px"
    >
      <StartLogo />
      Start
    </button>
  )
}

function StartLogo() {
  return (
    <span
      aria-hidden
      className="inline-block w-3.5 h-3.5"
      style={{
        background:
          'conic-gradient(from 0deg, #e74c3c 0deg 90deg, #f1c40f 90deg 180deg, #2ecc71 180deg 270deg, #3498db 270deg 360deg)',
        borderRadius: 2,
      }}
    />
  )
}

function Clock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return <div className="bevel-in px-2 py-0.5 text-[11px] bg-[var(--color-win-gray)]">{time}</div>
}
