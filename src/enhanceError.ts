// Grammar-aware syntax diagnostics.
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
// data access is bound to sqlite3-parser's ParserDefs and runtime tokens.

import type { ParserDefs, SymbolId } from "./lempar.ts"
import type { Diagnostic } from "./diagnostics.ts"
import type { Token } from "./tokenize.ts"

export type { Diagnostic, DiagnosticHint, ParseError, ParseErrorContext } from "./diagnostics.ts"
export {
  formatParseError,
  lineColAt,
  renderCodeBlock,
  toParseError,
  toParseErrors,
} from "./diagnostics.ts"

export interface EnhanceParseErrorOptions {
  /** The failing token as the engine saw it (may be synthetic). */
  readonly token: Token
  /** Parser state number at the time of failure. */
  readonly state: number
  /** Full grammar defs — symbol table + action tables. */
  readonly defs: ParserDefs
  /**
   * The full token stream we fed the engine, in chronological order,
   * including any synthetic SEMI/EOF at the tail.  Used for context
   * scanning (open groups, trailing commas, FILTER/OVER ordering).
   */
  readonly tokens: readonly Token[]
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
  readonly token: Token
}

// ---------------------------------------------------------------------------
// Entry points.
// ---------------------------------------------------------------------------

/** SQLite-style short message: `near "FROM": syntax error` / `incomplete input`. */
export function canonicalParseMessage(token: Token): string {
  return token.text.length > 0 ? `near "${token.text}": syntax error` : "incomplete input"
}

export function enhanceParseError(opts: EnhanceParseErrorOptions): Diagnostic {
  const { token, state, defs, tokens, tokenIndex } = opts
  const canonical = canonicalParseMessage(token)

  const idSymbolId = findIdSymbol(defs)
  const expected = collectExpectedTerminals(defs, state, idSymbolId)
  const previousToken = previousConcreteToken(tokens, tokenIndex)
  const openGroups = scanOpenGroups(defs, tokens, tokenIndex)
  const hint = buildHint({
    defs,
    token,
    canonical,
    expected,
    previousToken,
    openGroups,
    tokens,
    tokenIndex,
  })
  const hints =
    hint !== null
      ? [{ message: hint }]
      : expected.length > 0
        ? [{ message: `expected ${formatExpectedList(expected)}` }]
        : undefined
  return hints
    ? { message: canonical, span: token.span, token, hints }
    : { message: canonical, span: token.span, token }
}

/**
 * Build a Diagnostic for an ILLEGAL token that the tokenizer could not
 * classify.  No grammar state is consulted, so `expected` is empty.
 */
export function buildIllegalTokenDiagnostic(token: Token): Diagnostic {
  return {
    message: `unrecognized token: ${JSON.stringify(token.text)}`,
    span: token.span,
    token,
    hints: [{ message: illegalTokenHint(token.text) }],
  }
}

function illegalTokenHint(text: string): string {
  if (text.startsWith("'")) return "unterminated string literal"
  if (text.startsWith('"') || text.startsWith("`") || text.startsWith("[")) {
    return "unterminated quoted identifier"
  }
  if (/^[0-9.]/.test(text)) return "malformed numeric literal"
  return "the tokenizer could not classify this input"
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
  defs: ParserDefs
  token: Token
  canonical: string
  expected: readonly string[]
  previousToken: Token | null
  openGroups: readonly OpenGroup[]
  tokens: readonly Token[]
  tokenIndex: number
}): string | null {
  const { defs, token, canonical, expected, previousToken, openGroups, tokens, tokenIndex } = ctx
  const topOpenGroup = openGroups[openGroups.length - 1] ?? null

  const missingTableNameHint = buildMissingTableNameHint(defs, token, previousToken)
  if (missingTableNameHint) return missingTableNameHint

  if (canonical === "incomplete input") {
    const unclosedGroupHint = buildUnclosedGroupHint(token, topOpenGroup)
    if (unclosedGroupHint) return unclosedGroupHint
    return "query ended before a complete statement was formed"
  }

  const unmatchedClosingHint = buildUnmatchedClosingHint(defs, token, openGroups)
  if (unmatchedClosingHint) return unmatchedClosingHint

  const filterOrderingHint = buildFilterOrderingHint(defs, token, tokens, tokenIndex)
  if (filterOrderingHint) return filterOrderingHint

  const clauseBoundaryHint = buildClauseBoundaryHint(defs, token, topOpenGroup)
  if (clauseBoundaryHint) return clauseBoundaryHint

  const missingCommaHint = buildCommaHint(defs, token, expected, previousToken)
  if (missingCommaHint) return missingCommaHint

  if (tokenName(defs, token) === "FROM" && expected.some((item) => EXPRESSION_STARTERS.has(item))) {
    return "expected a result expression before FROM"
  }

  const quotedIdentifierHint = buildQuotedIdentifierHint(defs, token, expected)
  if (quotedIdentifierHint) return quotedIdentifierHint

  return null
}

function describeToken(token: Token): string {
  if (token.text.length === 0) return "end of input"
  return `"${token.text}"`
}

