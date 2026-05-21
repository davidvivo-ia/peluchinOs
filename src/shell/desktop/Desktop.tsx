import { getApp } from '@/apps/registry'
import { useWMStore } from '@/kernel/window-manager'
import { Taskbar } from '../taskbar/Taskbar'
import { Window } from '../window/Window'

export function Desktop() {
  const windows = useWMStore((s) => s.windows)

  return (
    <div className="h-full w-full flex flex-col bg-[var(--color-win-teal)]">
      <div className="flex-1 relative overflow-hidden">
        <DesktopHint visible={windows.length === 0} />
        {windows.map((w) => {
          const app = getApp(w.appId)
          if (!app) return null
          const AppComponent = app.component
          return (
            <Window key={w.id} window={w}>
              <AppComponent window={w} />
            </Window>
          )
        })}
      </div>
      <Taskbar />
    </div>
  )
}

function DesktopHint({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div className="absolute top-6 left-6 max-w-xs bevel-out bg-[var(--color-win-gray)] p-3 text-[11px]">
      <div className="font-bold mb-1">Welcome to peluchinOs</div>
      <p className="leading-snug mb-2">
        Open the <span className="font-bold">Event Viewer</span> from the Start menu to inspect the
        kernel log in real time.
      </p>
      <p className="leading-snug text-gray-700">
        Press <kbd className="bevel-out px-1 bg-[var(--color-win-gray)]">F2</kbd> to spawn a demo
        log entry.
      </p>
    </div>
  )
}
