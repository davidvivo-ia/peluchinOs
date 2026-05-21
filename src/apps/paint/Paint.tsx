import { createLogger } from '@/kernel/logger'
import { vfs } from '@/kernel/vfs'
import { useCallback, useEffect, useRef, useState } from 'react'

const log = createLogger('paint')

const PALETTE = [
  '#000000',
  '#7f7f7f',
  '#880015',
  '#ed1c24',
  '#ff7f27',
  '#fff200',
  '#22b14c',
  '#00a2e8',
  '#3f48cc',
  '#a349a4',
  '#ffffff',
  '#c3c3c3',
  '#b97a57',
  '#ffaec9',
  '#ffc90e',
  '#efe4b0',
  '#b5e61d',
  '#99d9ea',
  '#7092be',
  '#c8bfe7',
]

type Tool = 'pencil' | 'brush' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'fill' | 'pick'

const TOOL_ICONS: Record<Tool, string> = {
  pencil: '✏',
  brush: '🖌',
  eraser: '🧽',
  line: '╱',
  rect: '▭',
  ellipse: '◯',
  fill: '🪣',
  pick: '💧',
}

const CANVAS_W = 640
const CANVAS_H = 380

export function Paint() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const [tool, setTool] = useState<Tool>('pencil')
  const [primary, setPrimary] = useState('#000000')
  const [secondary, setSecondary] = useState('#ffffff')
  const [brushSize, setBrushSize] = useState(2)
  const [undo, setUndo] = useState<ImageData[]>([])
  const [redoStack, setRedoStack] = useState<ImageData[]>([])
  const drawingRef = useRef<{
    startX: number
    startY: number
    lastX: number
    lastY: number
    button: number
  } | null>(null)
  const baseSnapshotRef = useRef<ImageData | null>(null)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    pushUndo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pushUndo = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const snap = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H)
    setUndo((prev) => [...prev.slice(-20), snap])
    setRedoStack([])
  }, [])

  const undoLast = useCallback(() => {
    setUndo((prev) => {
      if (prev.length < 2) return prev
      const current = prev[prev.length - 1]
      const previous = prev[prev.length - 2]
      const c = canvasRef.current
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return prev
      ctx.putImageData(previous, 0, 0)
      setRedoStack((r) => [...r, current])
      return prev.slice(0, -1)
    })
  }, [])

  const redoLast = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack
      const next = stack[stack.length - 1]
      const c = canvasRef.current
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return stack
      ctx.putImageData(next, 0, 0)
      setUndo((u) => [...u, next])
      return stack.slice(0, -1)
    })
  }, [])

  const clearCanvas = useCallback(() => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = secondary
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    pushUndo()
  }, [secondary, pushUndo])

  const save = useCallback(async () => {
    const c = canvasRef.current
    if (!c) return
    const target = prompt('Save PNG to (path):', '/home/peluchin/Pictures/drawing.png')
    if (!target) return
    const dataUrl = c.toDataURL('image/png')
    try {
      await vfs.writeFile(target, dataUrl)
      log.info(`saved ${target}`)
      alert(`Saved to ${target}`)
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`)
    }
  }, [])

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current
    if (!c) return { x: 0, y: 0 }
    const rect = c.getBoundingClientRect()
    return {
      x: Math.floor(((e.clientX - rect.left) / rect.width) * CANVAS_W),
      y: Math.floor(((e.clientY - rect.top) / rect.height) * CANVAS_H),
    }
  }

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getPos(e)
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return

    drawingRef.current = { startX: x, startY: y, lastX: x, lastY: y, button: e.button }
    overlayRef.current?.getContext('2d')?.clearRect(0, 0, CANVAS_W, CANVAS_H)
    baseSnapshotRef.current = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H)
    c.setPointerCapture(e.pointerId)

    const color = e.button === 2 ? secondary : primary

    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') {
      ctx.fillStyle = tool === 'eraser' ? secondary : color
      ctx.beginPath()
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
      ctx.fill()
    } else if (tool === 'fill') {
      floodFill(ctx, x, y, e.button === 2 ? secondary : primary)
      pushUndo()
    } else if (tool === 'pick') {
      const px = ctx.getImageData(x, y, 1, 1).data
      const hex = `#${px[0].toString(16).padStart(2, '0')}${px[1].toString(16).padStart(2, '0')}${px[2].toString(16).padStart(2, '0')}`
      if (e.button === 2) setSecondary(hex)
      else setPrimary(hex)
    }
  }

  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const state = drawingRef.current
    if (!state) return
    const { x, y } = getPos(e)
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const color = state.button === 2 ? secondary : primary

    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') {
      ctx.strokeStyle = tool === 'eraser' ? secondary : color
      ctx.fillStyle = ctx.strokeStyle
      ctx.lineWidth = brushSize
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(state.lastX, state.lastY)
      ctx.lineTo(x, y)
      ctx.stroke()
      state.lastX = x
      state.lastY = y
    } else if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      const overlay = overlayRef.current
      const octx = overlay?.getContext('2d')
      if (!overlay || !octx) return
      octx.clearRect(0, 0, CANVAS_W, CANVAS_H)
      octx.strokeStyle = color
      octx.lineWidth = brushSize
      if (tool === 'line') {
        octx.beginPath()
        octx.moveTo(state.startX, state.startY)
        octx.lineTo(x, y)
        octx.stroke()
      } else if (tool === 'rect') {
        octx.strokeRect(state.startX, state.startY, x - state.startX, y - state.startY)
      } else {
        octx.beginPath()
        octx.ellipse(
          (state.startX + x) / 2,
          (state.startY + y) / 2,
          Math.abs(x - state.startX) / 2,
          Math.abs(y - state.startY) / 2,
          0,
          0,
          Math.PI * 2,
        )
        octx.stroke()
      }
    }
  }

  const endDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const state = drawingRef.current
    if (!state) return
    const { x, y } = getPos(e)
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const color = state.button === 2 ? secondary : primary

    if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      ctx.strokeStyle = color
      ctx.lineWidth = brushSize
      ctx.lineCap = 'round'
      if (tool === 'line') {
        ctx.beginPath()
        ctx.moveTo(state.startX, state.startY)
        ctx.lineTo(x, y)
        ctx.stroke()
      } else if (tool === 'rect') {
        ctx.strokeRect(state.startX, state.startY, x - state.startX, y - state.startY)
      } else {
        ctx.beginPath()
        ctx.ellipse(
          (state.startX + x) / 2,
          (state.startY + y) / 2,
          Math.abs(x - state.startX) / 2,
          Math.abs(y - state.startY) / 2,
          0,
          0,
          Math.PI * 2,
        )
        ctx.stroke()
      }
      overlayRef.current?.getContext('2d')?.clearRect(0, 0, CANVAS_W, CANVAS_H)
    }

    drawingRef.current = null
    if (tool !== 'pick') pushUndo()
  }

  return (
    <div className="h-full w-full flex flex-col bg-[var(--color-win-gray)] text-[11px]">
      <Toolbar
        onSave={save}
        onClear={clearCanvas}
        onUndo={undoLast}
        canUndo={undo.length > 1}
        onRedo={redoLast}
        canRedo={redoStack.length > 0}
      />
      <div className="flex flex-1 min-h-0 gap-1 p-1.5 pt-0">
        <ToolPalette
          tool={tool}
          setTool={setTool}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
        />
        <div className="bevel-in bg-[#808080] flex-1 overflow-auto p-1 flex items-start justify-start">
          <div
            className="relative bevel-out"
            style={{ width: CANVAS_W, height: CANVAS_H }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="absolute inset-0 bg-white cursor-crosshair"
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
            />
            <canvas
              ref={overlayRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="absolute inset-0 pointer-events-none"
            />
          </div>
        </div>
      </div>
      <ColorBar
        primary={primary}
        secondary={secondary}
        setPrimary={setPrimary}
        setSecondary={setSecondary}
      />
    </div>
  )
}

function Toolbar({
  onSave,
  onClear,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
}: {
  onSave: () => void
  onClear: () => void
  onUndo: () => void
  canUndo: boolean
  onRedo: () => void
  canRedo: boolean
}) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-1 border-b border-[var(--color-win-gray-dark)]">
      <Btn onClick={onSave}>💾 Save</Btn>
      <Btn onClick={onClear}>🆕 Clear</Btn>
      <div className="w-px h-4 bg-[var(--color-win-gray-dark)] mx-1" />
      <Btn onClick={onUndo} disabled={!canUndo}>
        ↶ Undo
      </Btn>
      <Btn onClick={onRedo} disabled={!canRedo}>
        ↷ Redo
      </Btn>
    </div>
  )
}

