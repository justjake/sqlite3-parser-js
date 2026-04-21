// Grammar-aware syntax diagnostics.
//
// Given a failing parser token, parser state, and the parser-visible token
// stream, produce a structured syntax diagnostic. The implementation binds
// grammar-specific token metadata once per ParserModule so the hot error path
// works on token ids and role bits rather than ad hoc token-name strings.

import type { Diagnostic } from "./diagnostics.ts"
import type { ParserDefs, TokenId } from "./lempar.ts"
import type { KeywordDefs, Token } from "./tokenize.ts"

export type { Diagnostic, DiagnosticHint, ParseError, ParseErrorContext } from "./diagnostics.ts"
export {
  formatParseError,
  lineColAt,
  renderCodeBlock,
  toParseError,
  toParseErrors,
} from "./diagnostics.ts"

export interface UnexpectedParseErrorOptions {
  /** The failing token as the engine saw it (may be synthetic). */
  readonly token: Token
  /** Parser state number at the time of failure. */
  readonly state: number
  /**
   * The parser-visible token stream in chronological order, including any
   * synthetic SEMI/EOF at the tail.
   */
  readonly tokens: readonly Token[]
  /** 0-based index of `token` within `tokens`. */
  readonly tokenIndex: number
}

export interface SyntaxDiagnostics {
  unexpected(opts: UnexpectedParseErrorOptions): Diagnostic
}

const enum TokenRole {
  ExprStart = 1 << 0,
  ItemStart = 1 << 1,
  ItemEnd = 1 << 2,
  ClauseBoundary = 1 << 3,
  TableNameContext = 1 << 4,
}

interface BoundTokens {
  readonly ID: TokenId
  readonly STRING: TokenId
  readonly ILLEGAL: TokenId
  readonly SPACE: TokenId
  readonly COMMENT: TokenId
  readonly COMMA: TokenId
  readonly SEMI: TokenId
  readonly LP: TokenId
  readonly RP: TokenId
  readonly CASE: TokenId
  readonly END: TokenId
  readonly FROM: TokenId
  readonly FILTER: TokenId
  readonly OVER: TokenId
}

interface SyntaxMeta {
  readonly defs: SyntaxParserDefs
  readonly tok: BoundTokens
  readonly displayById: readonly (string | undefined)[]
  readonly roleBitsById: Uint32Array
  readonly keywordLikeById: Uint8Array
}

type SyntaxParserDefs = Pick<ParserDefs<unknown, unknown>, "constants" | "tables" | "symbols">

type OpenGroup = {
  readonly kind: "LP" | "CASE"
  readonly token: Token
}

const DISPLAY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
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

const ROLE_SPECS: ReadonlyArray<readonly [TokenRole, readonly string[]]> = [
  [
    TokenRole.ExprStart,
    [
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
      "CURRENT",
      "CTIME_KW",
    ],
  ],
  [
    TokenRole.ItemStart,
    [
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
    ],
  ],
  [
    TokenRole.ItemEnd,
    [
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
    ],
  ],
  [
    TokenRole.ClauseBoundary,
    [
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
    ],
  ],
  [TokenRole.TableNameContext, ["FROM", "JOIN", "INTO", "UPDATE"]],
]

export function bindSyntaxDiagnostics(
  defs: SyntaxParserDefs,
  keywordDefs: KeywordDefs,
): SyntaxDiagnostics {
  const meta = bindSyntaxMeta(defs, keywordDefs)
  return {
    unexpected(opts: UnexpectedParseErrorOptions): Diagnostic {
      return buildUnexpectedDiagnostic(meta, opts)
    },
  }
}

/** SQLite-style short message: `near "FROM": syntax error` / `incomplete input`. */
export function canonicalParseMessage(token: Token): string {
  return token.text.length > 0 ? `near "${token.text}": syntax error` : "incomplete input"
}

