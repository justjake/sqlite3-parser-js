// Grammar-aware parse-error diagnostics.
//
// Given (sql, failing token, parser state, full token stream), produce a
// structured diagnostic: line/col/range, a list of terminals that would
// have been accepted in this state, and a human-friendly hint.
//
// The hints are heuristics over the token window and the symbolic names
// of the expected terminals.  They fire for common syntactic mistakes —
// unclosed groups, trailing commas, FILTER-before-OVER, keywords used as
// identifiers — and fall back to a generic "unexpected X; expected …"
// message when nothing pattern-matches.
//
// Adapted from the lemonjs port; the algorithms are unchanged, but the
// data access has been rewritten against sqlite3-parser's ParserDefs / CST
// shapes (see src/lempar.ts, src/parser.ts).

import type { ParserDefs, SymbolId } from "./lempar.ts"
import type { TokenNode } from "./parser.ts"
import { Span } from "./tokenize.ts";

// ---------------------------------------------------------------------------
// Public types.
// ---------------------------------------------------------------------------

/** A single parse error. */
export interface ParseError {
  /** Error message. */
  readonly message: string
  /** The offending token. */
  readonly span: Span
  /** Additional information about the error, optionally pointing to another location. */
  readonly hints?: readonly {
    readonly message: string
    readonly span: Span | undefined
  }[]
  /** Format all erorr details with a code block. */
  format(): string
  /** Alias of {@link format} */
  toString(): string
}

export type CreateParserErrorArgs = Pick<ParseError,  "message" | "span" | "hints"> & { sql: string, filename?: string }

export function formatParseError(args: CreateParserErrorArgs): string {
  const { sql, filename, message, span, hints } = args
    const loc = filename ? `At ${filename}:${span.line}:${span.col}:` : `At ${span.line}:${span.col}:`
    const parts: string[] = [
      message,
      "",
      loc,
      renderCodeBlock({ sql, span, indent: "  " }),
    ]

    hints?.forEach(({ message, span }, i) => {
      if (i === 0 || span) {
        parts.push("")
      }
      parts.push(`  hint: ${message}`)
      if (span) {
        parts.push(renderCodeBlock({ sql, span, indent: "    ", contextBefore: 0, contextAfter: 0 }))
      }
    })

    return parts.join("\n")
}

class ParserError implements ParseError {
  #args: CreateParserErrorArgs
  #formatted: string | undefined

  constructor(args: CreateParserErrorArgs) {
    this.#args = args
  }

  get message(): string {
    return this.#args.message
  }

  get span(): Span {
    return this.#args.span
  }

  get hints(): readonly { message: string, span: Span | undefined }[] | undefined {
    return this.#args.hints
  }

  format(): string {
    return this.#formatted ??= formatParseError(this.#args)
  }

  toString(): string {
    return this.format()
  }
}

export function createParserError(args: CreateParserErrorArgs): ParserError {
  return new ParserError(args)
}

export interface EnhanceParseErrorOptions {
  readonly sql: string
  /** The failing token as the engine saw it (may be synthetic). */
  readonly token: TokenNode
  /** Parser state number at the time of failure. */
  readonly state: number
  /** Full grammar defs — symbol table + action tables. */
  readonly defs: ParserDefs
  /**
   * The full token stream we fed the engine, in chronological order,
   * including any synthetic SEMI/EOF at the tail.  Used for context
   * scanning (open groups, trailing commas, FILTER/OVER ordering).
   */
  readonly tokens: readonly TokenNode[]
  /** 0-based index of `token` within `tokens`. */
  readonly tokenIndex: number
}

// ---------------------------------------------------------------------------
// Display-name tables.
// ---------------------------------------------------------------------------

// Override the default "lowercase the TK_ name" rendering for tokens
// whose idiomatic display form isn't obvious (punctuation, literal
// classes, special markers).
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  $: "end of input",
  ID: "identifier",
  STRING: "string literal",
  INTEGER: "integer literal",
  FLOAT: "float literal",
  QNUMBER: "numeric literal",
  BLOB: "blob literal",
  VARIABLE: "bind parameter",
  LP: "(",
  RP: ")",
  COMMA: ",",
  SEMI: ";",
  STAR: "*",
  DOT: ".",
  PLUS: "+",
  MINUS: "-",
  SLASH: "/",
  REM: "%",
  EQ: "=",
  LT: "<",
  LE: "<=",
  GT: ">",
  GE: ">=",
  NE: "!=",
  CONCAT: "||",
  BITAND: "&",
  BITOR: "|",
  BITNOT: "~",
  LSHIFT: "<<",
  RSHIFT: ">>",
  PTR: "->",
  CTIME_KW: "date/time literal",
  JOIN_KW: "join operator",
}

