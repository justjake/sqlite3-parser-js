// Node constructors and validation helpers shared by every action in
// parse-ts.y.  Moving them out of the grammar file keeps parse-ts.y
// focused on rule shapes and keeps these helpers under normal TS
// linting / testing.
//
// Every function that needs to record a diagnostic takes a
// {@link ParseState} (the per-parse mutable record).  Every function
// that consumes a source token takes our parser-facing
// {@link Token} (a {@link TokenSpan} plus the text it covers).
// Terminal-producing constructors attach the `TokenSpan` to the built
// AST node as the `span` back-pointer; no duplicate text is stored.

import { sqlite3Dequote, sqlite3HexToBlob } from "../util.ts"
import type {
  CommonTableExpr,
  ColumnDefinition,
  CompoundSelect,
  CreateTableBody,
  Distinctness,
  Expr,
  FromClause,
  FunctionCallOrder,
  FunctionTail,
  Id,
  JoinConstraint,
  JoinOperator,
  JoinType,
  LikeOperator,
  Limit,
  Literal,
  Name,
  NamedColumnConstraint,
  NamedTableConstraint,
  OneSelect,
  Operator,
  QualifiedName,
  ResultColumn,
  Select,
  SelectBody,
  SelectTable,
  SortedColumn,
  Stmt,
  TabFlags,
  Type,
  UnaryOperator,
  UpsertIndex,
  ValuesRow,
  WindowDef,
  With,
  CmdList,
} from "./nodes.ts"
import type { Span, Token } from "../tokenize.ts"
import type { Diagnostic, DiagnosticHint } from "../diagnostics.ts"
import type { ParseState } from "./parseState.ts"

// ---- Error constructors ----------------------------------------------

/** Build a {@link Diagnostic} with zero or more secondary hints. */
export function mkDiagnostic(
  message: string,
  span: Span,
  ...hints: readonly DiagnosticHint[]
): Diagnostic {
  return hints.length > 0 ? { message, span, hints } : { message, span }
}

/**
 * Common "duplicate X, first declared here" diagnostic.  Points the
 * primary span at the conflicting occurrence and attaches a single
 * `first specified here` hint at the original's span.
 */
export function mkDuplicateDiagnostic(
  message: string,
  span: Span,
  firstSpecifiedHereSpan: Span,
): Diagnostic {
  return mkDiagnostic(message, span, {
    message: "first specified here",
    span: firstSpecifiedHereSpan,
  })
}

// ---- Span helpers -----------------------------------------------------

/**
 * A zero-filled Span.  Used as a conservative fallback when a popped
 * entry doesn't carry span info (e.g. primitive-typed nonterminals).
 */
const ZERO_SPAN: Span = { offset: 0, length: 0, line: 0, col: 0 }

/**
 * Compute a Span covering every popped entry in one LALR reduction.
 * The emitter calls this from a `nodeSpan` closure at the top of the
 * reducer function; action bodies then invoke `nodeSpan()` wherever a
 * composite-node span is required.
 */
export function spanFromPopped(popped: readonly { readonly minor: unknown }[]): Span {
  if (popped.length === 0) return ZERO_SPAN
  const first = extractSpan(popped[0]!.minor)
  const last = popped.length === 1 ? first : extractSpan(popped[popped.length - 1]!.minor)
  if (!first || !last) return first ?? last ?? ZERO_SPAN
  return spanOver(first, last)
}

/** Span covering `[first.offset, last.offset + last.length)`. */
export function spanOver(first: Span, last: Span): Span {
  return {
    offset: first.offset,
    length: last.offset + last.length - first.offset,
    line: first.line,
    col: first.col,
  }
}

function extractSpan(minor: unknown): Span | undefined {
  if (minor && typeof minor === "object" && "span" in minor) {
    return (minor as { span: Span }).span
  }
  return undefined
}

// ---- Leaf-node constructors ------------------------------------------

/**
 * Build a {@link Name}.  Identifiers may reach the parser in quoted
 * form (`"foo"`, `[foo]`, `` `foo` ``) — we strip the outer quotes
 * here so downstream code never has to redo the work, matching
 * SQLite's `sqlite3NameFromToken`.  The `span` back-pointer preserves
 * the raw source range for error messages.
 */
export const mkName = (tok: Token): Name => ({
  kind: "Name",
  name: sqlite3Dequote(tok.text) as string,
  span: tok.span,
})