function buildMissingTableNameHint(
  defs: ParserDefs,
  token: Token,
  previousToken: Token | null,
): string | null {
  if (!previousToken || !TABLE_NAME_CONTEXT_TOKEN_NAMES.has(tokenName(defs, previousToken))) {
    return null
  }
  if (token.synthetic && token.text.length === 0) {
    return `expected a table name after ${tokenName(defs, previousToken)}`
  }
  const name = tokenName(defs, token)
  if (name === "ID" || name === "STRING") return null
  return `expected a table name after ${tokenName(defs, previousToken)}`
}

function buildUnclosedGroupHint(token: Token, topOpenGroup: OpenGroup | null): string | null {
  if (!topOpenGroup) return null
  if (topOpenGroup.kind === "LP") return `missing ")" before ${describeToken(token)}`
  return `missing END before ${describeToken(token)}`
}

function buildUnmatchedClosingHint(
  defs: ParserDefs,
  token: Token,
  openGroups: readonly OpenGroup[],
): string | null {
  if (tokenName(defs, token) !== "RP") return null
  if (openGroups.some((g) => g.kind === "LP")) return null
  return 'unexpected ")" with no matching "("'
}

function buildFilterOrderingHint(
  defs: ParserDefs,
  token: Token,
  tokens: readonly Token[],
  tokenIndex: number,
): string | null {
  if (tokenName(defs, token) !== "FILTER") return null
  for (let i = tokenIndex - 1; i >= 0; i--) {
    const prev = tokens[i]!
    if (prev.synthetic) continue
    const prevName = tokenName(defs, prev)
    if (prevName === "SEMI") break
    if (prevName === "FILTER") break
    if (prevName === "OVER") return "FILTER clauses must appear before OVER clauses"
  }
  return null
}

function buildClauseBoundaryHint(
  defs: ParserDefs,
  token: Token,
  topOpenGroup: OpenGroup | null,
): string | null {
  if (!topOpenGroup || !isClauseBoundary(defs, token)) return null
  if (topOpenGroup.kind === "LP") return `missing ")" before ${describeToken(token)}`
  return `missing END before ${describeToken(token)}`
}

function buildCommaHint(
  defs: ParserDefs,
  token: Token,
  expected: readonly string[],
  previousToken: Token | null,
): string | null {
  if (tokenName(defs, token) === "COMMA" && expected.includes(")")) {
    return 'remove this comma or add another list item before ")"'
  }
  if (
    token.synthetic &&
    token.text.length === 0 &&
    previousToken &&
    tokenName(defs, previousToken) === "COMMA"
  ) {
    return "remove the trailing comma or add another list item before end of input"
  }
  if (
    previousToken &&
    tokenName(defs, previousToken) === "COMMA" &&
    isClauseBoundary(defs, token)
  ) {
    return `remove the trailing comma or add another list item before ${describeToken(token)}`
  }
  if (!previousToken || !startsListItem(defs, token) || !endsListItem(defs, previousToken)) {
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

function buildQuotedIdentifierHint(
  defs: ParserDefs,
  token: Token,
  expected: readonly string[],
): string | null {
  if (!expected.includes("identifier")) return null
  if (!looksKeywordToken(defs, token)) return null
  return `if you intended ${describeToken(token)} as an identifier here, quote it`
}

// ---------------------------------------------------------------------------
// Token-stream scans.
// ---------------------------------------------------------------------------

function previousConcreteToken(tokens: readonly Token[], tokenIndex: number): Token | null {
  for (let i = tokenIndex - 1; i >= 0; i--) {
    const t = tokens[i]!
    if (t.synthetic || t.type === 0) continue
    return t
  }
  return null
}

// Scan everything *before* the failure point for LP/CASE open markers
// that haven't been closed yet.  Used to produce "missing )" / "missing
// END" hints when the error token is something else (e.g. a clause
// boundary that interrupted the group).
function scanOpenGroups(
  defs: ParserDefs,
  tokens: readonly Token[],
  tokenIndex: number,
): OpenGroup[] {
  const openGroups: OpenGroup[] = []
  for (let i = 0; i < tokenIndex; i++) {
    const t = tokens[i]!
    if (t.synthetic) continue
    switch (tokenName(defs, t)) {
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

function isClauseBoundary(defs: ParserDefs, token: Token): boolean {
  return token.synthetic || CLAUSE_BOUNDARY_TOKEN_NAMES.has(tokenName(defs, token))
}
function startsListItem(defs: ParserDefs, token: Token): boolean {
  return ITEM_STARTER_TOKEN_NAMES.has(tokenName(defs, token))
}
function endsListItem(defs: ParserDefs, token: Token): boolean {
  return ITEM_ENDER_TOKEN_NAMES.has(tokenName(defs, token))
}

// Something that looks like a bare SQL keyword — ALL_CAPS with optional
// digits/underscores, but not ID/STRING/ILLEGAL.  Used to suggest
// quoting when a keyword appears where an identifier was expected.
function looksKeywordToken(defs: ParserDefs, token: Token): boolean {
  const name = tokenName(defs, token)
  if (name === "ID" || name === "STRING" || name === "ILLEGAL") {
    return false
  }
  return /^[A-Z][A-Z0-9_]*$/.test(name)
}

function tokenName(defs: ParserDefs, token: Token): string {
  return defs.symbols[token.type] ?? String(token.type)
}
