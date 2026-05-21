import { listStartMenuApps } from '@/apps/registry'
import { createLogger } from '@/kernel/logger'
import { useWMStore } from '@/kernel/window-manager'
import { useEffect, useRef } from 'react'

const log = createLogger('startmenu')

interface StartMenuProps {
  onClose: () => void
}

export function StartMenu({ onClose }: StartMenuProps) {
  const open = useWMStore((s) => s.open)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const apps = listStartMenuApps()

  return (
    <div
      ref={ref}
      className="absolute left-0 bottom-7 bevel-out bg-[var(--color-win-gray)] w-56 z-[10000] shadow-lg"
    >
      <div
        className="flex items-stretch"
        style={{
          background: 'linear-gradient(180deg, var(--color-win-title-from), var(--color-win-blue))',
          color: 'white',
        }}
      >
        <div className="px-2 py-3 text-sm font-bold tracking-wide [writing-mode:vertical-rl] rotate-180">
          peluchin<span className="text-[var(--color-win-cyan)]">Os</span>
        </div>
        <div className="flex-1 py-1">
          {apps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => {
                log.info(`launch ${app.id}`)
                open({
                  appId: app.id,
                  title: app.name,
                  icon: app.icon,
                  defaultSize: app.defaultSize,
                  minSize: app.minSize,
                  resizable: app.resizable,
                })
                onClose()
              }}
              className="w-full text-left px-2 py-1.5 text-[12px] flex items-center gap-2 text-black bg-[var(--color-win-gray)] hover:bg-[var(--color-win-title-from)] hover:text-white"
            >
              <span className="text-lg leading-none">{app.icon}</span>
              <span>{app.name}</span>
            </button>
          ))}
          <Separator />
          <button
            type="button"
            onClick={() => {
              log.warn('shutdown requested (not implemented)')
              onClose()
            }}
            className="w-full text-left px-2 py-1.5 text-[12px] flex items-center gap-2 text-black bg-[var(--color-win-gray)] hover:bg-[var(--color-win-title-from)] hover:text-white"
          >
            <span className="text-lg leading-none">⏻</span>
            <span>Shut Down…</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function Separator() {
  return <div className="h-px bg-[var(--color-win-gray-dark)] mx-2 my-1" />
}