/** Build an {@link Id}.  Same dequoting contract as {@link mkName}. */
export const mkId = (tok: Token): Id => ({
  kind: "Id",
  name: sqlite3Dequote(tok.text) as string,
  span: tok.span,
})

/** Compute a Literal from a `CTIME_KW` token (`CURRENT_DATE` / `CURRENT_TIME` / …). */
export function literalFromCtimeKw(tok: Token): Literal {
  const span = tok.span
  const t = tok.text.toUpperCase()
  if (t === "CURRENT_DATE") return { kind: "CurrentDateLiteral", span }
  if (t === "CURRENT_TIME") return { kind: "CurrentTimeLiteral", span }
  if (t === "CURRENT_TIMESTAMP") return { kind: "CurrentTimestampLiteral", span }
  throw new Error(`unreachable CTIME_KW: ${tok.text}`)
}

/** `NULL` literal. */
export const mkNullLiteral = (tok: Token): Literal => ({ kind: "NullLiteral", span: tok.span })

/** String literal: dequote `'…'` / escape `''` pairs. */
export const mkStringLiteral = (tok: Token): Literal => ({
  kind: "StringLiteral",
  value: sqlite3Dequote(tok.text) as string,
  span: tok.span,
})

/** Blob literal: decode `x'…'` / `X'…'` hex to bytes. */
export const mkBlobLiteral = (tok: Token): Literal => ({
  kind: "BlobLiteral",
  bytes: sqlite3HexToBlob(tok.text),
  span: tok.span,
})

/** Numeric literal produced by `INTEGER` / `FLOAT` — stored as raw text. */
export const mkNumericLiteral = (tok: Token): Literal => ({
  kind: "NumericLiteral",
  value: tok.text,
  span: tok.span,
})

/** Keyword literal for PRAGMA arguments like `ON` / `DELETE` / `DEFAULT`. */
export const mkKeywordLiteral = (tok: Token): Literal => ({
  kind: "KeywordLiteral",
  value: tok.text,
  span: tok.span,
})

// ---- Operator-token decoders -----------------------------------------

/** Map a LIKE_KW/MATCH token's text to the matching {@link LikeOperator}. */
export function likeOperatorFromToken(
  tok: Token,
  tokens: { readonly MATCH: number; readonly LIKE_KW: number },
): LikeOperator {
  if (tok.type === tokens.MATCH) return "Match"
  const t = tok.text.toUpperCase()
  if (t === "LIKE") return "Like"
  if (t === "GLOB") return "Glob"
  if (t === "REGEXP") return "Regexp"
  throw new Error(`unreachable LIKE_KW: ${tok.text}`)
}

/** Map a binary-op token type to its {@link Operator} variant. */
export function binaryOperatorFromToken(tokType: number, tokens: Record<string, number>): Operator {
  switch (tokType) {
    case tokens.AND:
      return "And"
    case tokens.OR:
      return "Or"
    case tokens.LT:
      return "Less"
    case tokens.GT:
      return "Greater"
    case tokens.GE:
      return "GreaterEquals"
    case tokens.LE:
      return "LessEquals"
    case tokens.EQ:
      return "Equals"
    case tokens.NE:
      return "NotEquals"
    case tokens.BITAND:
      return "BitwiseAnd"
    case tokens.BITOR:
      return "BitwiseOr"
    case tokens.LSHIFT:
      return "LeftShift"
    case tokens.RSHIFT:
      return "RightShift"
    case tokens.PLUS:
      return "Add"
    case tokens.MINUS:
      return "Subtract"
    case tokens.STAR:
      return "Multiply"
    case tokens.SLASH:
      return "Divide"
    case tokens.REM:
      return "Modulus"
    case tokens.CONCAT:
      return "Concat"
    case tokens.IS:
      return "Is"
    case tokens.NOT:
      return "IsNot"
    default:
      throw new Error(`unreachable binary op token: ${tokType}`)
  }
}

/** Map a unary-op token type to its {@link UnaryOperator} variant. */
export function unaryOperatorFromToken(
  tokType: number,
  tokens: Record<string, number>,
): UnaryOperator {
  switch (tokType) {
    case tokens.BITNOT:
      return "BitwiseNot"
    case tokens.MINUS:
      return "Negative"
    case tokens.NOT:
      return "Not"
    case tokens.PLUS:
      return "Positive"
    default:
      throw new Error(`unreachable unary op token: ${tokType}`)
  }
}

