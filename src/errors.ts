import type { ParserDefs, TokenId } from "./lempar.ts"
import type { KeywordDefs, Span, Token } from "./tokenize.ts"

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

/**
 * Build a Diagnostic for an ILLEGAL token that the tokenizer could not
 * classify. No grammar state is consulted.
 */
export function buildIllegalTokenDiagnostic(token: Token): Diagnostic {
  const hints = [{ message: illegalTokenHint(token.text) }]
  const escapedText = JSON.stringify(token.text)
  if (escapedText.slice(1, -1) !== String(token.text)) {
    hints.push({ message: `escaped token text: ${escapedText}` })
  }
  return {
    message: `unrecognized token: "${token.text}"`,
    span: token.span,
    token,
    hints,
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

interface UnexpectedSyntaxErrorOptions {
  readonly token: Token
  readonly state: number
  readonly tokens: readonly Token[]
  readonly tokenIndex: number
  /**
   * Stack of currently unmatched opener tokens (LP / CASE), maintained
   * by `parse()` in lockstep with the dispatch loop.  The innermost
   * open delimiter is the last element.
   */
  readonly openers: readonly Token[]
}

const enum TokenFlag {
  ExprStart = 1 << 0,
  ItemStart = 1 << 1,
  ItemEnd = 1 << 2,
  ClauseBoundary = 1 << 3,
  TableNameContext = 1 << 4,
  Hidden = 1 << 5,
  KeywordLike = 1 << 6,
  FallbackToId = 1 << 7,
}

const REQUIRED_TOKEN_NAMES = [
  "ID",
  "STRING",
  "ILLEGAL",
  "SPACE",
  "COMMENT",
  "COMMA",
  "SEMI",
  "LP",
  "RP",
  "CASE",
  "END",
  "FROM",
  "FILTER",
  "OVER",
] as const

type BoundTokens = Readonly<Record<(typeof REQUIRED_TOKEN_NAMES)[number], TokenId>>

interface SyntaxMeta {
  readonly defs: SyntaxParserDefs
  readonly tok: BoundTokens
  readonly displayById: readonly (string | undefined)[]
  readonly flagsById: Uint16Array
}

type SyntaxParserDefs = Pick<ParserDefs<unknown, unknown>, "constants" | "tables" | "symbols">

interface TokenSpec {
  readonly display?: string
  readonly flags?: number
}

const VALUE_TOKEN = TokenFlag.ExprStart | TokenFlag.ItemStart | TokenFlag.ItemEnd
const PREFIX_EXPR_TOKEN = TokenFlag.ExprStart | TokenFlag.ItemStart
const CLAUSE_TOKEN = TokenFlag.ClauseBoundary
const TABLE_NAME_CONTEXT = TokenFlag.TableNameContext

const TOKEN_SPECS: Readonly<Record<string, TokenSpec>> = {
  $: { display: "end of input" },
  SPACE: { flags: TokenFlag.Hidden },
  COMMENT: { flags: TokenFlag.Hidden },
  ILLEGAL: { flags: TokenFlag.Hidden },
  ID: { display: "identifier", flags: VALUE_TOKEN },
  STRING: { display: "string literal", flags: VALUE_TOKEN },
  INTEGER: { display: "integer literal", flags: VALUE_TOKEN },
  FLOAT: { display: "float literal", flags: VALUE_TOKEN },
  QNUMBER: { display: "numeric literal", flags: VALUE_TOKEN },
  BLOB: { display: "blob literal", flags: VALUE_TOKEN },
  VARIABLE: { display: "bind parameter", flags: VALUE_TOKEN },
  LP: { display: "(", flags: PREFIX_EXPR_TOKEN },
  RP: { display: ")", flags: TokenFlag.ItemEnd },
  COMMA: { display: "," },
  SEMI: { display: ";" },
  STAR: { display: "*", flags: PREFIX_EXPR_TOKEN },
  DOT: { display: "." },
  PLUS: { display: "+", flags: PREFIX_EXPR_TOKEN },
  MINUS: { display: "-", flags: PREFIX_EXPR_TOKEN },
  SLASH: { display: "/" },
  REM: { display: "%" },
  EQ: { display: "=" },
  LT: { display: "<" },
  LE: { display: "<=" },
  GT: { display: ">" },
  GE: { display: ">=" },
  NE: { display: "!=" },
  CONCAT: { display: "||" },
  BITAND: { display: "&" },
  BITOR: { display: "|" },
  BITNOT: { display: "~", flags: PREFIX_EXPR_TOKEN },
  LSHIFT: { display: "<<" },
  RSHIFT: { display: ">>" },
  PTR: { display: "->" },
  NULL: { flags: VALUE_TOKEN },
  CASE: { flags: PREFIX_EXPR_TOKEN },
  CAST: { flags: PREFIX_EXPR_TOKEN },
  EXISTS: { flags: PREFIX_EXPR_TOKEN },
  NOT: { flags: PREFIX_EXPR_TOKEN },
  CURRENT: { flags: VALUE_TOKEN },
  CTIME_KW: { display: "date/time literal", flags: VALUE_TOKEN },
  TRUEFALSE: { flags: TokenFlag.ItemEnd },
  SELECT: { flags: TokenFlag.ItemStart },
  VALUES: { flags: TokenFlag.ItemStart | CLAUSE_TOKEN },
  END: { flags: TokenFlag.ItemEnd },
  FROM: { flags: CLAUSE_TOKEN | TABLE_NAME_CONTEXT },
  WHERE: { flags: CLAUSE_TOKEN },
  GROUP: { flags: CLAUSE_TOKEN },
  HAVING: { flags: CLAUSE_TOKEN },
  WINDOW: { flags: CLAUSE_TOKEN },
  ORDER: { flags: CLAUSE_TOKEN },
  LIMIT: { flags: CLAUSE_TOKEN },
  FILTER: { flags: CLAUSE_TOKEN },
  OVER: { flags: CLAUSE_TOKEN },
  JOIN: { flags: CLAUSE_TOKEN | TABLE_NAME_CONTEXT },
  ON: { flags: CLAUSE_TOKEN },
  USING: { flags: CLAUSE_TOKEN },
  UNION: { flags: CLAUSE_TOKEN },
  INTERSECT: { flags: CLAUSE_TOKEN },
  EXCEPT: { flags: CLAUSE_TOKEN },
  THEN: { flags: CLAUSE_TOKEN },
  ELSE: { flags: CLAUSE_TOKEN },
  WHEN: { flags: CLAUSE_TOKEN },
  DO: { flags: CLAUSE_TOKEN },
  SET: { flags: CLAUSE_TOKEN },
  RETURNING: { flags: CLAUSE_TOKEN },
  INTO: { flags: TABLE_NAME_CONTEXT },
  UPDATE: { flags: TABLE_NAME_CONTEXT },
  JOIN_KW: { display: "join operator" },
}

export function bindSyntaxDiagnostics(defs: SyntaxParserDefs, keywordDefs: KeywordDefs) {
  const meta = bindSyntaxMeta(defs, keywordDefs)
  return (opts: UnexpectedSyntaxErrorOptions): Diagnostic => buildUnexpectedDiagnostic(meta, opts)
}

function canonicalParseMessage(token: Token): string {
  return token.text.length > 0 ? `near "${token.text}": syntax error` : "incomplete input"
}

function bindSyntaxMeta(defs: SyntaxParserDefs, keywordDefs: KeywordDefs): SyntaxMeta {
  const tokenCount = defs.constants.YYNTOKEN
  const tokenCode = new Map<string, TokenId>()
  const displayById: Array<string | undefined> = new Array(tokenCount)
  const flagsById = new Uint16Array(tokenCount)

  for (let i = 0; i < tokenCount; i++) {
    const id = i as TokenId
    const name = defs.symbols[i]!
    const spec = TOKEN_SPECS[name]
    tokenCode.set(name, id)
    displayById[i] = displayNameForSymbol(name, spec)
    flagsById[i] = spec?.flags ?? 0
  }

  const tok = bindTokens(tokenCode)

  const yyFallback = defs.tables.yyFallback ?? []
  for (let i = 0; i < tokenCount; i++) {
    if (i === tok.ID) continue
    if ((yyFallback[i] ?? 0) === tok.ID) {
      flagsById[i] |= TokenFlag.FallbackToId
    }
  }

  for (const keyword of keywordDefs.keywords) {
    const id = tokenCode.get(keyword.token)
    if (id === undefined) continue
    if (id === tok.ID || id === tok.STRING || id === tok.ILLEGAL) continue
    flagsById[id] |= TokenFlag.KeywordLike
  }

  return { defs, tok, displayById, flagsById }
}

function buildUnexpectedDiagnostic(
  meta: SyntaxMeta,
  opts: UnexpectedSyntaxErrorOptions,
): Diagnostic {
  const { token, state, tokens, tokenIndex, openers } = opts
  const canonical = canonicalParseMessage(token)
  const expected = collectExpected(meta, state)
  const previousToken = previousConcreteToken(tokens, tokenIndex)
  const hints =
    buildHint(meta, {
      token,
      canonical,
      expected,
      previousToken,
      openers,
      tokens,
      tokenIndex,
    }) ??
    (expected.length > 0
      ? [{ message: `expected ${formatExpectedList(meta, expected)}` }]
      : undefined)
  return hints
    ? { message: canonical, span: token.span, token, hints }
    : { message: canonical, span: token.span, token }
}

function displayNameForSymbol(name: string, spec?: TokenSpec): string | undefined {
  if ((spec?.flags ?? 0) & TokenFlag.Hidden) return undefined
  if (spec?.display) return spec.display
  if (/^[A-Z_]+$/.test(name)) return name.replace(/_KW$/, "").toLowerCase()
  return name
}

function requireTokenId(tokenCode: ReadonlyMap<string, TokenId>, name: string): TokenId {
  const id = tokenCode.get(name)
  if (id === undefined) throw new Error(`errors.ts: missing terminal token "${name}"`)
  return id
}

function bindTokens(tokenCode: ReadonlyMap<string, TokenId>): BoundTokens {
  return Object.fromEntries(
    REQUIRED_TOKEN_NAMES.map((name) => [name, requireTokenId(tokenCode, name)]),
  ) as BoundTokens
}

function collectExpected(meta: SyntaxMeta, state: number): readonly TokenId[] {
  const tokenIds = meta.defs.tables.yy_expected?.[state] ?? []
  const expected: TokenId[] = []
  for (const tokenId of tokenIds) {
    if (isHiddenExpected(meta, tokenId as TokenId)) continue
    expected.push(tokenId as TokenId)
  }
  return expected
}

function isHiddenExpected(meta: SyntaxMeta, tokenId: TokenId): boolean {
  return hasFlag(meta, tokenId, TokenFlag.Hidden)
}

function fallsBackToIdentifier(meta: SyntaxMeta, tokenId: TokenId): boolean {
  return hasFlag(meta, tokenId, TokenFlag.FallbackToId)
}

function expectedAcceptsIdentifier(meta: SyntaxMeta, expected: readonly TokenId[]): boolean {
  for (const tokenId of expected) {
    if (tokenId === meta.tok.ID || fallsBackToIdentifier(meta, tokenId)) return true
  }
  return false
}

function expectedHasId(expected: readonly TokenId[], tokenId: TokenId): boolean {
  return expected.includes(tokenId)
}

function expectedHasRole(meta: SyntaxMeta, expected: readonly TokenId[], role: TokenFlag): boolean {
  for (const tokenId of expected) {
    if (hasFlag(meta, tokenId, role)) return true
  }
  return false
}

function expectedLabel(meta: SyntaxMeta, tokenId: TokenId): string | null {
  if (isHiddenExpected(meta, tokenId)) return null
  if (fallsBackToIdentifier(meta, tokenId)) return tokenLabel(meta, meta.tok.ID)
  return tokenLabel(meta, tokenId)
}

function compareExpectedLabels(left: string, right: string): number {
  const leftPunct = /^[^a-z0-9]/i.test(left)
  const rightPunct = /^[^a-z0-9]/i.test(right)
  if (leftPunct !== rightPunct) return leftPunct ? -1 : 1
  return left.localeCompare(right)
}

function formatExpectedList(meta: SyntaxMeta, expected: readonly TokenId[]): string {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const tokenId of expected) {
    const label = expectedLabel(meta, tokenId)
    if (label === null || seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  labels.sort(compareExpectedLabels)
  const items = labels.slice(0, 5)
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} or ${items[1]}`
  const head = items.slice(0, -1).join(", ")
  const tail = items[items.length - 1]
  const suffix = labels.length > items.length ? ", ..." : ""
  return `${head}, or ${tail}${suffix}`
}

function buildHint(
  meta: SyntaxMeta,
  ctx: {
    token: Token
    canonical: string
    expected: readonly TokenId[]
    previousToken: Token | null
    openers: readonly Token[]
    tokens: readonly Token[]
    tokenIndex: number
  },
): DiagnosticHint[] | null {
  const { token, canonical, expected, previousToken, openers, tokens, tokenIndex } = ctx
  const topOpener = openers[openers.length - 1] ?? null

  const missingTableName = buildMissingTableNameHint(meta, token, previousToken)
  if (missingTableName) return [{ message: missingTableName }]

  if (canonical === "incomplete input") {
    return buildUnclosedGroupHints(meta, token, topOpener) ?? [
      { message: "query ended before a complete statement was formed" },
    ]
  }

  const unmatchedClosing = buildUnmatchedClosingHint(meta, token, openers)
  if (unmatchedClosing) return [{ message: unmatchedClosing }]

  const filterOrdering = buildFilterOrderingHint(meta, token, tokens, tokenIndex)
  if (filterOrdering) return [{ message: filterOrdering }]

  const clauseBoundary = buildClauseBoundaryHints(meta, token, topOpener)
  if (clauseBoundary) return clauseBoundary

  const missingComma = buildCommaHint(meta, token, expected, previousToken)
  if (missingComma) return [{ message: missingComma }]

  if (token.type === meta.tok.FROM && expectedHasRole(meta, expected, TokenFlag.ExprStart)) {
    return [{ message: "expected a result expression before FROM" }]
  }

  const quotedIdentifier = buildQuotedIdentifierHint(meta, token, expected)
  if (quotedIdentifier) return [{ message: quotedIdentifier }]

  return null
}

function describeToken(token: Token): string {
  if (token.text.length === 0) return "end of input"
  return `"${token.text}"`
}

function buildMissingTableNameHint(
  meta: SyntaxMeta,
  token: Token,
  previousToken: Token | null,
): string | null {
  if (!previousToken || !hasFlag(meta, previousToken.type, TokenFlag.TableNameContext)) return null
  const after = tokenLabel(meta, previousToken.type)
  if (token.synthetic && token.text.length === 0) return `expected a table name after ${after}`
  if (token.type === meta.tok.ID || token.type === meta.tok.STRING) return null
  return `expected a table name after ${after}`
}

function buildUnclosedGroupHints(
  meta: SyntaxMeta,
  token: Token,
  topOpener: Token | null,
): DiagnosticHint[] | null {
  if (!topOpener) return null
  const isParen = topOpener.type === meta.tok.LP
  const missing = isParen ? `missing ")" before ${describeToken(token)}` : `missing END before ${describeToken(token)}`
  const matchWhat = isParen ? 'to match this "("' : "to match this CASE"
  return [{ message: missing }, { message: matchWhat, span: topOpener.span }]
}

function buildUnmatchedClosingHint(
  meta: SyntaxMeta,
  token: Token,
  openers: readonly Token[],
): string | null {
  if (token.type !== meta.tok.RP) return null
  if (openers.some((o) => o.type === meta.tok.LP)) return null
  return 'unexpected ")" with no matching "("'
}

function buildFilterOrderingHint(
  meta: SyntaxMeta,
  token: Token,
  tokens: readonly Token[],
  tokenIndex: number,
): string | null {
  if (token.type !== meta.tok.FILTER) return null
  for (let i = tokenIndex - 1; i >= 0; i--) {
    const prev = tokens[i]!
    if (prev.synthetic) continue
    if (prev.type === meta.tok.SEMI) break
    if (prev.type === meta.tok.FILTER) break
    if (prev.type === meta.tok.OVER) return "FILTER clauses must appear before OVER clauses"
  }
  return null
}

function buildClauseBoundaryHints(
  meta: SyntaxMeta,
  token: Token,
  topOpener: Token | null,
): DiagnosticHint[] | null {
  if (!topOpener || !isClauseBoundary(meta, token)) return null
  return buildUnclosedGroupHints(meta, token, topOpener)
}

function buildCommaHint(
  meta: SyntaxMeta,
  token: Token,
  expected: readonly TokenId[],
  previousToken: Token | null,
): string | null {
  if (token.type === meta.tok.COMMA && expectedHasId(expected, meta.tok.RP)) {
    return 'remove this comma or add another list item before ")"'
  }
  if (token.synthetic && token.text.length === 0 && previousToken?.type === meta.tok.COMMA) {
    return "remove the trailing comma or add another list item before end of input"
  }
  if (previousToken?.type === meta.tok.COMMA && isClauseBoundary(meta, token)) {
    return `remove the trailing comma or add another list item before ${describeToken(token)}`
  }
  if (!previousToken || !startsListItem(meta, token) || !endsListItem(meta, previousToken)) {
    return null
  }
  if (expectedHasId(expected, meta.tok.COMMA)) {
    return `missing comma before ${describeToken(token)}`
  }
  if (
    expectedHasId(expected, meta.tok.RP) ||
    expectedHasId(expected, meta.tok.SEMI) ||
    expectedHasRole(meta, expected, TokenFlag.ClauseBoundary)
  ) {
    return `possible missing comma or operator before ${describeToken(token)}`
  }
  return null
}

function buildQuotedIdentifierHint(
  meta: SyntaxMeta,
  token: Token,
  expected: readonly TokenId[],
): string | null {
  if (!expectedAcceptsIdentifier(meta, expected)) return null
  if (!looksKeywordToken(meta, token)) return null
  return `if you intended ${describeToken(token)} as an identifier here, quote it`
}

function previousConcreteToken(tokens: readonly Token[], tokenIndex: number): Token | null {
  for (let i = tokenIndex - 1; i >= 0; i--) {
    const token = tokens[i]!
    if (token.synthetic || token.type === 0) continue
    return token
  }
  return null
}

function hasFlag(meta: SyntaxMeta, tokenId: TokenId, flag: TokenFlag): boolean {
  return (meta.flagsById[tokenId] & flag) !== 0
}

function isClauseBoundary(meta: SyntaxMeta, token: Token): boolean {
  return token.synthetic || hasFlag(meta, token.type, TokenFlag.ClauseBoundary)
}

function startsListItem(meta: SyntaxMeta, token: Token): boolean {
  return hasFlag(meta, token.type, TokenFlag.ItemStart)
}

function endsListItem(meta: SyntaxMeta, token: Token): boolean {
  return hasFlag(meta, token.type, TokenFlag.ItemEnd)
}

function looksKeywordToken(meta: SyntaxMeta, token: Token): boolean {
  if (
    token.type === meta.tok.ID ||
    token.type === meta.tok.STRING ||
    token.type === meta.tok.ILLEGAL
  ) {
    return false
  }
  return hasFlag(meta, token.type, TokenFlag.KeywordLike)
}

function tokenLabel(meta: SyntaxMeta, tokenId: TokenId): string {
  return meta.displayById[tokenId] ?? symbolName(meta.defs, tokenId)
}

function symbolName(defs: SyntaxParserDefs, tokenId: TokenId): string {
  return defs.symbols[tokenId] ?? String(tokenId)
}