function Btn({
  children,
  onClick,
  disabled,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bevel-out bg-[var(--color-win-gray)] px-2 py-0.5 active:translate-y-px disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function ToolPalette({
  tool,
  setTool,
  brushSize,
  setBrushSize,
}: {
  tool: Tool
  setTool: (t: Tool) => void
  brushSize: number
  setBrushSize: (n: number) => void
}) {
  const tools: Tool[] = ['pencil', 'brush', 'eraser', 'line', 'rect', 'ellipse', 'fill', 'pick']
  return (
    <div className="bevel-out bg-[var(--color-win-gray)] p-1 flex flex-col gap-1 w-14 shrink-0">
      <div className="grid grid-cols-2 gap-1">
        {tools.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTool(t)}
            title={t}
            data-active={tool === t}
            className="bevel-out w-6 h-6 flex items-center justify-center bg-[var(--color-win-gray)] text-[12px] data-[active=true]:bevel-in"
          >
            {TOOL_ICONS[t]}
          </button>
        ))}
      </div>
      <div className="mt-2 text-[9px] text-center">SIZE</div>
      <div className="flex flex-col items-center gap-1">
        {[1, 2, 4, 8].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setBrushSize(n)}
            data-active={brushSize === n}
            className="bevel-out w-10 h-5 flex items-center justify-center bg-[var(--color-win-gray)] data-[active=true]:bevel-in"
          >
            <div style={{ width: n, height: n, background: '#000', borderRadius: '50%' }} />
          </button>
        ))}
      </div>
    </div>
  )
}