/** Build the `->` / `->>` binary op from the operator token's text. */
export const ptrOperatorFromToken = (tok: Token): Operator =>
  tok.text === "->>" ? "ArrowRightShift" : "ArrowRight"

// ---- Expression constructors -----------------------------------------
//
// Every composite-node constructor takes a trailing `span: Span` — the
// caller in parse-ts.y passes `nodeSpan()`, which the emitter binds at
// the top of the reducer function so it always reflects the range of
// tokens popped for the current reduction.

export const mkParenthesized = (e: Expr, span: Span): Expr => ({
  kind: "ParenthesizedExpr",
  exprs: [e],
  span,
})

export const mkVariableExpr = (t: Token): Expr => ({
  kind: "VariableExpr",
  name: t.text,
  span: t.span,
})

export const mkCollate = (e: Expr, c: Token, span: Span): Expr => ({
  kind: "CollateExpr",
  expr: e,
  collation: sqlite3Dequote(c.text) as string,
  span,
})

export const mkCast = (e: Expr, typeName: Type | undefined, span: Span): Expr => ({
  kind: "CastExpr",
  expr: e,
  typeName,
  span,
})

export const mkBinary = (l: Expr, op: Operator, r: Expr, span: Span): Expr => ({
  kind: "BinaryExpr",
  left: l,
  op,
  right: r,
  span,
})

export const mkUnary = (op: UnaryOperator, e: Expr, span: Span): Expr => ({
  kind: "UnaryExpr",
  op,
  expr: e,
  span,
})

export const mkBetween = (l: Expr, not: boolean, s: Expr, e: Expr, span: Span): Expr => ({
  kind: "BetweenExpr",
  lhs: l,
  not,
  start: s,
  end: e,
  span,
})

export const mkInList = (
  l: Expr,
  not: boolean,
  r: readonly Expr[] | undefined,
  span: Span,
): Expr => ({ kind: "InListExpr", lhs: l, not, rhs: r, span })

export const mkInSelect = (l: Expr, not: boolean, s: Select, span: Span): Expr => ({
  kind: "InSelectExpr",
  lhs: l,
  not,
  rhs: s,
  span,
})

export const mkInTable = (
  l: Expr,
  not: boolean,
  n: QualifiedName,
  args: readonly Expr[] | undefined,
  span: Span,
): Expr => ({ kind: "InTableExpr", lhs: l, not, rhs: n, args, span })

export const mkSubquery = (s: Select, span: Span): Expr => ({
  kind: "SubqueryExpr",
  select: s,
  span,
})

export const mkExistsExpr = (s: Select, span: Span): Expr => ({
  kind: "ExistsExpr",
  select: s,
  span,
})

/** Build `IS NULL` / `NOT NULL` given the postfix token type. */
export function mkNotNullExpr(
  expr: Expr,
  tokType: number,
  tokens: Record<string, number>,
  span: Span,
): Expr {
  if (tokType === tokens.ISNULL) return { kind: "IsNullExpr", expr, span }
  if (tokType === tokens.NOTNULL) return { kind: "NotNullExpr", expr, span }
  throw new Error(`unreachable NULL-test token: ${tokType}`)
}

export function mkLikeExpr(
  lhs: Expr,
  not: boolean,
  op: LikeOperator,
  rhs: Expr,
  escape: Expr | undefined,
  span: Span,
): Expr {
  return { kind: "LikeExpr", lhs, not, op, rhs, escape, span }
}

/** Build a `FunctionCall` expression.  Validates DISTINCT argument count. */
export function mkFunctionCall(
  state: ParseState,
  nameTok: Token,
  distinctness: Distinctness | undefined,
  args: readonly Expr[] | undefined,
  orderBy: FunctionCallOrder | undefined,
  filterOver: FunctionTail | undefined,
  span: Span,
): Expr {
  if (distinctness === "Distinct" && (args?.length ?? 0) !== 1) {
    state.errors.push({
      message: "DISTINCT aggregates must have exactly one argument",
      span: nameTok.span,
    })
  }
  return {
    kind: "FunctionCallExpr",
    name: mkId(nameTok),
    distinctness,
    args,
    orderBy,
    filterOver,
    span,
  }
}