function bindSyntaxMeta(defs: SyntaxParserDefs, keywordDefs: KeywordDefs): SyntaxMeta {
  const tokenCount = defs.constants.YYNTOKEN
  const tokenCode = new Map<string, TokenId>()
  const displayById: Array<string | undefined> = new Array(tokenCount)
  const roleBitsById = new Uint32Array(tokenCount)
  const keywordLikeById = new Uint8Array(tokenCount)

  for (let i = 0; i < tokenCount; i++) {
    const id = i as TokenId
    const name = defs.symbols[i]!
    tokenCode.set(name, id)
    displayById[i] = displayNameForSymbol(name)
  }

  const tok: BoundTokens = {
    ID: requireTokenId(tokenCode, "ID"),
    STRING: requireTokenId(tokenCode, "STRING"),
    ILLEGAL: requireTokenId(tokenCode, "ILLEGAL"),
    SPACE: requireTokenId(tokenCode, "SPACE"),
    COMMENT: requireTokenId(tokenCode, "COMMENT"),
    COMMA: requireTokenId(tokenCode, "COMMA"),
    SEMI: requireTokenId(tokenCode, "SEMI"),
    LP: requireTokenId(tokenCode, "LP"),
    RP: requireTokenId(tokenCode, "RP"),
    CASE: requireTokenId(tokenCode, "CASE"),
    END: requireTokenId(tokenCode, "END"),
    FROM: requireTokenId(tokenCode, "FROM"),
    FILTER: requireTokenId(tokenCode, "FILTER"),
    OVER: requireTokenId(tokenCode, "OVER"),
  }

  for (const [role, names] of ROLE_SPECS) {
    for (const name of names) {
      const id = requireTokenId(tokenCode, name)
      roleBitsById[id] |= role
    }
  }

  for (const keyword of keywordDefs.keywords) {
    const id = tokenCode.get(keyword.token)
    if (id === undefined) continue
    if (id === tok.ID || id === tok.STRING || id === tok.ILLEGAL) continue
    keywordLikeById[id] = 1
  }

  return { defs, tok, displayById, roleBitsById, keywordLikeById }
}

