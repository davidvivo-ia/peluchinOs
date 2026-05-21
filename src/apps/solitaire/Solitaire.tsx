import { useCallback, useEffect, useState } from 'react'

type Suit = '♠' | '♥' | '♦' | '♣'
type Color = 'red' | 'black'

interface Card {
  rank: number // 1..13 (Ace=1, J=11, Q=12, K=13)
  suit: Suit
  faceUp: boolean
}

const SUITS: Suit[] = ['♠', '♥', '♦', '♣']
const SUIT_COLOR: Record<Suit, Color> = { '♠': 'black', '♣': 'black', '♥': 'red', '♦': 'red' }
const RANK_LABEL: Record<number, string> = {
  1: 'A',
  11: 'J',
  12: 'Q',
  13: 'K',
}

interface State {
  stock: Card[]
  waste: Card[]
  foundations: Card[][]
  tableau: Card[][]
}

type Source =
  | { kind: 'waste' }
  | { kind: 'foundation'; index: number }
  | { kind: 'tableau'; column: number; row: number }

function getCardsForSource(state: State, src: Source): Card[] {
  if (src.kind === 'waste')
    return state.waste.length === 0 ? [] : [state.waste[state.waste.length - 1]]
  if (src.kind === 'foundation')
    return state.foundations[src.index].length === 0
      ? []
      : [state.foundations[src.index][state.foundations[src.index].length - 1]]
  const pile = state.tableau[src.column]
  return pile.slice(src.row)
}

function canMoveToFoundation(state: State, cards: Card[], pileIdx: number): boolean {
  if (cards.length !== 1) return false
  const card = cards[0]
  const pile = state.foundations[pileIdx]
  if (pile.length === 0) return card.rank === 1
  const top = pile[pile.length - 1]
  return top.suit === card.suit && card.rank === top.rank + 1
}

function canMoveToTableau(state: State, cards: Card[], pileIdx: number): boolean {
  if (cards.length === 0) return false
  const first = cards[0]
  const pile = state.tableau[pileIdx]
  if (pile.length === 0) return first.rank === 13
  const top = pile[pile.length - 1]
  if (!top.faceUp) return false
  return SUIT_COLOR[first.suit] !== SUIT_COLOR[top.suit] && first.rank === top.rank - 1
}

function removeFromSource(s: State, src: Source, count: number): State {
  const next: State = {
    stock: [...s.stock],
    waste: [...s.waste],
    foundations: s.foundations.map((f) => [...f]),
    tableau: s.tableau.map((t) => [...t]),
  }
  if (src.kind === 'waste') next.waste.pop()
  else if (src.kind === 'foundation') next.foundations[src.index].pop()
  else {
    const col = next.tableau[src.column]
    col.splice(col.length - count, count)
    if (col.length > 0 && !col[col.length - 1].faceUp)
      col[col.length - 1] = { ...col[col.length - 1], faceUp: true }
  }
  return next
}

function sameSource(a: Source, b: Source): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'waste') return true
  if (a.kind === 'foundation' && b.kind === 'foundation') return a.index === b.index
  if (a.kind === 'tableau' && b.kind === 'tableau') return a.column === b.column && a.row === b.row
  return false
}

function deal(): State {
  const deck: Card[] = []
  for (const s of SUITS)
    for (let r = 1; r <= 13; r++) deck.push({ rank: r, suit: s, faceUp: false })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const tableau: Card[][] = []
  for (let col = 0; col < 7; col++) {
    const pile: Card[] = []
    for (let i = 0; i <= col; i++) {
      const card = deck.pop()
      if (!card) break
      card.faceUp = i === col
      pile.push(card)
    }
    tableau.push(pile)
  }
  return {
    stock: deck,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
  }
}

