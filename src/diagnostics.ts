import type { Span, Token } from "./tokenize.ts"

export interface DiagnosticHint {
  readonly message: string
  readonly span?: Span
}

export interface Diagnostic {
  readonly message: string
  readonly span: Span
  readonly token?: Token
  readonly hints?: readonly DiagnosticHint[]
}

export interface ParseError extends Diagnostic {
  format(): string
  toString(): string
}

export interface ParseErrorContext {
  readonly source: string
  readonly filename?: string
}

export function formatParseError(ctx: ParseErrorContext, diagnostic: Diagnostic): string {
  const { source, filename } = ctx
  const { message, span, hints } = diagnostic
  const loc = filename ? `At ${filename}:${span.line}:${span.col}:` : `At ${span.line}:${span.col}:`
  const parts: string[] = [message, "", loc, renderCodeBlock(ctx, span, { indent: "  " })]

  hints?.forEach(({ message, span }, i) => {
    if (i === 0 || span) parts.push("")
    parts.push(`  hint: ${message}`)
    if (span) {
      parts.push(renderCodeBlock(ctx, span, { indent: "    ", contextBefore: 0, contextAfter: 0 }))
    }
  })

  return parts.join("\n")
}

class WrappedParseError implements ParseError {
  readonly #diagnostic: Diagnostic
  readonly #context: ParseErrorContext
  #formatted: string | undefined

  constructor(ctx: ParseErrorContext, diagnostic: Diagnostic) {
    this.#diagnostic = diagnostic
    this.#context = ctx
  }

  get message(): string {
    return this.#diagnostic.message
  }

  get span(): Span {
    return this.#diagnostic.span
  }

  get token(): Token | undefined {
    return this.#diagnostic.token
  }

  get hints(): readonly DiagnosticHint[] | undefined {
    return this.#diagnostic.hints
  }

  format(): string {
    return (this.#formatted ??= formatParseError(this.#context, this.#diagnostic))
  }

  toString(): string {
    return this.format()
  }
}

export function toParseError(ctx: ParseErrorContext, diagnostic: Diagnostic): ParseError {
  return new WrappedParseError(ctx, diagnostic)
}

export function toParseErrors(
  context: ParseErrorContext,
  diagnostics: readonly Diagnostic[],
): readonly ParseError[] {
  return diagnostics.map((diagnostic) => new WrappedParseError(context, diagnostic))
}

export function lineColAt(
  sql: string,
  offset: number,
  startAt?: Span,
): { line: number; col: number } {
  let line = startAt?.line ?? 1
  let col = startAt?.col ?? 0
  for (let i = startAt?.offset ?? 0; i < offset; i++) {
    if (sql.charCodeAt(i) === 10) {
      line++
      col = 0
    } else {
      col++
    }
  }
  return { line, col }
}

export interface RenderCodeBlockOptions {
  readonly contextBefore?: number
  readonly contextAfter?: number
  readonly indent?: string
}

const CODE_BLOCK_SEPARATOR = "│ "

export function renderCodeBlock(
  ctx: ParseErrorContext,
  span: Span,
  options?: RenderCodeBlockOptions,
): string {
  const { source } = ctx
  const contextBefore = Math.max(0, options?.contextBefore ?? 1)
  const contextAfter = Math.max(0, options?.contextAfter ?? 1)
  const indent = options?.indent ?? ""

  const start = Math.max(0, Math.min(span.offset, source.length))
  const end = Math.max(start, Math.min(span.offset + span.length, source.length))
  const lines = source.split("\n")

  const startLoc = span.offset === start ? span : lineColAt(source, start)
  const endLoc = lineColAt(source, end, span)

  const firstLine = Math.max(1, startLoc.line - contextBefore)
  const lastLine = Math.min(lines.length, endLoc.line + contextAfter)
  const gutterWidth = Math.max(2, String(lastLine).length)

  const out: string[] = []
  for (let ln = firstLine; ln <= lastLine; ln++) {
    const text = lines[ln - 1] ?? ""
    out.push(`${indent}${String(ln).padStart(gutterWidth, " ")}${CODE_BLOCK_SEPARATOR}${text}`)

    if (ln < startLoc.line || ln > endLoc.line) continue
    const startCol = ln === startLoc.line ? startLoc.col : 0
    const endCol = ln === endLoc.line ? endLoc.col : text.length
    const caretCount = Math.max(1, endCol - startCol)
    const pad = " ".repeat(gutterWidth) + CODE_BLOCK_SEPARATOR + " ".repeat(startCol)
    out.push(indent + pad + "^".repeat(caretCount))
  }

  return out.join("\n")
}