// Display-name sets used by the hint heuristics.  EXPRESSION_STARTERS
// holds display forms, while ITEM_* / CLAUSE_BOUNDARY_* / TABLE_NAME_*
// hold raw TK_* names — the difference is because `expected[]` entries
// are already in display form by the time we compare them, whereas
// token-stream scans compare against the unmodified TK_* name.
const EXPRESSION_STARTERS = new Set([
  "identifier",
  "string literal",
  "integer literal",
  "float literal",
  "numeric literal",
  "blob literal",
  "bind parameter",
  "(",
  "*",
  "null",
  "case",
  "cast",
  "exists",
  "not",
  "+",
  "-",
  "~",
  "current",
  "date/time literal",
])

const ITEM_STARTER_TOKEN_NAMES = new Set([
  "ID",
  "STRING",
  "INTEGER",
  "FLOAT",
  "QNUMBER",
  "BLOB",
  "VARIABLE",
  "LP",
  "STAR",
  "NULL",
  "CASE",
  "CAST",
  "EXISTS",
  "NOT",
  "PLUS",
  "MINUS",
  "BITNOT",
  "SELECT",
  "VALUES",
  "CURRENT",
  "CTIME_KW",
])

const ITEM_ENDER_TOKEN_NAMES = new Set([
  "ID",
  "STRING",
  "INTEGER",
  "FLOAT",
  "QNUMBER",
  "BLOB",
  "VARIABLE",
  "RP",
  "NULL",
  "TRUEFALSE",
  "CURRENT",
  "CTIME_KW",
  "END",
])

const CLAUSE_BOUNDARY_TOKEN_NAMES = new Set([
  "FROM",
  "WHERE",
  "GROUP",
  "HAVING",
  "WINDOW",
  "ORDER",
  "LIMIT",
  "FILTER",
  "OVER",
  "JOIN",
  "ON",
  "USING",
  "UNION",
  "INTERSECT",
  "EXCEPT",
  "THEN",
  "ELSE",
  "WHEN",
  "DO",
  "SET",
  "VALUES",
  "RETURNING",
])

const TABLE_NAME_CONTEXT_TOKEN_NAMES = new Set(["FROM", "JOIN", "INTO", "UPDATE"])

type OpenGroup = {
  readonly kind: "LP" | "CASE"
  readonly token: TokenNode
}

// ---------------------------------------------------------------------------
// Entry points.
// ---------------------------------------------------------------------------

/** SQLite-style short message: `near "FROM": syntax error` / `incomplete input`. */
export function canonicalParseMessage(token: TokenNode): string {
  return token.text.length > 0 ? `near "${token.text}": syntax error` : "incomplete input"
}

export function enhanceParseError(opts: EnhanceParseErrorOptions): ParseError {
  const { sql, token, state, defs, tokens, tokenIndex } = opts
  const canonical = canonicalParseMessage(token)

  const idSymbolId = findIdSymbol(defs)
  const expected = collectExpectedTerminals(defs, state, idSymbolId)
  const previousToken = previousConcreteToken(tokens, tokenIndex)
  const openGroups = scanOpenGroups(tokens, tokenIndex)
  const hint = buildHint({
    token,
    canonical,
    expected,
    previousToken,
    openGroups,
    tokens,
    tokenIndex,
  })
  return new ParseErrorImpl({
    token,
    canonical,
    hint,
    expected,
    sql,
  })
}

/**
 * Build a ParseError for an ILLEGAL token that the tokenizer could not
 * classify.  No grammar state is consulted, so `expected` is empty.
 */
export function buildIllegalTokenError(sql: string, token: TokenNode): ParseError {
  return new ParseErrorImpl({
    token,
    canonical: `unrecognized token: ${JSON.stringify(token.text)}`,
    hint: illegalTokenHint(token.text),
    expected: [],
    sql,
  })
}

function illegalTokenHint(text: string): string {
  if (text.startsWith("'")) return "unterminated string literal"
  if (text.startsWith('"') || text.startsWith("`") || text.startsWith("[")) {
    return "unterminated quoted identifier"
  }
  if (/^[0-9.]/.test(text)) return "malformed numeric literal"
  return "the tokenizer could not classify this input"
}

function tokenRange(sql: string, token: TokenNode): [number, number] {
  if (token.synthetic && token.text.length === 0) return [sql.length, sql.length]
  return [token.start, token.start + token.length]
}