export const mkFunctionCallStar = (
  nameTok: Token,
  filterOver: FunctionTail | undefined,
  span: Span,
): Expr => ({ kind: "FunctionCallStarExpr", name: mkId(nameTok), filterOver, span })

// ---- QualifiedName constructors --------------------------------------

export const qnSingle = (n: Name, span: Span): QualifiedName => ({
  kind: "QualifiedName",
  dbName: undefined,
  name: n,
  alias: undefined,
  span,
})

export const qnFull = (db: Name, n: Name, span: Span): QualifiedName => ({
  kind: "QualifiedName",
  dbName: db,
  name: n,
  alias: undefined,
  span,
})

export const qnAlias = (n: Name, a: Name, span: Span): QualifiedName => ({
  kind: "QualifiedName",
  dbName: undefined,
  name: n,
  alias: a,
  span,
})

export const qnXfull = (db: Name, n: Name, a: Name, span: Span): QualifiedName => ({
  kind: "QualifiedName",
  dbName: db,
  name: n,
  alias: a,
  span,
})

// ---- JOIN helpers ----------------------------------------------------

/** Decode `CROSS`/`NATURAL`/`LEFT`/`RIGHT`/etc. keyword into a JoinType bitmask. */
export function joinTypeFromKeyword(text: string): JoinType | undefined {
  const up = text.toUpperCase()
  switch (up) {
    case "CROSS":
      return 0x01 | 0x02 // INNER | CROSS
    case "FULL":
      return 0x08 | 0x10 | 0x20 // LEFT | RIGHT | OUTER
    case "INNER":
      return 0x01 // INNER
    case "LEFT":
      return 0x08 | 0x20 // LEFT | OUTER
    case "NATURAL":
      return 0x04 // NATURAL
    case "RIGHT":
      return 0x10 | 0x20 // RIGHT | OUTER
    case "OUTER":
      return 0x20 // OUTER
    default:
      return undefined
  }
}

/** Build a `TypedJoin` operator from a `JOIN_KW` (+ up to two modifier names). */
export function joinOperatorFrom(
  state: ParseState,
  kw: Token,
  n1: Name | undefined,
  n2: Name | undefined,
  span: Span,
): JoinOperator {
  let jt = joinTypeFromKeyword(kw.text)
  if (jt === undefined) {
    state.errors.push({
      message: `unknown join type: ${kw.text}`,
      span: kw.span,
    })
    return { kind: "TypedJoinJoinOperator", joinType: undefined, span }
  }
  for (const n of [n1, n2]) {
    if (n === undefined) continue
    const extra = joinTypeFromKeyword(n.name)
    if (extra === undefined) {
      state.errors.push({ message: `unknown join type: ${n.name}`, span: n.span })
      continue
    }
    jt |= extra
  }
  const INNER = 0x01
  const LEFT = 0x08
  const RIGHT = 0x10
  const OUTER = 0x20
  if ((jt & (INNER | OUTER)) === (INNER | OUTER) || (jt & (OUTER | LEFT | RIGHT)) === OUTER) {
    state.errors.push({
      message: `unknown join type: ${kw.text} ${n1?.name ?? ""} ${n2?.name ?? ""}`.trimEnd(),
      span: kw.span,
    })
  }
  return { kind: "TypedJoinJoinOperator", joinType: jt, span }
}

// ---- FROM-clause accumulation ----------------------------------------

/** Transient mutable form of `JoinedSelectTable` used during reduction. */
export interface JoinedSelectTableMut {
  operator: JoinOperator
  table: SelectTable
  constraint: JoinConstraint | undefined
}

/** Transient mutable form of `FromClause` used during `seltablist` reduction. */
export interface FromClauseMut {
  select: SelectTable | undefined
  joins: JoinedSelectTableMut[]
  pendingOp: JoinOperator | undefined
}

export const emptyFromClause = (): FromClauseMut => ({
  select: undefined,
  joins: [],
  pendingOp: undefined,
})

/** Freeze a {@link FromClauseMut} into an immutable {@link FromClause}. */
export function freezeFrom(m: FromClauseMut, span: Span): FromClause {
  return {
    kind: "FromClause",
    select: m.select,
    joins:
      m.joins.length > 0
        ? m.joins.map((j) => ({
            kind: "JoinedSelectTable",
            operator: j.operator,
            table: j.table,
            constraint: j.constraint,
            span: j.operator.span,
          }))
        : undefined,
    span,
  }
}

