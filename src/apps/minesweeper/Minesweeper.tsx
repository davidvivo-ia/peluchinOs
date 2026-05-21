import { useCallback, useEffect, useMemo, useState } from 'react'

type CellState = 'hidden' | 'revealed' | 'flagged' | 'question'
type GameState = 'idle' | 'playing' | 'won' | 'lost'

interface Cell {
  mine: boolean
  adjacent: number
  state: CellState
}

interface Difficulty {
  rows: number
  cols: number
  mines: number
  label: string
}

const DIFFICULTIES: Record<string, Difficulty> = {
  beginner: { rows: 9, cols: 9, mines: 10, label: 'Beginner' },
  intermediate: { rows: 16, cols: 16, mines: 40, label: 'Intermediate' },
  expert: { rows: 16, cols: 30, mines: 99, label: 'Expert' },
}

const NUM_COLORS: Record<number, string> = {
  1: '#0000ff',
  2: '#008200',
  3: '#ff0000',
  4: '#000084',
  5: '#840000',
  6: '#008284',
  7: '#000000',
  8: '#808080',
}

function buildBoard(d: Difficulty, safeR: number, safeC: number): Cell[][] {
  const grid: Cell[][] = Array.from({ length: d.rows }, () =>
    Array.from({ length: d.cols }, () => ({
      mine: false,
      adjacent: 0,
      state: 'hidden' as CellState,
    })),
  )
  let placed = 0
  while (placed < d.mines) {
    const r = Math.floor(Math.random() * d.rows)
    const c = Math.floor(Math.random() * d.cols)
    if (grid[r][c].mine) continue
    if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue
    grid[r][c].mine = true
    placed++
  }
  for (let r = 0; r < d.rows; r++) {
    for (let c = 0; c < d.cols; c++) {
      if (grid[r][c].mine) continue
      let n = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nr >= d.rows || nc < 0 || nc >= d.cols) continue
          if (grid[nr][nc].mine) n++
        }
      }
      grid[r][c].adjacent = n
    }
  }
  return grid
}