// ---------------------------------------------------------------------------
// Location.
// ---------------------------------------------------------------------------

export function lineColAt(sql: string, offset: number, startAt: Span | undefined): { line: number; col: number } {
  let line = startAt?.line ?? 1
  let col = startAt?.col ?? 1
  for (let i = startAt?.offset ?? 0; i < offset; i++) {
    if (sql.charCodeAt(i) === 10) {
      line++
      col = 1
    } else {
      col++
    }
  }
  return { line, col }
}

export interface RenderCodeBlockOptions {
  /** Number of source lines to show before the error line. Default 1. */
  contextBefore?: number
  /** Number of source lines to show after the error line. Default 1. */
  contextAfter?: number
  /** Indentation to apply to the code block. */
  indent?: string
}

const CODE_BLOCK_SEPARATOR = '│ '

/**
 * Render a Roc-style source snippet for a half-open range `[start, end)`:
 *
 *     5│ greet : Str -> Str
 *     6│ greet = \name -> name + "!"
 *                              ^^^^^
 *
 * Line numbers right-align in a gutter separated by `│`.  The underline
 * sits on the first line of the range; multi-line spans are clipped to
 * end-of-line.  An empty range (`start === end`) renders as a single `^`.
 */
export function renderCodeBlock(args: {
  sql: string,
  span: Span,
  contextBefore?: number,
  contextAfter?: number,
  indent?: string,
}): string {
  const { sql, span, } = args
  const contextBefore = Math.max(0, args.contextBefore ?? 1)
  const contextAfter = Math.max(0, args.contextAfter ?? 1)
  const indent = args.indent ?? ""

  const start = Math.max(0, Math.min(span.offset, sql.length))
  const end = Math.max(start, Math.min(span.offset + span.length, sql.length))
  const sqlLines = sql.split("\n")

  const startLoc = span.offset === start ? span: lineColAt(sql, start, undefined)
  const endLoc = lineColAt(sql, end, span)

  const firstLine = Math.max(1, startLoc.line - contextBefore)
  const lastLine = Math.min(sqlLines.length, endLoc.line + contextAfter)
  const gutterWidth = Math.max(2, String(lastLine).length)

  const lines = sql.split("\n")
  const out: string[] = []
  for (let ln = firstLine; ln <= lastLine; ln++) {
    const text = lines[ln - 1] ?? ""
    out.push(`${indent}${String(ln).padStart(gutterWidth, " ")}${CODE_BLOCK_SEPARATOR}${text}`)
  }

  const firstLineText = lines[startLoc.line - 1] ?? ""
  const underlineEndCol = endLoc.line === startLoc.line ? endLoc.col : firstLineText.length + 1
  const caretCount = Math.max(1, underlineEndCol - startLoc.col)
  const pad = " ".repeat(gutterWidth) + CODE_BLOCK_SEPARATOR + " ".repeat(startLoc.col - 1)
  out.push(indent + pad + "^".repeat(caretCount))

  return out.join("\n")
}

// ---------------------------------------------------------------------------
// Expected-terminal derivation.
// ---------------------------------------------------------------------------

// Render the display form of every terminal in `yy_expected[state]` —
// the precomputed set of explicitly-shiftable terminals for this state
// emitted by `scripts/slim-dump.ts`.
function collectExpectedTerminals(
  defs: ParserDefs,
  state: number,
  idSymbolId: SymbolId | null,
): string[] {
  const tokenIds = defs.tables.yy_expected?.[state] ?? []
  const seen = new Set<string>()
  const expected: string[] = []
  for (const tokenId of tokenIds) {
    const display = displayExpectedToken(defs, tokenId, idSymbolId)
    if (display === null || seen.has(display)) continue
    seen.add(display)
    expected.push(display)
  }
  return expected.sort(compareExpectedLabels)
}

// Translate a terminal-id into its display form.  If the terminal falls
// back to ID (i.e. it's a keyword that's accepted as an identifier),
// collapse it to "identifier" so we don't emit dozens of keyword spellings.
function displayExpectedToken(
  defs: ParserDefs,
  tokenId: number,
  idSymbolId: SymbolId | null,
): string | null {
  const symbol = defs.symbols[tokenId]
  if (!symbol) return null
  // Never surface internal tokens as candidates.
  if (symbol.name === "SPACE" || symbol.name === "COMMENT" || symbol.name === "ILLEGAL") {
    return null
  }

  const fallbackTable = defs.tables.yyFallback ?? []
  const fallback = fallbackTable[tokenId] ?? 0
  if (idSymbolId !== null && tokenId !== idSymbolId && fallback === idSymbolId) {
    return "identifier"
  }

  const override = DISPLAY_NAME_OVERRIDES[symbol.name]
  if (override) return override

  if (/^[A-Z_]+$/.test(symbol.name)) {
    return symbol.name.replace(/_KW$/, "").toLowerCase()
  }
  return symbol.name
}