/**
 * Append a table to a FROM clause: the first entry becomes `select`;
 * subsequent entries become `joins`, consuming the pending join
 * operator pushed by the preceding `stl_prefix ::= … joinop` rule.
 */
export function fromClausePush(
  state: ParseState,
  from: FromClauseMut,
  table: SelectTable,
  jc: JoinConstraint | undefined,
): void {
  const op = from.pendingOp
  from.pendingOp = undefined
  if (op) {
    const isNatural =
      op.kind === "TypedJoinJoinOperator" && op.joinType !== undefined && (op.joinType & 0x04) !== 0
    if (isNatural && jc) {
      state.errors.push({
        message: "a NATURAL join may not have an ON or USING clause",
        span: jc.span,
      })
    }
    from.joins.push({ operator: op, table, constraint: jc })
  } else {
    if (jc) {
      state.errors.push({
        message: "a JOIN clause is required before ON",
        span: jc.span,
      })
    }
    from.select = table
  }
}

// ---- SELECT / VALUES helpers -----------------------------------------

export function mkSelect(
  withClause: With | undefined,
  body: SelectBody,
  orderBy: readonly SortedColumn[] | undefined,
  limit: Limit | undefined,
  span: Span,
): Select {
  return { with: withClause, body, orderBy, limit, kind: "Select", span }
}

export function pushCompound(body: SelectBody, cs: CompoundSelect): void {
  const mut = body as {
    select: OneSelect
    compounds: CompoundSelect[] | undefined
  }
  if (mut.compounds) mut.compounds.push(cs)
  else mut.compounds = [cs]
}

export function mkOneSelect(
  state: ParseState,
  distinctness: Distinctness | undefined,
  columns: readonly ResultColumn[],
  from: FromClause | undefined,
  whereClause: Expr | undefined,
  groupBy: readonly Expr[] | undefined,
  having: Expr | undefined,
  windowClause: readonly WindowDef[] | undefined,
  span: Span,
): OneSelect {
  const offendingStar =
    from === undefined
      ? columns.find((c) => c.kind === "StarResultColumn" || c.kind === "TableStarResultColumn")
      : undefined
  if (offendingStar) {
    state.errors.push({ message: "no tables specified", span: offendingStar.span })
  }
  return {
    kind: "SelectOneSelect",
    distinctness,
    columns,
    from,
    whereClause,
    groupBy,
    having,
    windowClause,
    span,
  }
}

/** Append a VALUES row, checking that it has the same arity as earlier rows. */
export function valuesPush(
  state: ParseState,
  values: ValuesRow[],
  row: readonly Expr[],
  span: Span,
): void {
  const firstRow = values[0]?.values
  if (firstRow && firstRow.length !== row.length) {
    const firstRowSpan =
      firstRow.length > 0
        ? spanOver(firstRow[0]!.span, firstRow[firstRow.length - 1]!.span)
        : undefined
    state.errors.push(
      firstRowSpan
        ? mkDiagnostic("all VALUES must have the same number of terms", span, {
            message: `first row has ${firstRow.length} terms`,
            span: firstRowSpan,
          })
        : mkDiagnostic("all VALUES must have the same number of terms", span),
    )
  }
  values.push({ kind: "ValuesRow", values: row, span })
}

// ---- Column / constraint helpers -------------------------------------

/** Build a `ColumnDefinition` and derive its `ColFlags` from constraints. */
export function mkColumnDefinition(
  colName: Name,
  colType: Type | undefined,
  constraints: readonly NamedColumnConstraint[],
  span: Span,
): ColumnDefinition {
  let flags = 0 /* ColFlags.None */
  for (const nc of constraints) {
    const c = nc.constraint
    switch (c.kind) {
      case "CollateColumnConstraint":
        flags |= 0x0200 // HASCOLL
        break
      case "GeneratedColumnConstraint": {
        flags |= 0x0020 // VIRTUAL
        if (c.typ && c.typ.name.toUpperCase() === "STORED") flags |= 0x0040 // STORED
        break
      }
      case "PrimaryKeyColumnConstraint":
        flags |= 0x0001 | 0x0008 // PRIMKEY | UNIQUE
        break
      case "UniqueColumnConstraint":
        flags |= 0x0008 // UNIQUE
        break
      default:
        break
    }
  }
  if (colType && colType.name.length > 0) flags |= 0x0004 // HASTYPE
  return { kind: "ColumnDefinition", colName, colType, constraints, flags, span }
}

