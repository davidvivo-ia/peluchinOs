import type { ParseError, ParsedCommand, ParsedPipeline } from './types'

type Token =
  | { kind: 'word'; value: string }
  | { kind: 'pipe' }
  | { kind: 'redirect-out'; append: boolean }
  | { kind: 'redirect-in' }

function tokenize(input: string): Token[] | ParseError {
  const tokens: Token[] = []
  let i = 0
  const N = input.length
  while (i < N) {
    const c = input[i]
    if (c === ' ' || c === '\t') {
      i++
      continue
    }
    if (c === '|') {
      tokens.push({ kind: 'pipe' })
      i++
      continue
    }
    if (c === '>') {
      const append = input[i + 1] === '>'
      tokens.push({ kind: 'redirect-out', append })
      i += append ? 2 : 1
      continue
    }
    if (c === '<') {
      tokens.push({ kind: 'redirect-in' })
      i++
      continue
    }
    // word — accumulate respecting quotes and escapes
    let value = ''
    while (i < N) {
      const ch = input[i]
      if (ch === ' ' || ch === '\t' || ch === '|' || ch === '>' || ch === '<') break
      if (ch === '"' || ch === "'") {
        const quote = ch
        i++
        while (i < N && input[i] !== quote) {
          if (input[i] === '\\' && quote === '"' && i + 1 < N) {
            const nxt = input[i + 1]
            if (nxt === '"' || nxt === '\\' || nxt === 'n' || nxt === 't' || nxt === 'r') {
              value += nxt === 'n' ? '\n' : nxt === 't' ? '\t' : nxt === 'r' ? '\r' : nxt
              i += 2
              continue
            }
          }
          value += input[i]
          i++
        }
        if (i >= N) return { message: 'unterminated string', column: i }
        i++ // closing quote
        continue
      }
      if (ch === '\\' && i + 1 < N) {
        value += input[i + 1]
        i += 2
        continue
      }
      value += ch
      i++
    }
    tokens.push({ kind: 'word', value })
  }
  return tokens
}

export function parse(input: string): ParsedPipeline | ParseError {
  const tokens = tokenize(input)
  if (!Array.isArray(tokens)) return tokens

  const pipeline: ParsedPipeline = { commands: [] }
  let current: ParsedCommand = { argv: [] }
  let expectRedirectOut: { append: boolean } | null = null
  let expectRedirectIn = false

  function pushCurrent() {
    if (current.argv.length === 0 && !current.redirectIn && !current.redirectOut) return
    pipeline.commands.push(current)
    current = { argv: [] }
  }

  for (const t of tokens) {
    if (expectRedirectOut !== null) {
      if (t.kind !== 'word') {
        return { message: 'expected filename after redirect', column: -1 }
      }
      current.redirectOut = { path: t.value, append: expectRedirectOut.append }
      expectRedirectOut = null
      continue
    }
    if (expectRedirectIn) {
      if (t.kind !== 'word') {
        return { message: 'expected filename after <', column: -1 }
      }
      current.redirectIn = t.value
      expectRedirectIn = false
      continue
    }
    switch (t.kind) {
      case 'word':
        current.argv.push(t.value)
        break
      case 'pipe':
        if (current.argv.length === 0) {
          return { message: 'empty command before pipe', column: -1 }
        }
        pushCurrent()
        break
      case 'redirect-out':
        expectRedirectOut = { append: t.append }
        break
      case 'redirect-in':
        expectRedirectIn = true
        break
    }
  }

  if (expectRedirectOut !== null || expectRedirectIn) {
    return { message: 'unfinished redirect', column: -1 }
  }
  pushCurrent()

  return pipeline
}

export function isParseError(v: ParsedPipeline | ParseError): v is ParseError {
  return 'message' in v
}