function ColorBar({
  primary,
  secondary,
  setPrimary,
  setSecondary,
}: {
  primary: string
  secondary: string
  setPrimary: (c: string) => void
  setSecondary: (c: string) => void
}) {
  return (
    <div className="bevel-out bg-[var(--color-win-gray)] m-1 mt-0 mx-1.5 p-1 flex items-center gap-2">
      <div className="flex flex-col items-center justify-center w-8 h-8 relative shrink-0">
        <div className="bevel-out w-5 h-5 absolute top-0 left-0" style={{ background: primary }} />
        <div
          className="bevel-out w-5 h-5 absolute bottom-0 right-0"
          style={{ background: secondary }}
        />
      </div>
      <div className="grid grid-cols-10 gap-0.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setPrimary(c)}
            onContextMenu={(e) => {
              e.preventDefault()
              setSecondary(c)
            }}
            className="w-4 h-4 bevel-out"
            style={{ background: c }}
            title={c}
          />
        ))}
      </div>
      <span className="text-[10px] ml-auto">Left-click: primary · Right-click: secondary</span>
    </div>
  )
}

function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, fillHex: string) {
  const img = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H)
  const data = img.data
  const idx = (px: number, py: number) => (py * CANVAS_W + px) * 4
  const start = idx(x, y)
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]]
  const fill = hexToRgba(fillHex)
  if (
    target[0] === fill[0] &&
    target[1] === fill[1] &&
    target[2] === fill[2] &&
    target[3] === fill[3]
  )
    return
  const stack: [number, number][] = [[x, y]]
  while (stack.length > 0) {
    const [cx, cy] = stack.pop() as [number, number]
    if (cx < 0 || cx >= CANVAS_W || cy < 0 || cy >= CANVAS_H) continue
    const i = idx(cx, cy)
    if (
      data[i] !== target[0] ||
      data[i + 1] !== target[1] ||
      data[i + 2] !== target[2] ||
      data[i + 3] !== target[3]
    )
      continue
    data[i] = fill[0]
    data[i + 1] = fill[1]
    data[i + 2] = fill[2]
    data[i + 3] = fill[3]
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
  }
  ctx.putImageData(img, 0, 0)
}

function hexToRgba(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '')
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
    255,
  ]
}