/** Append a column, rejecting duplicate names. */
export function addColumn(
  state: ParseState,
  columns: ColumnDefinition[],
  cd: ColumnDefinition,
): void {
  const duplicateOf = columns.find((c) => c.colName.name === cd.colName.name)
  if (duplicateOf) {
    state.errors.push(
      mkDuplicateDiagnostic(
        `duplicate column name: ${cd.colName.name}`,
        cd.colName.span,
        duplicateOf.colName.span,
      ),
    )
    return
  }
  columns.push(cd)
}

/** Build `ColumnsAndConstraints`, accumulating table-level flags from columns. */
export function mkColumnsAndConstraints(
  columns: readonly ColumnDefinition[],
  constraints: readonly NamedTableConstraint[] | undefined,
  extraFlags: TabFlags,
  span: Span,
): CreateTableBody {
  let flags = extraFlags
  for (const c of columns) {
    if ((c.flags & 0x0001) !== 0) flags |= 0x00000004 // HasPrimaryKey
  }
  return { kind: "ColumnsAndConstraintsCreateTableBody", columns, constraints, flags, span }
}

// ---- CTE helpers -----------------------------------------------------

/** Append a CTE, rejecting duplicate names. */
export function addCte(state: ParseState, ctes: CommonTableExpr[], cte: CommonTableExpr): void {
  const duplicateOf = ctes.find((c) => c.tblName.name === cte.tblName.name)
  if (duplicateOf) {
    state.errors.push(
      mkDuplicateDiagnostic(
        `duplicate WITH table name: ${cte.tblName.name}`,
        cte.tblName.span,
        duplicateOf.tblName.span,
      ),
    )
    return
  }
  ctes.push(cte)
}

// ---- Upsert helpers --------------------------------------------------

/** Build an `UpsertIndex`.  SQLite rejects `NULLS FIRST`/`NULLS LAST` targets. */
export function mkUpsertIndex(
  state: ParseState,
  targets: readonly SortedColumn[],
  whereClause: Expr | undefined,
  span: Span,
): UpsertIndex {
  for (const t of targets) {
    if (t.nulls) {
      state.errors.push({
        message: `unsupported use of NULLS ${t.nulls === "First" ? "FIRST" : "LAST"}`,
        span: t.span,
      })
    }
  }
  return { kind: "UpsertIndex", targets, whereClause, span }
}

// ---- Finalization ----------------------------------------------------

/**
 * Flush the pending `state.stmt` (+ `state.explain`) as a {@link Cmd} onto
 * `state.cmds`, then clear both slots for the next statement.  Called
 * from the `ecmd ::= cmdx SEMI` / `ecmd ::= explain cmdx SEMI` rule
 * actions, so the accumulator grows by one per top-level statement.
 *
 * A missing `stmt` is a no-op — it happens at `ecmd ::= SEMI` (a bare
 * statement separator with nothing before it), which reduces to `ecmd`
 * but never calls this hook.
 */
export function flushCmd(state: ParseState): void {
  const stmt = state.stmt
  if (stmt === undefined) return
  const cmd: Stmt =
    state.explain === undefined
      ? stmt
      : {
          kind: "ExplainStmt",
          queryPlan: state.explain === "QueryPlan",
          stmt,
          span: stmt.span,
        }
  state.cmds.push(cmd)
  state.stmt = undefined
  state.explain = undefined
}

/**
 * Wrap the accumulated `state.cmds` in a {@link CmdList}.  Span runs from
 * the first command's start to the last's end; empty input produces a
 * zero-length span at the beginning of the source.
 */
export function finalizeCmdList(state: ParseState): CmdList {
  const cmds = state.cmds
  const first = cmds[0]?.span
  const last = cmds[cmds.length - 1]?.span
  const span: Span =
    first !== undefined && last !== undefined
      ? {
          offset: first.offset,
          length: last.offset + last.length - first.offset,
          line: first.line,
          col: first.col,
        }
      : { offset: 0, length: 0, line: 1, col: 1 }
  return { kind: "CmdList", cmds, span }
}