export function Solitaire() {
  const [state, setState] = useState<State>(deal)
  const [selection, setSelection] = useState<Source | null>(null)
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [won, setWon] = useState(false)

  useEffect(() => {
    if (won) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [won])

  useEffect(() => {
    if (state.foundations.every((f) => f.length === 13)) setWon(true)
  }, [state.foundations])

  const newGame = useCallback(() => {
    setState(deal())
    setSelection(null)
    setMoves(0)
    setSeconds(0)
    setWon(false)
  }, [])

  const drawFromStock = useCallback(() => {
    setState((s) => {
      if (s.stock.length === 0) {
        // recycle
        const newStock = [...s.waste].reverse().map((c) => ({ ...c, faceUp: false }))
        return { ...s, stock: newStock, waste: [] }
      }
      const next = [...s.stock]
      const card = next.pop()
      if (!card) return s
      card.faceUp = true
      return { ...s, stock: next, waste: [...s.waste, card] }
    })
    setMoves((m) => m + 1)
    setSelection(null)
  }, [])

  const tryMove = useCallback(
    (src: Source, target: { kind: 'foundation' | 'tableau'; index: number }) => {
      const cards = getCardsForSource(state, src)
      const ok =
        target.kind === 'foundation'
          ? canMoveToFoundation(state, cards, target.index)
          : canMoveToTableau(state, cards, target.index)
      if (!ok) {
        setSelection(null)
        return false
      }
      const reduced = removeFromSource(state, src, cards.length)
      if (target.kind === 'foundation') reduced.foundations[target.index].push(...cards)
      else reduced.tableau[target.index].push(...cards)
      setState(reduced)
      setMoves((m) => m + 1)
      setSelection(null)
      return true
    },
    [state],
  )

  const onCardClick = useCallback(
    (src: Source) => {
      if (!selection) {
        const cards = getCardsForSource(state, src)
        if (cards.length === 0 || !cards[0].faceUp) return
        setSelection(src)
        return
      }
      if (sameSource(selection, src)) {
        setSelection(null)
        return
      }
      if (src.kind === 'foundation') {
        tryMove(selection, { kind: 'foundation', index: src.index })
      } else if (src.kind === 'tableau') {
        tryMove(selection, { kind: 'tableau', index: src.column })
      }
    },
    [selection, tryMove, state],
  )

  const onEmptyPileClick = useCallback(
    (kind: 'foundation' | 'tableau', index: number) => {
      if (!selection) return
      tryMove(selection, { kind, index })
    },
    [selection, tryMove],
  )

  const autoToFoundation = useCallback(
    (src: Source) => {
      const cards = getCardsForSource(state, src)
      if (cards.length !== 1) return
      for (let i = 0; i < 4; i++) {
        if (canMoveToFoundation(state, cards, i)) {
          tryMove(src, { kind: 'foundation', index: i })
          return
        }
      }
    },
    [tryMove, state],
  )

  return (
    <div className="h-full w-full bg-[#008000] p-3 text-white overflow-auto">
      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={newGame}
          className="bevel-out bg-[var(--color-win-gray)] text-black px-2 py-0.5 text-[11px] active:translate-y-px"
        >
          New Game
        </button>
        <span className="text-[11px]">Time: {seconds}s</span>
        <span className="text-[11px]">Moves: {moves}</span>
        <span className="text-[11px] ml-auto">{won && '🎉 You win!'}</span>
      </div>
      <div className="flex items-start gap-2 mb-4">
        <PileSlot
          empty={state.stock.length === 0 && state.waste.length === 0}
          onClick={drawFromStock}
        >
          {state.stock.length > 0 && <CardBack />}
        </PileSlot>
        <PileSlot empty={state.waste.length === 0}>
          {state.waste.length > 0 && (
            <CardView
              card={state.waste[state.waste.length - 1]}
              selected={selection?.kind === 'waste' && state.waste.length > 0}
              onClick={() => onCardClick({ kind: 'waste' })}
              onDoubleClick={() => autoToFoundation({ kind: 'waste' })}
            />
          )}
        </PileSlot>
        <div className="w-6" />
        {state.foundations.map((pile, i) => (
          <PileSlot
            key={`f-${SUITS[i]}`}
            empty={pile.length === 0}
            onClick={() => pile.length === 0 && onEmptyPileClick('foundation', i)}
          >
            {pile.length > 0 && (
              <CardView
                card={pile[pile.length - 1]}
                selected={selection?.kind === 'foundation' && selection.index === i}
                onClick={() => onCardClick({ kind: 'foundation', index: i })}
              />
            )}
          </PileSlot>
        ))}
      </div>
      <div className="flex items-start gap-2">
        {state.tableau.map((pile, col) => (
          <div key={`t-${col}-${pile.length}`} className="flex-shrink-0">
            <PileSlot
              empty={pile.length === 0}
              onClick={() => pile.length === 0 && onEmptyPileClick('tableau', col)}
            />
            <div className="relative" style={{ minHeight: '4rem' }}>
              {pile.map((card, row) => (
                <div
                  key={`${card.suit}${card.rank}-${row}`}
                  className="absolute left-0"
                  style={{ top: row * 18 }}
                >
                  {card.faceUp ? (
                    <CardView
                      card={card}
                      selected={
                        selection?.kind === 'tableau' &&
                        selection.column === col &&
                        row >= selection.row
                      }
                      onClick={() => onCardClick({ kind: 'tableau', column: col, row })}
                      onDoubleClick={() =>
                        row === pile.length - 1 &&
                        autoToFoundation({ kind: 'tableau', column: col, row })
                      }
                    />
                  ) : (
                    <CardBack />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[10px] mt-4 opacity-75">
        Click a face-up card to select it · click target to move · double-click to send to
        foundation · click stock to draw
      </div>
    </div>
  )
}

function PileSlot({
  children,
  empty,
  onClick,
}: {
  children?: React.ReactNode
  empty?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-12 h-16 rounded border border-white/30 flex items-center justify-center"
      style={{ background: empty ? 'rgba(255,255,255,0.06)' : 'transparent' }}
    >
      {children}
    </button>
  )
}

function CardView({
  card,
  selected,
  onClick,
  onDoubleClick,
}: {
  card: Card
  selected?: boolean
  onClick?: () => void
  onDoubleClick?: () => void
}) {
  const label = RANK_LABEL[card.rank] ?? String(card.rank)
  const color = SUIT_COLOR[card.suit] === 'red' ? '#d00000' : '#000000'
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onDoubleClick?.()
      }}
      className="w-12 h-16 bg-white rounded border-[1.5px] flex flex-col items-start justify-between px-1 py-0.5 select-none"
      style={{
        borderColor: selected ? '#1084d0' : '#000',
        boxShadow: selected ? '0 0 0 2px #1084d0' : undefined,
      }}
    >
      <div className="font-bold leading-none" style={{ color, fontSize: 13 }}>
        {label}
      </div>
      <div className="text-[18px] leading-none self-center" style={{ color }}>
        {card.suit}
      </div>
      <div className="font-bold leading-none self-end rotate-180" style={{ color, fontSize: 13 }}>
        {label}
      </div>
    </button>
  )
}

function CardBack() {
  return (
    <div
      className="w-12 h-16 rounded border-[1.5px] border-black"
      style={{
        background: 'repeating-linear-gradient(45deg, #00007f 0 4px, #1084d0 4px 8px)',
      }}
    />
  )
}
