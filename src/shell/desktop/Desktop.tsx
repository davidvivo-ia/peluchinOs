import { Taskbar } from '../taskbar/Taskbar'

export function Desktop() {
  return (
    <div className="h-full w-full flex flex-col bg-[var(--color-win-teal)]">
      <div className="flex-1 relative overflow-hidden">
        <WelcomeNote />
      </div>
      <Taskbar />
    </div>
  )
}

function WelcomeNote() {
  return (
    <div className="absolute top-6 left-6 max-w-xs bevel-out bg-[var(--color-win-gray)] p-3 text-[11px]">
      <div className="font-bold mb-1">Welcome to peluchinOs</div>
      <p className="leading-snug">
        Phase 1 is alive. The Terminal, window manager and VFS land next.
      </p>
    </div>
  )
}