function buildUnexpectedDiagnostic(
  meta: SyntaxMeta,
  opts: UnexpectedParseErrorOptions,
): Diagnostic {
  const { token, state, tokens, tokenIndex } = opts
  const canonical = canonicalParseMessage(token)
  const expected = collectExpected(meta, state)
  const previousToken = previousConcreteToken(tokens, tokenIndex)
  const openGroups = scanOpenGroups(meta, tokens, tokenIndex)
  const hint = buildHint(meta, {
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
        ? [{ message: `expected ${formatExpectedList(meta, expected)}` }]
        : undefined
  return hints
    ? { message: canonical, span: token.span, token, hints }
    : { message: canonical, span: token.span, token }
}

function displayNameForSymbol(name: string): string | undefined {
  if (name === "SPACE" || name === "COMMENT" || name === "ILLEGAL") return undefined
  const override = DISPLAY_NAME_OVERRIDES[name]
  if (override) return override
  if (/^[A-Z_]+$/.test(name)) return name.replace(/_KW$/, "").toLowerCase()
  return name
}

function requireTokenId(tokenCode: ReadonlyMap<string, TokenId>, name: string): TokenId {
  const id = tokenCode.get(name)
  if (id === undefined) throw new Error(`enhanceError.ts: missing terminal token "${name}"`)
  return id
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
  return tokenId === meta.tok.SPACE || tokenId === meta.tok.COMMENT || tokenId === meta.tok.ILLEGAL
}

function fallsBackToIdentifier(meta: SyntaxMeta, tokenId: TokenId): boolean {
  const fallback = meta.defs.tables.yyFallback?.[tokenId] ?? 0
  return tokenId !== meta.tok.ID && fallback === meta.tok.ID
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

function expectedHasRole(meta: SyntaxMeta, expected: readonly TokenId[], role: TokenRole): boolean {
  for (const tokenId of expected) {
    if (hasRole(meta, tokenId, role)) return true
  }
  return false
}

function expectedLabel(meta: SyntaxMeta, tokenId: TokenId): string | null {
  if (isHiddenExpected(meta, tokenId)) return null
  if (fallsBackToIdentifier(meta, tokenId)) {
    return meta.displayById[meta.tok.ID] ?? symbolName(meta, meta.tok.ID)
  }
  return meta.displayById[tokenId] ?? symbolName(meta, tokenId)
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
    openGroups: readonly OpenGroup[]
    tokens: readonly Token[]
    tokenIndex: number
  },
): string | null {
  const { token, canonical, expected, previousToken, openGroups, tokens, tokenIndex } = ctx
  const topOpenGroup = openGroups[openGroups.length - 1] ?? null

  const missingTableNameHint = buildMissingTableNameHint(meta, token, previousToken)
  if (missingTableNameHint) return missingTableNameHint

  if (canonical === "incomplete input") {
    const unclosedGroupHint = buildUnclosedGroupHint(token, topOpenGroup)
    if (unclosedGroupHint) return unclosedGroupHint
    return "query ended before a complete statement was formed"
  }

  const unmatchedClosingHint = buildUnmatchedClosingHint(meta, token, openGroups)
  if (unmatchedClosingHint) return unmatchedClosingHint

  const filterOrderingHint = buildFilterOrderingHint(meta, token, tokens, tokenIndex)
  if (filterOrderingHint) return filterOrderingHint

  const clauseBoundaryHint = buildClauseBoundaryHint(meta, token, topOpenGroup)
  if (clauseBoundaryHint) return clauseBoundaryHint

  const missingCommaHint = buildCommaHint(meta, token, expected, previousToken)
  if (missingCommaHint) return missingCommaHint

  if (token.type === meta.tok.FROM && expectedHasRole(meta, expected, TokenRole.ExprStart)) {
    return "expected a result expression before FROM"
  }

  const quotedIdentifierHint = buildQuotedIdentifierHint(meta, token, expected)
  if (quotedIdentifierHint) return quotedIdentifierHint

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
  if (!previousToken || !hasRole(meta, previousToken.type, TokenRole.TableNameContext)) return null
  const after = expectedLabel(meta, previousToken.type) ?? symbolName(meta, previousToken.type)
  if (token.synthetic && token.text.length === 0) return `expected a table name after ${after}`
  if (token.type === meta.tok.ID || token.type === meta.tok.STRING) return null
  return `expected a table name after ${after}`
}

function buildUnclosedGroupHint(token: Token, topOpenGroup: OpenGroup | null): string | null {
  if (!topOpenGroup) return null
  if (topOpenGroup.kind === "LP") return `missing ")" before ${describeToken(token)}`
  return `missing END before ${describeToken(token)}`
}

function buildUnmatchedClosingHint(
  meta: SyntaxMeta,
  token: Token,
  openGroups: readonly OpenGroup[],
): string | null {
  if (token.type !== meta.tok.RP) return null
  if (openGroups.some((g) => g.kind === "LP")) return null
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

function buildClauseBoundaryHint(
  meta: SyntaxMeta,
  token: Token,
  topOpenGroup: OpenGroup | null,
): string | null {
  if (!topOpenGroup || !isClauseBoundary(meta, token)) return null
  if (topOpenGroup.kind === "LP") return `missing ")" before ${describeToken(token)}`
  return `missing END before ${describeToken(token)}`
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
    expectedHasRole(meta, expected, TokenRole.ClauseBoundary)
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

function scanOpenGroups(
  meta: SyntaxMeta,
  tokens: readonly Token[],
  tokenIndex: number,
): OpenGroup[] {
  const openGroups: OpenGroup[] = []
  for (let i = 0; i < tokenIndex; i++) {
    const token = tokens[i]!
    if (token.synthetic) continue
    switch (token.type) {
      case meta.tok.LP:
        openGroups.push({ kind: "LP", token })
        break
      case meta.tok.RP:
        popLastGroup(openGroups, "LP")
        break
      case meta.tok.CASE:
        openGroups.push({ kind: "CASE", token })
        break
      case meta.tok.END:
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

function hasRole(meta: SyntaxMeta, tokenId: TokenId, role: TokenRole): boolean {
  return (meta.roleBitsById[tokenId] & role) !== 0
}

function isClauseBoundary(meta: SyntaxMeta, token: Token): boolean {
  return token.synthetic || hasRole(meta, token.type, TokenRole.ClauseBoundary)
}

function startsListItem(meta: SyntaxMeta, token: Token): boolean {
  return hasRole(meta, token.type, TokenRole.ItemStart)
}

function endsListItem(meta: SyntaxMeta, token: Token): boolean {
  return hasRole(meta, token.type, TokenRole.ItemEnd)
}

function looksKeywordToken(meta: SyntaxMeta, token: Token): boolean {
  if (
    token.type === meta.tok.ID ||
    token.type === meta.tok.STRING ||
    token.type === meta.tok.ILLEGAL
  ) {
    return false
  }
  return meta.keywordLikeById[token.type] === 1
}

function symbolName(meta: SyntaxMeta, tokenId: TokenId): string {
  return meta.defs.symbols[tokenId] ?? String(tokenId)
}
