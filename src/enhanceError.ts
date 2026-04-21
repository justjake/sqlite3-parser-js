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
  readonly expectedDisplayById: readonly (string | undefined)[]
  readonly flagsById: Uint16Array
}

type SyntaxParserDefs = Pick<ParserDefs<unknown, unknown>, "constants" | "tables" | "symbols">

type OpenGroup = {
  readonly kind: "LP" | "CASE"
  readonly token: Token
}

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
  const expectedDisplayById: Array<string | undefined> = new Array(tokenCount)
  const flagsById = new Uint16Array(tokenCount)

  for (let i = 0; i < tokenCount; i++) {
    const id = i as TokenId
    const name = defs.symbols[i]!
    const spec = TOKEN_SPECS[name]
    tokenCode.set(name, id)
    displayById[i] = displayNameForSymbol(name, spec)
    flagsById[i] = spec?.flags ?? 0
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

  for (let i = 0; i < tokenCount; i++) {
    if ((flagsById[i] & TokenFlag.Hidden) !== 0) continue
    expectedDisplayById[i] =
      (flagsById[i] & TokenFlag.FallbackToId) !== 0
        ? (displayById[tok.ID] ?? symbolName(defs, tok.ID))
        : (displayById[i] ?? symbolName(defs, i as TokenId))
  }

  return { defs, tok, displayById, expectedDisplayById, flagsById }
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

function displayNameForSymbol(name: string, spec?: TokenSpec): string | undefined {
  if ((spec?.flags ?? 0) & TokenFlag.Hidden) return undefined
  if (spec?.display) return spec.display
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
  return meta.expectedDisplayById[tokenId] ?? null
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

  if (token.type === meta.tok.FROM && expectedHasRole(meta, expected, TokenFlag.ExprStart)) {
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
  if (!previousToken || !hasFlag(meta, previousToken.type, TokenFlag.TableNameContext)) return null
  const after = tokenLabel(meta, previousToken.type)
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