export function Minesweeper() {
  const [diffKey, setDiffKey] = useState<keyof typeof DIFFICULTIES>('beginner')
  const diff = DIFFICULTIES[diffKey]
  const [grid, setGrid] = useState<Cell[][]>(() =>
    Array.from({ length: diff.rows }, () =>
      Array.from({ length: diff.cols }, () => ({
        mine: false,
        adjacent: 0,
        state: 'hidden' as CellState,
      })),
    ),
  )
  const [game, setGame] = useState<GameState>('idle')
  const [flags, setFlags] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [pressedFace, setPressedFace] = useState(false)

  const newGame = useCallback(() => {
    setGrid(
      Array.from({ length: diff.rows }, () =>
        Array.from({ length: diff.cols }, () => ({
          mine: false,
          adjacent: 0,
          state: 'hidden' as CellState,
        })),
      ),
    )
    setGame('idle')
    setFlags(0)
    setSeconds(0)
  }, [diff])

  useEffect(() => {
    newGame()
  }, [newGame])

  useEffect(() => {
    if (game !== 'playing') return
    const id = setInterval(() => setSeconds((s) => Math.min(s + 1, 999)), 1000)
    return () => clearInterval(id)
  }, [game])

  const cascadeReveal = useCallback(
    (g: Cell[][], r: number, c: number) => {
      const stack: [number, number][] = [[r, c]]
      while (stack.length > 0) {
        const [cr, cc] = stack.pop() as [number, number]
        const cell = g[cr][cc]
        if (cell.state !== 'hidden') continue
        cell.state = 'revealed'
        if (cell.adjacent === 0 && !cell.mine) {
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue
              const nr = cr + dr
              const nc = cc + dc
              if (nr < 0 || nr >= diff.rows || nc < 0 || nc >= diff.cols) continue
              if (g[nr][nc].state === 'hidden') stack.push([nr, nc])
            }
          }
        }
      }
    },
    [diff],
  )

  const reveal = useCallback(
    (r: number, c: number) => {
      if (game === 'won' || game === 'lost') return
      const cell = grid[r][c]
      if (cell.state === 'flagged' || cell.state === 'revealed') return

      let newGrid = grid.map((row) => row.map((c) => ({ ...c })))
      if (game === 'idle') {
        newGrid = buildBoard(diff, r, c)
        setGame('playing')
      }
      const target = newGrid[r][c]
      if (target.mine) {
        for (const row of newGrid) for (const cc of row) if (cc.mine) cc.state = 'revealed'
        target.state = 'revealed'
        setGrid(newGrid)
        setGame('lost')
        return
      }
      cascadeReveal(newGrid, r, c)

      let unrevealed = 0
      for (const row of newGrid)
        for (const cc of row) if (!cc.mine && cc.state !== 'revealed') unrevealed++
      setGrid(newGrid)
      if (unrevealed === 0) setGame('won')
    },
    [grid, game, diff, cascadeReveal],
  )

  const toggleFlag = useCallback(
    (r: number, c: number) => {
      if (game === 'won' || game === 'lost') return
      const newGrid = grid.map((row) => row.map((cc) => ({ ...cc })))
      const cell = newGrid[r][c]
      if (cell.state === 'revealed') return
      if (cell.state === 'hidden') {
        cell.state = 'flagged'
        setFlags((f) => f + 1)
      } else if (cell.state === 'flagged') {
        cell.state = 'question'
        setFlags((f) => f - 1)
      } else if (cell.state === 'question') {
        cell.state = 'hidden'
      }
      setGrid(newGrid)
    },
    [grid, game],
  )

  const minesRemaining = diff.mines - flags
  const face = pressedFace ? '😮' : game === 'won' ? '😎' : game === 'lost' ? '😵' : '🙂'

  return (
    <div className="h-full w-full flex flex-col bg-[var(--color-win-gray)] p-1.5 items-center">
      <div className="flex gap-2 self-stretch px-1 pb-1">
        {Object.entries(DIFFICULTIES).map(([k, d]) => (
          <button
            key={k}
            type="button"
            onClick={() => setDiffKey(k as keyof typeof DIFFICULTIES)}
            data-active={diffKey === k}
            className="bevel-out bg-[var(--color-win-gray)] px-2 py-0.5 text-[11px] data-[active=true]:bevel-in"
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="bevel-out bg-[var(--color-win-gray)] p-2 inline-block">
        <div className="bevel-in flex items-center justify-between p-1 mb-1">
          <Lcd value={minesRemaining} />
          <button
            type="button"
            onMouseDown={() => setPressedFace(true)}
            onMouseUp={() => setPressedFace(false)}
            onMouseLeave={() => setPressedFace(false)}
            onClick={newGame}
            className="bevel-out w-7 h-7 bg-[var(--color-win-gray)] text-lg leading-none active:bevel-in"
          >
            {face}
          </button>
          <Lcd value={seconds} />
        </div>
        <div className="bevel-in p-0.5 inline-block">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${diff.cols}, 18px)`,
              gridTemplateRows: `repeat(${diff.rows}, 18px)`,
            }}
          >
            {grid.map((row, r) =>
              row.map((cell, c) => (
                <CellView
                  key={`${r}-${c}-${diffKey}`}
                  cell={cell}
                  game={game}
                  onReveal={() => reveal(r, c)}
                  onFlag={() => toggleFlag(r, c)}
                  onPressing={setPressedFace}
                />
              )),
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CellView({
  cell,
  game,
  onReveal,
  onFlag,
  onPressing,
}: {
  cell: Cell
  game: GameState
  onReveal: () => void
  onFlag: () => void
  onPressing: (p: boolean) => void
}) {
  const isRevealed = cell.state === 'revealed'
  const showMine = isRevealed && cell.mine
  const showNumber = isRevealed && !cell.mine && cell.adjacent > 0
  const isFlagged = cell.state === 'flagged'
  const isQuestion = cell.state === 'question'
  const color = useMemo(
    () => (showNumber ? NUM_COLORS[cell.adjacent] : undefined),
    [showNumber, cell.adjacent],
  )

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        if (e.button === 0 && (game === 'idle' || game === 'playing')) onPressing(true)
      }}
      onPointerUp={() => onPressing(false)}
      onPointerLeave={() => onPressing(false)}
      onClick={() => onReveal()}
      onContextMenu={(e) => {
        e.preventDefault()
        onFlag()
      }}
      className={
        isRevealed
          ? `w-[18px] h-[18px] bg-[#bdbdbd] border border-[var(--color-win-gray-dark)] flex items-center justify-center text-[12px] leading-none font-bold ${showMine && game === 'lost' ? 'bg-red-600' : ''}`
          : 'w-[18px] h-[18px] bevel-out bg-[var(--color-win-gray)] flex items-center justify-center text-[10px] leading-none'
      }
      style={{ color }}
    >
      {showMine ? '💣' : showNumber ? cell.adjacent : isFlagged ? '🚩' : isQuestion ? '?' : ''}
    </button>
  )
}

function Lcd({ value }: { value: number }) {
  const display = String(Math.max(-99, Math.min(999, value))).padStart(3, '0')
  return (
    <div
      className="bg-black text-red-600 font-mono text-lg leading-none px-1 py-0.5"
      style={{ fontVariantNumeric: 'tabular-nums', minWidth: 38, textAlign: 'right' }}
    >
      {display}
    </div>
  )
}
