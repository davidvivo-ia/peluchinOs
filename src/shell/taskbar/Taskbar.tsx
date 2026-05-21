import { useWMStore } from '@/kernel/window-manager'
import type { WindowState } from '@/kernel/window-manager'
import { useEffect, useState } from 'react'
import { StartMenu } from '../start-menu/StartMenu'

export function Taskbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const windows = useWMStore((s) => s.windows)

  return (
    <div
      className="relative h-7 bg-[var(--color-win-gray)] flex items-center px-1 gap-1 shrink-0"
      style={{ boxShadow: 'inset 0 1px 0 var(--color-win-white)' }}
    >
      <StartButton active={menuOpen} onClick={() => setMenuOpen((v) => !v)} />
      <div className="flex-1 flex items-center gap-1 overflow-hidden">
        {windows.map((w) => (
          <TaskbarItem key={w.id} window={w} />
        ))}
      </div>
      <Tray />
      {menuOpen && <StartMenu onClose={() => setMenuOpen(false)} />}
    </div>
  )
}

function StartButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="bevel-out px-2 py-0.5 text-[11px] font-bold flex items-center gap-1 bg-[var(--color-win-gray)] active:translate-y-px data-[active=true]:bevel-in"
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

function TaskbarItem({ window: w }: { window: WindowState }) {
  const focus = useWMStore((s) => s.focus)
  const minimize = useWMStore((s) => s.minimize)
  const restore = useWMStore((s) => s.restore)
  const isPressed = w.focused && !w.minimized
  const onClick = () => {
    if (w.minimized) restore(w.id)
    else if (w.focused) minimize(w.id)
    else focus(w.id)
  }
  return (
    <button
      type="button"
      onClick={onClick}
      data-pressed={isPressed}
      className="h-5 px-1.5 max-w-44 text-[11px] flex items-center gap-1 bg-[var(--color-win-gray)] truncate bevel-out data-[pressed=true]:bevel-in"
    >
      {w.icon && <span className="text-[12px] leading-none shrink-0">{w.icon}</span>}
      <span className="truncate">{w.title}</span>
    </button>
  )
}

function Tray() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return <div className="bevel-in px-2 py-0.5 text-[11px] bg-[var(--color-win-gray)]">{time}</div>
}
