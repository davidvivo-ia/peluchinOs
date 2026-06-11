import { useWMStore } from '@/kernel/window-manager'
import type { Position, Size, WindowState } from '@/kernel/window-manager'
import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef } from 'react'

const TASKBAR_HEIGHT = 28

interface WindowProps {
  window: WindowState
  children: ReactNode
}

export function Window({ window: w, children }: WindowProps) {
  const move = useWMStore((s) => s.move)
  const resize = useWMStore((s) => s.resize)
  const focus = useWMStore((s) => s.focus)
  const close = useWMStore((s) => s.close)
  const minimize = useWMStore((s) => s.minimize)
  const toggleMaximize = useWMStore((s) => s.toggleMaximize)

  const onTitleDown = useStartDrag(w, move)
  const onResizeDown = useStartResize(w, resize)

  const onClick = useCallback(() => {
    if (!w.focused) focus(w.id)
  }, [focus, w.focused, w.id])

  const style: CSSProperties = w.maximized
    ? {
        left: 0,
        top: 0,
        width: '100%',
        height: `calc(100% - ${TASKBAR_HEIGHT}px)`,
        zIndex: w.zIndex,
      }
    : {
        left: w.position.x,
        top: w.position.y,
        width: w.size.width,
        height: w.size.height,
        zIndex: w.zIndex,
      }

  if (w.minimized) return null

  return (
    <div
      data-window-id={w.id}
      data-focused={w.focused}
      className="absolute bevel-out bg-[var(--color-win-gray)] flex flex-col shadow-md animate-window-open"
      style={style}
      onMouseDown={onClick}
    >
      <TitleBar
        title={w.title}
        focused={w.focused}
        onMouseDown={(e) => {
          if (!w.maximized) onTitleDown(e)
        }}
        onDoubleClick={() => w.resizable && toggleMaximize(w.id)}
        onMinimize={() => minimize(w.id)}
        onMaximize={() => w.resizable && toggleMaximize(w.id)}
        onClose={() => close(w.id)}
        canMaximize={w.resizable}
      />
      <div className="flex-1 min-h-0 bevel-in bg-white m-1 mt-0 overflow-hidden">{children}</div>
      {!w.maximized && w.resizable && (
        <div
          className="absolute right-0 bottom-0 w-3.5 h-3.5 cursor-nwse-resize"
          style={{
            background:
              'linear-gradient(135deg, transparent 33%, var(--color-win-gray-dark) 33% 41%, transparent 41% 58%, var(--color-win-gray-dark) 58% 66%, transparent 66%)',
          }}
          onMouseDown={onResizeDown}
        />
      )}
    </div>
  )
}

interface TitleBarProps {
  title: string
  focused: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  canMaximize: boolean
}

function TitleBar({
  title,
  focused,
  onMouseDown,
  onDoubleClick,
  onMinimize,
  onMaximize,
  onClose,
  canMaximize,
}: TitleBarProps) {
  return (
    <div
      className="h-6 flex items-center px-1 select-none cursor-default text-white text-[11px] font-bold m-1 mb-0"
      style={{
        background: focused
          ? 'linear-gradient(90deg, var(--color-win-title-from) 0%, var(--color-win-blue-light) 100%)'
          : 'linear-gradient(90deg, #7a7a7a 0%, #b5b5b5 100%)',
      }}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      <span className="flex-1 truncate px-1">{title}</span>
      <div className="flex gap-[2px]">
        <TitleButton label="_" ariaLabel="Minimize" onClick={onMinimize} />
        {canMaximize && <TitleButton label="▢" ariaLabel="Maximize" onClick={onMaximize} />}
        <TitleButton label="✕" ariaLabel="Close" onClick={onClose} />
      </div>
    </div>
  )
}

function TitleButton({
  label,
  ariaLabel,
  onClick,
}: {
  label: string
  ariaLabel: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="bevel-out w-4 h-4 text-black text-[10px] leading-none flex items-center justify-center bg-[var(--color-win-gray)] active:translate-y-px"
    >
      {label}
    </button>
  )
}

// Both gesture hooks register document-level listeners that normally
// detach on mouseup. If the window unmounts MID-gesture (app closed via
// keyboard shortcut, taskbar, etc.) mouseup never reaches the handler —
// the unmount cleanup below covers that path so listeners can't leak.
function useGestureCleanup() {
  const cleanupRef = useRef<(() => void) | null>(null)
  useEffect(
    () => () => {
      cleanupRef.current?.()
    },
    [],
  )
  return cleanupRef
}

function useStartDrag(w: WindowState, move: (id: string, p: Position) => void) {
  const cleanupRef = useGestureCleanup()
  return (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const origX = w.position.x
    const origY = w.position.y
    const onMove = (ev: MouseEvent) => {
      const x = Math.max(0, origX + (ev.clientX - startX))
      const y = Math.max(0, origY + (ev.clientY - startY))
      move(w.id, { x, y })
    }
    const cleanup = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', cleanup)
      cleanupRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', cleanup)
    cleanupRef.current = cleanup
  }
}

function useStartResize(w: WindowState, resize: (id: string, s: Size) => void) {
  const cleanupRef = useGestureCleanup()
  return (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startW = w.size.width
    const startH = w.size.height
    const min = w.minSize
    const onMove = (ev: MouseEvent) => {
      const width = Math.max(min.width, startW + (ev.clientX - startX))
      const height = Math.max(min.height, startH + (ev.clientY - startY))
      resize(w.id, { width, height })
    }
    const cleanup = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', cleanup)
      cleanupRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', cleanup)
    cleanupRef.current = cleanup
  }
}