function findIdSymbol(defs: ParserDefs): SymbolId | null {
  for (let i = 0; i < defs.symbols.length; i++) {
    if (defs.symbols[i]!.name === "ID") return i as SymbolId
  }
  return null
}

// Punctuation sorts before words; within a class, alphabetic.  Keeps
// "(", ")", "," ahead of "identifier" / "select" in the rendered list.
function compareExpectedLabels(left: string, right: string): number {
  const leftPunct = /^[^a-z0-9]/i.test(left)
  const rightPunct = /^[^a-z0-9]/i.test(right)
  if (leftPunct !== rightPunct) return leftPunct ? -1 : 1
  return left.localeCompare(right)
}

function formatExpectedList(expected: readonly string[]): string {
  const items = expected.slice(0, 5)
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} or ${items[1]}`
  const head = items.slice(0, -1).join(", ")
  const tail = items[items.length - 1]
  const suffix = expected.length > items.length ? ", ..." : ""
  return `${head}, or ${tail}${suffix}`
}

// ---------------------------------------------------------------------------
// Hint selection.
// ---------------------------------------------------------------------------

function buildHint(ctx: {
  token: TokenNode
  canonical: string
  expected: readonly string[]
  previousToken: TokenNode | null
  openGroups: readonly OpenGroup[]
  tokens: readonly TokenNode[]
  tokenIndex: number
}): string {
  const { token, canonical, expected, previousToken, openGroups, tokens, tokenIndex } = ctx
  const topOpenGroup = openGroups[openGroups.length - 1] ?? null

  const missingTableNameHint = buildMissingTableNameHint(token, previousToken)
  if (missingTableNameHint) return missingTableNameHint

  if (canonical === "incomplete input") {
    const unclosedGroupHint = buildUnclosedGroupHint(token, topOpenGroup)
    if (unclosedGroupHint) return unclosedGroupHint
    return "query ended before a complete statement was formed"
  }

  const unmatchedClosingHint = buildUnmatchedClosingHint(token, openGroups)
  if (unmatchedClosingHint) return unmatchedClosingHint

  const filterOrderingHint = buildFilterOrderingHint(token, tokens, tokenIndex)
  if (filterOrderingHint) return filterOrderingHint

  const clauseBoundaryHint = buildClauseBoundaryHint(token, topOpenGroup)
  if (clauseBoundaryHint) return clauseBoundaryHint

  const missingCommaHint = buildCommaHint(token, expected, previousToken)
  if (missingCommaHint) return missingCommaHint

  if (token.name === "FROM" && expected.some((item) => EXPRESSION_STARTERS.has(item))) {
    return "expected a result expression before FROM"
  }

  const quotedIdentifierHint = buildQuotedIdentifierHint(token, expected)
  if (quotedIdentifierHint) return quotedIdentifierHint

  return `unexpected ${describeToken(token)}`
}

function describeToken(token: TokenNode): string {
  if (token.text.length === 0) return "end of input"
  return `"${token.text}"`
}

function buildMissingTableNameHint(
  token: TokenNode,
  previousToken: TokenNode | null,
): string | null {
  if (!previousToken || !TABLE_NAME_CONTEXT_TOKEN_NAMES.has(previousToken.name)) {
    return null
  }
  if (token.synthetic && token.text.length === 0) {
    return `expected a table name after ${previousToken.name}`
  }
  if (token.name === "ID" || token.name === "STRING") return null
  return `expected a table name after ${previousToken.name}`
}

function buildUnclosedGroupHint(token: TokenNode, topOpenGroup: OpenGroup | null): string | null {
  if (!topOpenGroup) return null
  if (topOpenGroup.kind === "LP") return `missing ")" before ${describeToken(token)}`
  return `missing END before ${describeToken(token)}`
}

function buildUnmatchedClosingHint(
  token: TokenNode,
  openGroups: readonly OpenGroup[],
): string | null {
  if (token.name !== "RP") return null
  if (openGroups.some((g) => g.kind === "LP")) return null
  return 'unexpected ")" with no matching "("'
}

function buildFilterOrderingHint(
  token: TokenNode,
  tokens: readonly TokenNode[],
  tokenIndex: number,
): string | null {
  if (token.name !== "FILTER") return null
  for (let i = tokenIndex - 1; i >= 0; i--) {
    const prev = tokens[i]!
    if (prev.synthetic) continue
    if (prev.name === "SEMI") break
    if (prev.name === "FILTER") break
    if (prev.name === "OVER") return "FILTER clauses must appear before OVER clauses"
  }
  return null
}

function buildClauseBoundaryHint(token: TokenNode, topOpenGroup: OpenGroup | null): string | null {
  if (!topOpenGroup || !isClauseBoundary(token)) return null
  if (topOpenGroup.kind === "LP") return `missing ")" before ${describeToken(token)}`
  return `missing END before ${describeToken(token)}`
}

function buildCommaHint(
  token: TokenNode,
  expected: readonly string[],
  previousToken: TokenNode | null,
): string | null {
  if (token.name === "COMMA" && expected.includes(")")) {
    return 'remove this comma or add another list item before ")"'
  }
  if (token.synthetic && token.text.length === 0 && previousToken?.name === "COMMA") {
    return "remove the trailing comma or add another list item before end of input"
  }
  if (previousToken?.name === "COMMA" && isClauseBoundary(token)) {
    return `remove the trailing comma or add another list item before ${describeToken(token)}`
  }
  if (!previousToken || !startsListItem(token) || !endsListItem(previousToken)) {
    return null
  }
  if (expected.includes(",")) {
    return `missing comma before ${describeToken(token)}`
  }
  if (
    expected.includes(")") ||
    expected.includes(";") ||
    expected.includes("from") ||
    expected.includes("where") ||
    expected.includes("group") ||
    expected.includes("having") ||
    expected.includes("window") ||
    expected.includes("order") ||
    expected.includes("limit")
  ) {
    return `possible missing comma or operator before ${describeToken(token)}`
  }
  return null
}

function buildQuotedIdentifierHint(token: TokenNode, expected: readonly string[]): string | null {
  if (!expected.includes("identifier")) return null
  if (!looksKeywordToken(token)) return null
  return `if you intended ${describeToken(token)} as an identifier here, quote it`
}

// ---------------------------------------------------------------------------
// Token-stream scans.
// ---------------------------------------------------------------------------

function previousConcreteToken(tokens: readonly TokenNode[], tokenIndex: number): TokenNode | null {
  for (let i = tokenIndex - 1; i >= 0; i--) {
    const t = tokens[i]!
    if (t.synthetic || t.name === "$") continue
    return t
  }
  return null
}

// Scan everything *before* the failure point for LP/CASE open markers
// that haven't been closed yet.  Used to produce "missing )" / "missing
// END" hints when the error token is something else (e.g. a clause
// boundary that interrupted the group).
function scanOpenGroups(tokens: readonly TokenNode[], tokenIndex: number): OpenGroup[] {
  const openGroups: OpenGroup[] = []
  for (let i = 0; i < tokenIndex; i++) {
    const t = tokens[i]!
    if (t.synthetic) continue
    switch (t.name) {
      case "LP":
        openGroups.push({ kind: "LP", token: t })
        break
      case "RP":
        popLastGroup(openGroups, "LP")
        break
      case "CASE":
        openGroups.push({ kind: "CASE", token: t })
        break
      case "END":
        popLastGroup(openGroups, "CASE")
        break
      default:
        break
    }
  }
  return openGroups
}

function popLastGroup(openGroups: OpenGroup[], kind: OpenGroup["kind"]): void {
  for (let i = openGroups.length - 1; i >= 0; i--) {
    if (openGroups[i]!.kind === kind) {
      openGroups.splice(i, 1)
      return
    }
  }
}

// ---------------------------------------------------------------------------
// Token-kind predicates.
// ---------------------------------------------------------------------------

function isClauseBoundary(token: TokenNode): boolean {
  return token.synthetic || CLAUSE_BOUNDARY_TOKEN_NAMES.has(token.name)
}
function startsListItem(token: TokenNode): boolean {
  return ITEM_STARTER_TOKEN_NAMES.has(token.name)
}
function endsListItem(token: TokenNode): boolean {
  return ITEM_ENDER_TOKEN_NAMES.has(token.name)
}

// Something that looks like a bare SQL keyword — ALL_CAPS with optional
// digits/underscores, but not ID/STRING/ILLEGAL.  Used to suggest
// quoting when a keyword appears where an identifier was expected.
function looksKeywordToken(token: TokenNode): boolean {
  if (token.name === "ID" || token.name === "STRING" || token.name === "ILLEGAL") {
    return false
  }
  return /^[A-Z][A-Z0-9_]*$/.test(token.name)
}
