import { type ReactNode, useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  shortcut?: string
  disabled?: boolean
  separator?: false
  onSelect: () => void
}

export interface Separator {
  separator: true
}

export type MenuEntry = ContextMenuItem | Separator

export interface ContextMenuProps {
  x: number
  y: number
  items: MenuEntry[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
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

  // Constrain to viewport
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left = Math.min(x, vw - 220)
  const top = Math.min(y, vh - items.length * 24 - 12)

  return (
    <div
      ref={ref}
      className="absolute bevel-out bg-[var(--color-win-gray)] min-w-44 py-1 z-[10000] shadow-md"
      style={{ left, top }}
    >
      {items.map((entry, i) => {
        if ('separator' in entry && entry.separator) {
          const key = `sep-${i}-${(items[i - 1] as ContextMenuItem | undefined)?.label ?? 'top'}`
          return <div key={key} className="h-px bg-[var(--color-win-gray-dark)] mx-2 my-1" />
        }
        const item = entry as ContextMenuItem
        return (
          <MenuButton
            key={item.label}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              item.onSelect()
              onClose()
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="ml-auto text-[10px] text-gray-500">{item.shortcut}</span>
            )}
          </MenuButton>
        )
      })}
    </div>
  )
}

function MenuButton({
  children,
  disabled,
  onClick,
}: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-3 py-0.5 flex items-center gap-6 text-[11px] hover:bg-[var(--color-win-title-from)] hover:text-white disabled:text-gray-500 disabled:hover:bg-transparent disabled:hover:text-gray-500"
    >
      {children}
    </button>
  )
}
