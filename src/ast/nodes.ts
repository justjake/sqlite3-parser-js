// AST node shapes for SQLite's SQL grammar.
//
// Each Rust-style enum with payload-bearing variants appears as a
// discriminated union tagged by `kind`.  Payload-free enums collapse
// to bare string-literal unions.  Each Rust-style struct appears as
// an interface.  Bitflag types are `number` aliases with a companion
// const object holding the bit masks.  `Option<T>` maps to `T | undefined`.
//
// The major unions — `Stmt`, `Expr`, `ColumnConstraint`,
// `TableConstraint`, `TriggerCmd` — expose every variant as a
// separately exported interface named `<Variant><UnionName>` (e.g.
// `AlterTableStmt`, `BetweenExpr`).  `Literal` is a named subset of
// `Expr` covering the eight literal-producing node kinds
// (`NumericLiteral`, `StringLiteral`, …).  Downstream narrowing code
// can reference a variant directly without having to restate its
// shape in a type predicate.
//
// Terminal-producing nodes (`Name`, `Id`, each `Literal` variant,
// `VariableExpr`) carry a `span: Span` back-pointer so callers
// can recover source position and the raw (pre-dequote) text of the
// covering token.  Composite nodes don't yet have spans — that's a
// separate follow-on.
//
// These types mirror the AST published by `sqlite3-parser` (the Rust
// port of SQLite's Lemon grammar).  See:
// - https://sqlite.org/syntax/sql-stmt.html
// - https://sqlite.org/lang_expr.html
// - https://sqlite.org/syntax/select-stmt.html
// - https://sqlite.org/lang_createtable.html

import type { Span } from "../tokenize.ts"

// ---------------------------------------------------------------------------
// Top-level program: a list of statements separated by `;`.
// ---------------------------------------------------------------------------

/** A series of SQL statements separated by `;`. */
export interface CmdList {
  readonly kind: "CmdList"
  readonly cmds: readonly Stmt[]
  readonly span: Span
}

// ---------------------------------------------------------------------------
// Statements.  https://sqlite.org/syntax/sql-stmt.html
// ---------------------------------------------------------------------------

/**
 * ```sql
 * ALTER TABLE t RENAME TO u
 * ```
 */
export interface AlterTableStmt {
  readonly kind: "AlterTableStmt"
  readonly tblName: QualifiedName
  readonly body: AlterTableBody
  readonly span: Span
}

/**
 * ```sql
 * ANALYZE schema.tbl
 * ```
 */
export interface AnalyzeStmt {
  readonly kind: "AnalyzeStmt"
  readonly objName: QualifiedName | undefined
  readonly span: Span
}

/**
 * ```sql
 * ATTACH DATABASE 'data.db' AS aux
 * ```
 */
export interface AttachStmt {
  readonly kind: "AttachStmt"
  readonly expr: Expr
  readonly dbName: Expr
  readonly key: Expr | undefined
  readonly span: Span
}

/**
 * ```sql
 * BEGIN DEFERRED TRANSACTION
 * ```
 */
export interface BeginStmt {
  readonly kind: "BeginStmt"
  readonly tx: TransactionType | undefined
  readonly name: Name | undefined
  readonly span: Span
}

/**
 * ```sql
 * COMMIT
 * ```
 */
export interface CommitStmt {
  readonly kind: "CommitStmt"
  readonly name: Name | undefined
  readonly span: Span
}

/**
 * ```sql
 * CREATE UNIQUE INDEX idx ON tbl (col)
 * ```
 */
export interface CreateIndexStmt {
  readonly kind: "CreateIndexStmt"
  readonly unique: boolean
  readonly ifNotExists: boolean
  readonly idxName: QualifiedName
  readonly tblName: Name
  readonly columns: readonly SortedColumn[]
  readonly whereClause: Expr | undefined
  readonly span: Span
}

/**
 * ```sql
 * CREATE TABLE tbl (col INTEGER)
 * ```
 */
export interface CreateTableStmt {
  readonly kind: "CreateTableStmt"
  readonly temporary: boolean
  readonly ifNotExists: boolean
  readonly tblName: QualifiedName
  readonly body: CreateTableBody
  readonly span: Span
}

/**
 * ```sql
 * CREATE TRIGGER tr AFTER INSERT ON tbl BEGIN SELECT 1; END
 * ```
 */
export interface CreateTriggerStmt {
  readonly kind: "CreateTriggerStmt"
  readonly temporary: boolean
  readonly ifNotExists: boolean
  readonly triggerName: QualifiedName
  readonly time: TriggerTime | undefined
  readonly event: TriggerEvent
  readonly tblName: QualifiedName
  readonly forEachRow: boolean
  readonly whenClause: Expr | undefined
  readonly commands: readonly TriggerCmd[]
  readonly span: Span
}

/**
 * ```sql
 * CREATE VIEW v AS SELECT 1
 * ```
 */
export interface CreateViewStmt {
  readonly kind: "CreateViewStmt"
  readonly temporary: boolean
  readonly ifNotExists: boolean
  readonly viewName: QualifiedName
  readonly columns: readonly IndexedColumn[] | undefined
  readonly select: Select
  readonly span: Span
}

/**
 * ```sql
 * CREATE VIRTUAL TABLE t USING fts5
 * ```
 */
export interface CreateVirtualTableStmt {
  readonly kind: "CreateVirtualTableStmt"
  readonly ifNotExists: boolean
  readonly tblName: QualifiedName
  readonly moduleName: Name
  readonly args: readonly string[] | undefined
  readonly span: Span
}

/**
 * ```sql
 * DELETE FROM tbl WHERE col = 1
 * ```
 */
export interface DeleteStmt {
  readonly kind: "DeleteStmt"
  readonly with: With | undefined
  readonly tblName: QualifiedName
  readonly indexed: Indexed | undefined
  readonly whereClause: Expr | undefined
  readonly returning: readonly ResultColumn[] | undefined
  readonly orderBy: readonly SortedColumn[] | undefined
  readonly limit: Limit | undefined
  readonly span: Span
}

/**
 * ```sql
 * DETACH DATABASE aux
 * ```
 */
export interface DetachStmt {
  readonly kind: "DetachStmt"
  readonly expr: Expr
  readonly span: Span
}

/**
 * ```sql
 * DROP INDEX idx
 * ```
 */
export interface DropIndexStmt {
  readonly kind: "DropIndexStmt"
  readonly ifExists: boolean
  readonly idxName: QualifiedName
  readonly span: Span
}

/**
 * ```sql
 * DROP TABLE tbl
 * ```
 */
export interface DropTableStmt {
  readonly kind: "DropTableStmt"
  readonly ifExists: boolean
  readonly tblName: QualifiedName
  readonly span: Span
}

/**
 * ```sql
 * DROP TRIGGER tr
 * ```
 */
export interface DropTriggerStmt {
  readonly kind: "DropTriggerStmt"
  readonly ifExists: boolean
  readonly triggerName: QualifiedName
  readonly span: Span
}

/**
 * ```sql
 * DROP VIEW v
 * ```
 */
export interface DropViewStmt {
  readonly kind: "DropViewStmt"
  readonly ifExists: boolean
  readonly viewName: QualifiedName
  readonly span: Span
}

/**
 * `EXPLAIN` / `EXPLAIN QUERY PLAN` prefix around a statement.
 *
 * ```sql
 * EXPLAIN SELECT 1
 * EXPLAIN QUERY PLAN SELECT 1
 * ```
 */
export interface ExplainStmt {
  readonly kind: "ExplainStmt"
  readonly queryPlan: boolean
  readonly stmt: Stmt
  readonly span: Span
}

/**
 * ```sql
 * INSERT INTO tbl VALUES (1, 2)
 * ```
 */
export interface InsertStmt {
  readonly kind: "InsertStmt"
  readonly with: With | undefined
  readonly orConflict: ResolveType | undefined
  readonly tblName: QualifiedName
  readonly columns: DistinctNames | undefined
  readonly body: InsertBody
  readonly returning: readonly ResultColumn[] | undefined
  readonly span: Span
}

/**
 * ```sql
 * PRAGMA journal_mode = WAL
 * ```
 */
export interface PragmaStmt {
  readonly kind: "PragmaStmt"
  readonly name: QualifiedName
  readonly body: PragmaBody | undefined
  readonly span: Span
}

/**
 * ```sql
 * REINDEX tbl
 * ```
 */
export interface ReindexStmt {
  readonly kind: "ReindexStmt"
  readonly objName: QualifiedName | undefined
  readonly span: Span
}

/**
 * ```sql
 * RELEASE SAVEPOINT s
 * ```
 */
export interface ReleaseStmt {
  readonly kind: "ReleaseStmt"
  readonly name: Name
  readonly span: Span
}

/**
 * ```sql
 * ROLLBACK TO SAVEPOINT s
 * ```
 */
export interface RollbackStmt {
  readonly kind: "RollbackStmt"
  readonly txName: Name | undefined
  readonly savepointName: Name | undefined
  readonly span: Span
}

/**
 * ```sql
 * SAVEPOINT s
 * ```
 */
export interface SavepointStmt {
  readonly kind: "SavepointStmt"
  readonly name: Name
  readonly span: Span
}

/**
 * A `SELECT` appearing at top-level statement position.  Purely a
 * positional marker — all structural content lives on the inner
 * {@link Select} node.  Inline uses of `SELECT` (subqueries, CTEs,
 * `CREATE VIEW`, `INSERT … SELECT`, etc.) reference `Select` directly
 * and never go through `SelectStmt`, so the `Stmt` union stays
 * disjoint from `Select`'s inline roles.  Analogous to ESTree's
 * `ExpressionStatement`.
 *
 * ```sql
 * SELECT * FROM tbl
 * ```
 */
export interface SelectStmt {
  readonly kind: "SelectStmt"
  readonly select: Select
  readonly span: Span
}

/**
 * ```sql
 * UPDATE tbl SET col = 1 WHERE id = 2
 * ```
 */
export interface UpdateStmt {
  readonly kind: "UpdateStmt"
  readonly with: With | undefined
  readonly orConflict: ResolveType | undefined
  readonly tblName: QualifiedName
  readonly indexed: Indexed | undefined
  readonly sets: readonly SetAssignment[]
  readonly from: FromClause | undefined
  readonly whereClause: Expr | undefined
  readonly returning: readonly ResultColumn[] | undefined
  readonly orderBy: readonly SortedColumn[] | undefined
  readonly limit: Limit | undefined
  readonly span: Span
}

/**
 * ```sql
 * VACUUM main INTO 'out.db'
 * ```
 */
export interface VacuumStmt {
  readonly kind: "VacuumStmt"
  readonly name: Name | undefined
  readonly into: Expr | undefined
  readonly span: Span
}

/**
 * A parsed SQL statement.
 * https://sqlite.org/syntax/sql-stmt.html
 */
export type Stmt =
  | AlterTableStmt
  | AnalyzeStmt
  | AttachStmt
  | BeginStmt
  | CommitStmt
  | CreateIndexStmt
  | CreateTableStmt
  | CreateTriggerStmt
  | CreateViewStmt
  | CreateVirtualTableStmt
  | DeleteStmt
  | DetachStmt
  | DropIndexStmt
  | DropTableStmt
  | DropTriggerStmt
  | DropViewStmt
  | ExplainStmt
  | InsertStmt
  | PragmaStmt
  | ReindexStmt
  | ReleaseStmt
  | RollbackStmt
  | SavepointStmt
  | SelectStmt
  | UpdateStmt
  | VacuumStmt

// ---------------------------------------------------------------------------
// Expressions.  https://sqlite.org/lang_expr.html
// ---------------------------------------------------------------------------

/**
 * ```sql
 * SELECT * FROM t WHERE x BETWEEN 1 AND 10
 *                       ^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface BetweenExpr {
  readonly kind: "BetweenExpr"
  readonly lhs: Expr
  readonly not: boolean
  readonly start: Expr
  readonly end: Expr
  readonly span: Span
}

/**
 * ```sql
 * SELECT a + b FROM t
 *        ^^^^^
 * ```
 */
export interface BinaryExpr {
  readonly kind: "BinaryExpr"
  readonly left: Expr
  readonly op: Operator
  readonly right: Expr
  readonly span: Span
}

/**
 * ```sql
 * SELECT CASE x WHEN 1 THEN 'a' ELSE 'b' END FROM t
 *        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface CaseExpr {
  readonly kind: "CaseExpr"
  readonly base: Expr | undefined
  readonly whenThenPairs: readonly WhenThen[]
  readonly elseExpr: Expr | undefined
  readonly span: Span
}

/**
 * ```sql
 * SELECT CASE x WHEN 1 THEN 'a' WHEN 2 THEN 'b' END FROM t
 *               ^^^^^^^^^^^^^^^
 * ```
 */
export interface WhenThen {
  readonly kind: "WhenThen"
  readonly when: Expr
  readonly then: Expr
  readonly span: Span
}

/**
 * ```sql
 * SELECT CAST(x AS INTEGER) FROM t
 *        ^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface CastExpr {
  readonly kind: "CastExpr"
  readonly expr: Expr
  readonly typeName: Type | undefined
  readonly span: Span
}

/**
 * ```sql
 * SELECT x COLLATE NOCASE FROM t
 *        ^^^^^^^^^^^^^^^^
 * ```
 */
export interface CollateExpr {
  readonly kind: "CollateExpr"
  readonly expr: Expr
  readonly collation: string
  readonly span: Span
}

/**
 * ```sql
 * SELECT EXISTS (SELECT 1 FROM t)
 *        ^^^^^^^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface ExistsExpr {
  readonly kind: "ExistsExpr"
  readonly select: Select
  readonly span: Span
}

/**
 * ```sql
 * SELECT sum(DISTINCT x) FROM t
 *        ^^^^^^^^^^^^^^^
 * ```
 */
export interface FunctionCallExpr {
  readonly kind: "FunctionCallExpr"
  readonly name: Id
  readonly distinctness: Distinctness | undefined
  readonly args: readonly Expr[] | undefined
  readonly orderBy: FunctionCallOrder | undefined
  readonly filterOver: FunctionTail | undefined
  readonly span: Span
}

/**
 * ```sql
 * SELECT count(*) FROM t
 *        ^^^^^^^^
 * ```
 */
export interface FunctionCallStarExpr {
  readonly kind: "FunctionCallStarExpr"
  readonly name: Id
  readonly filterOver: FunctionTail | undefined
  readonly span: Span
}

/**
 * ```sql
 * SELECT * FROM t WHERE x IN (1, 2, 3)
 *                       ^^^^^^^^^^^^^^
 * ```
 */
export interface InListExpr {
  readonly kind: "InListExpr"
  readonly lhs: Expr
  readonly not: boolean
  readonly rhs: readonly Expr[] | undefined
  readonly span: Span
}

/**
 * ```sql
 * SELECT * FROM t WHERE x IN (SELECT id FROM s)
 *                       ^^^^^^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface InSelectExpr {
  readonly kind: "InSelectExpr"
  readonly lhs: Expr
  readonly not: boolean
  readonly rhs: Select
  readonly span: Span
}

/**
 * ```sql
 * SELECT * FROM t WHERE x IN tbl
 *                       ^^^^^^^^
 * ```
 */
export interface InTableExpr {
  readonly kind: "InTableExpr"
  readonly lhs: Expr
  readonly not: boolean
  readonly rhs: QualifiedName
  readonly args: readonly Expr[] | undefined
  readonly span: Span
}

/**
 * ```sql
 * SELECT * FROM t WHERE x ISNULL
 *                       ^^^^^^^^
 * ```
 */
export interface IsNullExpr {
  readonly kind: "IsNullExpr"
  readonly expr: Expr
  readonly span: Span
}

/**
 * ```sql
 * SELECT * FROM t WHERE name LIKE 'foo%' ESCAPE '\\'
 *                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface LikeExpr {
  readonly kind: "LikeExpr"
  readonly lhs: Expr
  readonly not: boolean
  readonly op: LikeOperator
  readonly rhs: Expr
  readonly escape: Expr | undefined
  readonly span: Span
}

/**
 * ```sql
 * PRAGMA cache_size = DEFAULT_SIZE
 *                     ^^^^^^^^^^^^
 * ```
 */
export interface NameExpr {
  readonly kind: "NameExpr"
  readonly name: Name
  readonly span: Span
}

/**
 * ```sql
 * SELECT * FROM t WHERE x NOTNULL
 *                       ^^^^^^^^^
 * ```
 */
export interface NotNullExpr {
  readonly kind: "NotNullExpr"
  readonly expr: Expr
  readonly span: Span
}

/**
 * ```sql
 * SELECT (1, 2, 3) FROM t
 *        ^^^^^^^^^
 * ```
 */
export interface ParenthesizedExpr {
  readonly kind: "ParenthesizedExpr"
  readonly exprs: readonly Expr[]
  readonly span: Span
}

/**
 * ```sql
 * SELECT tbl.col FROM tbl
 *        ^^^^^^^
 * SELECT main.tbl.col FROM main.tbl
 *        ^^^^^^^^^^^^
 * ```
 *
 * `schema` is populated only for the three-part `schema.table.column`
 * form; the two-part `table.column` form leaves it `undefined`.
 */
export interface QualifiedExpr {
  readonly kind: "QualifiedExpr"
  readonly schema: Name | undefined
  readonly table: Name
  readonly column: Name
  readonly span: Span
}

/**
 * ```sql
 * CREATE TRIGGER tr BEFORE INSERT ON t BEGIN SELECT RAISE(ABORT, 'nope'); END
 *                                                   ^^^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface RaiseExpr {
  readonly kind: "RaiseExpr"
  readonly resolve: ResolveType
  readonly message: Expr | undefined
  readonly span: Span
}

/**
 * ```sql
 * SELECT (SELECT 1)
 *        ^^^^^^^^^^
 * ```
 */
export interface SubqueryExpr {
  readonly kind: "SubqueryExpr"
  readonly select: Select
  readonly span: Span
}

/**
 * ```sql
 * SELECT -x FROM t
 *        ^^
 * ```
 */
export interface UnaryExpr {
  readonly kind: "UnaryExpr"
  readonly op: UnaryOperator
  readonly expr: Expr
  readonly span: Span
}

/**
 * ```sql
 * SELECT * FROM t WHERE id = ?1
 *                            ^^
 * ```
 */
export interface VariableExpr {
  readonly kind: "VariableExpr"
  readonly name: string
  readonly span: Span
}

/**
 * SQL expression.
 * https://sqlite.org/lang_expr.html
 */
export type Expr =
  | BetweenExpr
  | BinaryExpr
  | CaseExpr
  | CastExpr
  | CollateExpr
  | ExistsExpr
  | FunctionCallExpr
  | FunctionCallStarExpr
  | Id
  | InListExpr
  | InSelectExpr
  | InTableExpr
  | IsNullExpr
  | LikeExpr
  | Literal
  | NameExpr
  | NotNullExpr
  | ParenthesizedExpr
  | QualifiedExpr
  | RaiseExpr
  | SubqueryExpr
  | UnaryExpr
  | VariableExpr

/** `ORDER BY ...` or `WITHIN GROUP (ORDER BY expr)` after a function call's args. */
export type FunctionCallOrder = SortListFunctionCallOrder | WithinGroupFunctionCallOrder

// ---------------------------------------------------------------------------
// Literals.
// ---------------------------------------------------------------------------

/**
 * ```sql
 * SELECT 42
 *        ^^
 * ```
 */
export interface NumericLiteral {
  readonly kind: "NumericLiteral"
  readonly value: string
  readonly span: Span
}

/**
 * ```sql
 * SELECT 'hello'
 *        ^^^^^^^
 * ```
 */
export interface StringLiteral {
  readonly kind: "StringLiteral"
  readonly value: string
  readonly span: Span
}

/**
 * ```sql
 * SELECT x'FF00'
 *        ^^^^^^^
 * ```
 */
export interface BlobLiteral {
  readonly kind: "BlobLiteral"
  readonly bytes: Uint8Array
  readonly span: Span
}

/**
 * ```sql
 * PRAGMA foreign_keys = ON
 *                       ^^
 * ```
 */
export interface KeywordLiteral {
  readonly kind: "KeywordLiteral"
  readonly value: string
  readonly span: Span
}

/**
 * ```sql
 * SELECT NULL
 *        ^^^^
 * ```
 */
export interface NullLiteral {
  readonly kind: "NullLiteral"
  readonly span: Span
}

/**
 * ```sql
 * SELECT CURRENT_DATE
 *        ^^^^^^^^^^^^
 * ```
 */
export interface CurrentDateLiteral {
  readonly kind: "CurrentDateLiteral"
  readonly span: Span
}

/**
 * ```sql
 * SELECT CURRENT_TIME
 *        ^^^^^^^^^^^^
 * ```
 */
export interface CurrentTimeLiteral {
  readonly kind: "CurrentTimeLiteral"
  readonly span: Span
}

/**
 * ```sql
 * SELECT CURRENT_TIMESTAMP
 *        ^^^^^^^^^^^^^^^^^
 * ```
 */
export interface CurrentTimestampLiteral {
  readonly kind: "CurrentTimestampLiteral"
  readonly span: Span
}

/**
 * SQL literal value.  Literals are themselves expressions — `Literal`
 * is a `Expr` subset grouping the eight literal-producing node kinds.
 * Text-form literals are stored dequoted: the parser strips the outer
 * `'…'` delimiters from strings, collapses `''` pairs to `'`, and
 * decodes `x'…'` blobs into raw bytes.  Every variant carries a
 * `span: Span` back-pointer to the source token.
 */
export type Literal =
  | NumericLiteral
  | StringLiteral
  | BlobLiteral
  | KeywordLiteral
  | NullLiteral
  | CurrentDateLiteral
  | CurrentTimeLiteral
  | CurrentTimestampLiteral

/** Textual comparison operator: `LIKE`, `GLOB`, `MATCH`, `REGEXP`. */
export type LikeOperator = "Glob" | "Like" | "Match" | "Regexp"

/** Binary operator.  See `TK_*` tokens in `parse.y`. */
export type Operator =
  | "Add"
  | "And"
  | "ArrowRight"
  | "ArrowRightShift"
  | "BitwiseAnd"
  | "BitwiseOr"
  | "Concat"
  | "Equals"
  | "Divide"
  | "Greater"
  | "GreaterEquals"
  | "Is"
  | "IsNot"
  | "LeftShift"
  | "Less"
  | "LessEquals"
  | "Modulus"
  | "Multiply"
  | "NotEquals"
  | "Or"
  | "RightShift"
  | "Subtract"

/** Unary operator. */
export type UnaryOperator = "BitwiseNot" | "Negative" | "Not" | "Positive"

// ---------------------------------------------------------------------------
// SELECT statement.
// ---------------------------------------------------------------------------

/**
 * `SELECT` statement.  Holds both the compound structure — primary
 * arm (`select`) plus any `UNION` / `EXCEPT` / ... continuations in
 * `compounds` — and the "outer envelope" clauses (`WITH`, `ORDER BY`,
 * `LIMIT`) that apply to the whole compound result.  Per-arm clauses
 * (`WHERE`, `GROUP BY`, `HAVING`, etc.) live on `OneSelect`.
 *
 * https://sqlite.org/lang_select.html
 */
export interface Select {
  readonly kind: "Select"
  readonly with: With | undefined
  readonly select: OneSelect
  readonly compounds: readonly CompoundSelect[] | undefined
  readonly orderBy: readonly SortedColumn[] | undefined
  readonly limit: Limit | undefined
  readonly span: Span
}

/** One compound arm (`UNION`/`EXCEPT`/etc.) trailing the primary SELECT. */
export interface CompoundSelect {
  readonly kind: "CompoundSelect"
  readonly operator: CompoundOperator
  readonly select: OneSelect
  readonly span: Span
}

/** Compound operator. https://sqlite.org/syntax/compound-operator.html */
export type CompoundOperator = "Union" | "UnionAll" | "Except" | "Intersect"

/**
 * `SELECT` core: either a `SELECT` with clauses or a `VALUES` row set.
 * https://sqlite.org/syntax/select-core.html
 */
export type OneSelect = SelectOneSelect | ValuesOneSelect

/**
 * `FROM` clause.  The first source and any `JOIN`-chained sources.
 * https://sqlite.org/syntax/join-clause.html
 */
export interface FromClause {
  readonly kind: "FromClause"
  readonly select: SelectTable | undefined
  readonly joins: readonly JoinedSelectTable[] | undefined
  readonly span: Span
}

/** `SELECT` distinctness. */
export type Distinctness = "Distinct" | "All"

/**
 * `SELECT` result column.
 * https://sqlite.org/syntax/result-column.html
 */
export type ResultColumn = ExprResultColumn | StarResultColumn | TableStarResultColumn

/** Alias introduced by `AS` (or elided). */
export type As = AsAs | ElidedAs

/** One `JOIN`ed source in a `FROM` clause. */
export interface JoinedSelectTable {
  readonly kind: "JoinedSelectTable"
  readonly operator: JoinOperator
  readonly table: SelectTable
  readonly constraint: JoinConstraint | undefined
  readonly span: Span
}

/**
 * Table or subquery in a `FROM` clause.
 * https://sqlite.org/syntax/table-or-subquery.html
 */
export type SelectTable =
  | TableSelectTable
  | TableCallSelectTable
  | SelectSelectTable
  | SubSelectTable

/**
 * Join operator.
 * https://sqlite.org/syntax/join-operator.html
 */
export type JoinOperator = CommaJoinOperator | TypedJoinJoinOperator

/**
 * JOIN type flags.  Mirrors `SrcItem.fg.jointype` in SQLite.
 * Bits are combined via bitwise OR.
 */
export type JoinType = number

export const JoinType = {
  /** `INNER` */
  INNER: 0x01,
  /** `CROSS` — stored as INNER|CROSS. */
  CROSS: 0x02,
  /** `NATURAL` */
  NATURAL: 0x04,
  /** `LEFT` — stored as LEFT|OUTER. */
  LEFT: 0x08,
  /** `RIGHT` — stored as RIGHT|OUTER. */
  RIGHT: 0x10,
  /** `OUTER` */
  OUTER: 0x20,
} as const

/** `JOIN` constraint: `ON expr` or `USING (cols)`. */
export type JoinConstraint = OnJoinConstraint | UsingJoinConstraint

// ---------------------------------------------------------------------------
// Identifiers.
// ---------------------------------------------------------------------------

/**
 * Bare identifier.  Stored dequoted: the parser strips any outer
 * `"…"`, `[…]`, or `` `…` `` delimiters via `sqlite3Dequote` before
 * constructing the node, mirroring SQLite's `sqlite3NameFromToken`.
 * The `span` field carries source provenance (type/start/length/line/col)
 * and lets callers recover the original pre-dequote text from the
 * underlying source buffer.
 */
export interface Id {
  readonly kind: "Id"
  readonly name: string
  readonly span: Span
}

/**
 * Object/column name.  Stored dequoted (see {@link Id}).  Name equality
 * in SQLite is case-insensitive and quote-insensitive; the dequoting
 * step handles the quote dimension, leaving only ASCII-insensitive
 * comparison for callers that need it.
 */
export interface Name {
  readonly kind: "Name"
  readonly name: string
  readonly span: Span
}

/**
 * Qualified SQL name: optional schema, object, optional alias.
 * Different grammar productions populate different subsets of these fields:
 * `fullname` uses `{dbName?, name}`, `xfullname` additionally allows an alias.
 */
export interface QualifiedName {
  readonly kind: "QualifiedName"
  readonly dbName: Name | undefined
  readonly name: Name
  readonly alias: Name | undefined
  readonly span: Span
}

/** Ordered, distinct column/identifier list.  Callers must enforce uniqueness. */
export type DistinctNames = readonly Name[]

// ---------------------------------------------------------------------------
// ALTER TABLE.
// ---------------------------------------------------------------------------

/**
 * `ALTER TABLE` body.
 * https://sqlite.org/lang_altertable.html
 */
export type AlterTableBody =
  | RenameToAlterTableBody
  | AddColumnAlterTableBody
  | DropColumnNotNullAlterTableBody
  | SetColumnNotNullAlterTableBody
  | RenameColumnAlterTableBody
  | DropColumnAlterTableBody
  | AddConstraintAlterTableBody
  | DropConstraintAlterTableBody

/**
 * `CREATE TABLE` flags bitmask.
 * Stored with the table body; bits are combined via bitwise OR.
 */
export type TabFlags = number

export const TabFlags = {
  None: 0,
  /** Has one or more hidden columns. */
  HasHidden: 0x00000002,
  /** Table has a primary key. */
  HasPrimaryKey: 0x00000004,
  /** Integer primary key is autoincrement. */
  Autoincrement: 0x00000008,
  /** Has one or more VIRTUAL columns. */
  HasVirtual: 0x00000020,
  /** Has one or more STORED columns. */
  HasStored: 0x00000040,
  /** HasVirtual | HasStored. */
  HasGenerated: 0x00000060,
  /** `WITHOUT ROWID`. */
  WithoutRowid: 0x00000080,
  /** Contains NOT NULL constraints. */
  HasNotNull: 0x00000800,
  /** `STRICT` table option. */
  Strict: 0x00010000,
} as const

// ---------------------------------------------------------------------------
// CREATE TABLE.
// ---------------------------------------------------------------------------

/**
 * `CREATE TABLE` body: explicit columns/constraints, or `AS SELECT`.
 * https://sqlite.org/lang_createtable.html
 */
export type CreateTableBody = ColumnsAndConstraintsCreateTableBody | AsSelectCreateTableBody

/** Column definition bit-flags. */
export type ColFlags = number

export const ColFlags = {
  None: 0,
  /** Column is part of the primary key. */
  PRIMKEY: 0x0001,
  /** Type name follows the column name. */
  HASTYPE: 0x0004,
  /** Column definition contains UNIQUE or PRIMARY KEY. */
  UNIQUE: 0x0008,
  /** `GENERATED ALWAYS AS ... VIRTUAL` (also set while still unknown). */
  VIRTUAL: 0x0020,
  /** `GENERATED ALWAYS AS ... STORED`. */
  STORED: 0x0040,
  /** Has a `COLLATE` clause. */
  HASCOLL: 0x0200,
  /** STORED | VIRTUAL. */
  GENERATED: 0x0060,
} as const

/**
 * One column in a `CREATE TABLE`.
 * https://sqlite.org/syntax/column-def.html
 */
export interface ColumnDefinition {
  readonly kind: "ColumnDefinition"
  readonly colName: Name
  readonly colType: Type | undefined
  readonly constraints: readonly NamedColumnConstraint[]
  readonly flags: ColFlags
  readonly span: Span
}

/** Column-level constraint with optional name. */
export interface NamedColumnConstraint {
  readonly kind: "NamedColumnConstraint"
  readonly name: Name | undefined
  readonly constraint: ColumnConstraint
  readonly span: Span
}

// ---------------------------------------------------------------------------
// Column constraints.  https://sqlite.org/syntax/column-constraint.html
// ---------------------------------------------------------------------------

/**
 * ```sql
 * CREATE TABLE t (id INTEGER PRIMARY KEY ASC AUTOINCREMENT)
 *                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface PrimaryKeyColumnConstraint {
  readonly kind: "PrimaryKeyColumnConstraint"
  readonly order: SortOrder | undefined
  readonly conflictClause: ResolveType | undefined
  readonly autoIncrement: boolean
  readonly span: Span
}

/**
 * ```sql
 * CREATE TABLE t (col INTEGER NOT NULL)
 *                             ^^^^^^^^
 * ```
 */
export interface NotNullColumnConstraint {
  readonly kind: "NotNullColumnConstraint"
  readonly nullable: boolean
  readonly conflictClause: ResolveType | undefined
  readonly span: Span
}

/**
 * ```sql
 * CREATE TABLE t (col INTEGER UNIQUE)
 *                             ^^^^^^
 * ```
 */
export interface UniqueColumnConstraint {
  readonly kind: "UniqueColumnConstraint"
  readonly conflictClause: ResolveType | undefined
  readonly span: Span
}

/**
 * ```sql
 * CREATE TABLE t (col INTEGER CHECK (col > 0))
 *                             ^^^^^^^^^^^^^^^
 * ```
 */
export interface CheckColumnConstraint {
  readonly kind: "CheckColumnConstraint"
  readonly expr: Expr
  readonly span: Span
}

/**
 * ```sql
 * CREATE TABLE t (col INTEGER DEFAULT 0)
 *                             ^^^^^^^^^
 * ```
 */
export interface DefaultColumnConstraint {
  readonly kind: "DefaultColumnConstraint"
  readonly expr: Expr
  readonly span: Span
}

/**
 * ```sql
 * CREATE TABLE t (col INTEGER DEFERRABLE INITIALLY DEFERRED)
 *                             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface DeferColumnConstraint {
  readonly kind: "DeferColumnConstraint"
  readonly clause: DeferSubclause
  readonly span: Span
}

/**
 * ```sql
 * CREATE TABLE t (col TEXT COLLATE NOCASE)
 *                          ^^^^^^^^^^^^^^
 * ```
 */
export interface CollateColumnConstraint {
  readonly kind: "CollateColumnConstraint"
  readonly collationName: Name
  readonly span: Span
}

/**
 * ```sql
 * CREATE TABLE t (col INTEGER REFERENCES other(id) ON DELETE CASCADE)
 *                             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface ForeignKeyColumnConstraint {
  readonly kind: "ForeignKeyColumnConstraint"
  readonly clause: ForeignKeyClause
  readonly deferClause: DeferSubclause | undefined
  readonly span: Span
}

/**
 * ```sql
 * CREATE TABLE t (col INTEGER GENERATED ALWAYS AS (a + b) STORED)
 *                             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface GeneratedColumnConstraint {
  readonly kind: "GeneratedColumnConstraint"
  readonly expr: Expr
  readonly typ: Id | undefined
  readonly span: Span
}

/**
 * Column-level constraint.
 * https://sqlite.org/syntax/column-constraint.html
 */
export type ColumnConstraint =
  | PrimaryKeyColumnConstraint
  | NotNullColumnConstraint
  | UniqueColumnConstraint
  | CheckColumnConstraint
  | DefaultColumnConstraint
  | DeferColumnConstraint
  | CollateColumnConstraint
  | ForeignKeyColumnConstraint
  | GeneratedColumnConstraint

/** Table-level constraint with optional name. */
export interface NamedTableConstraint {
  readonly kind: "NamedTableConstraint"
  readonly name: Name | undefined
  readonly constraint: TableConstraint
  readonly span: Span
}

// ---------------------------------------------------------------------------
// Table constraints.  https://sqlite.org/syntax/table-constraint.html
// ---------------------------------------------------------------------------

/**
 * ```sql
 * CREATE TABLE t (a INT, b INT, PRIMARY KEY (a, b))
 *                               ^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface PrimaryKeyTableConstraint {
  readonly kind: "PrimaryKeyTableConstraint"
  readonly columns: readonly SortedColumn[]
  readonly autoIncrement: boolean
  readonly conflictClause: ResolveType | undefined
  readonly span: Span
}

/**
 * ```sql
 * CREATE TABLE t (a INT, b INT, UNIQUE (a, b))
 *                               ^^^^^^^^^^^^^
 * ```
 */
export interface UniqueTableConstraint {
  readonly kind: "UniqueTableConstraint"
  readonly columns: readonly SortedColumn[]
  readonly conflictClause: ResolveType | undefined
  readonly span: Span
}

/**
 * ```sql
 * CREATE TABLE t (a INT, CHECK (a > 0))
 *                        ^^^^^^^^^^^^^
 * ```
 */
export interface CheckTableConstraint {
  readonly kind: "CheckTableConstraint"
  readonly expr: Expr
  readonly conflictClause: ResolveType | undefined
  readonly span: Span
}

/**
 * ```sql
 * CREATE TABLE t (a INT, FOREIGN KEY (a) REFERENCES other(id))
 *                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface ForeignKeyTableConstraint {
  readonly kind: "ForeignKeyTableConstraint"
  readonly columns: readonly IndexedColumn[]
  readonly clause: ForeignKeyClause
  readonly deferClause: DeferSubclause | undefined
  readonly span: Span
}

/**
 * Table-level constraint.
 * https://sqlite.org/syntax/table-constraint.html
 */
export type TableConstraint =
  | PrimaryKeyTableConstraint
  | UniqueTableConstraint
  | CheckTableConstraint
  | ForeignKeyTableConstraint

// ---------------------------------------------------------------------------
// Sort / index / limit.
// ---------------------------------------------------------------------------

/** Sort order. */
export type SortOrder = "Asc" | "Desc"

/** `NULLS FIRST` / `NULLS LAST`. */
export type NullsOrder = "First" | "Last"

/**
 * One column in an index definition.
 * https://sqlite.org/syntax/indexed-column.html
 */
export interface IndexedColumn {
  readonly kind: "IndexedColumn"
  readonly colName: Name
  readonly collationName: Name | undefined
  readonly order: SortOrder | undefined
  readonly span: Span
}

/** `INDEXED BY name` / `NOT INDEXED` on a table reference. */
export type Indexed = IndexedByIndexed | NotIndexedIndexed

/** One entry in an `ORDER BY`/`PRIMARY KEY`/`UNIQUE` column list. */
export interface SortedColumn {
  readonly kind: "SortedColumn"
  readonly expr: Expr
  readonly order: SortOrder | undefined
  readonly nulls: NullsOrder | undefined
  readonly span: Span
}

/** `LIMIT` clause, with optional `OFFSET`. */
export interface Limit {
  readonly kind: "Limit"
  readonly expr: Expr
  readonly offset: Expr | undefined
  readonly span: Span
}

// ---------------------------------------------------------------------------
// Foreign keys.
// ---------------------------------------------------------------------------

/**
 * `REFERENCES` clause.
 * https://sqlite.org/syntax/foreign-key-clause.html
 */
export interface ForeignKeyClause {
  readonly kind: "ForeignKeyClause"
  readonly tblName: Name
  readonly columns: readonly IndexedColumn[] | undefined
  readonly args: readonly RefArg[]
  readonly span: Span
}

/** One action/option inside a foreign-key clause. */
export type RefArg = OnDeleteRefArg | OnInsertRefArg | OnUpdateRefArg | MatchRefArg

/** Foreign-key referential action. */
export type RefAct = "SetNull" | "SetDefault" | "Cascade" | "Restrict" | "NoAction"

/** Foreign-key deferrability subclause. */
export interface DeferSubclause {
  readonly kind: "DeferSubclause"
  readonly deferrable: boolean
  readonly initDeferred: InitDeferredPred | undefined
  readonly span: Span
}

/** `INITIALLY DEFERRED` / `INITIALLY IMMEDIATE`. */
export type InitDeferredPred = "InitiallyDeferred" | "InitiallyImmediate"

// ---------------------------------------------------------------------------
// INSERT / UPDATE / PRAGMA support.
// ---------------------------------------------------------------------------

/**
 * `INSERT` body: a SELECT (or VALUES) with optional upsert, or DEFAULT VALUES.
 * https://sqlite.org/lang_insert.html
 */
export type InsertBody = SelectInsertBody | DefaultValuesInsertBody

/**
 * One `SET` assignment in an UPDATE statement.
 * `colNames` has length 1 for `col = expr`, >1 for `(a,b) = expr`.
 */
export interface SetAssignment {
  readonly kind: "SetAssignment"
  readonly colNames: DistinctNames
  readonly expr: Expr
  readonly span: Span
}

/** `PRAGMA` body. https://sqlite.org/syntax/pragma-stmt.html */
export type PragmaBody = EqualsPragmaBody | CallPragmaBody

/** A PRAGMA value.  Any expression is legal; typically an identifier or literal. */
export type PragmaValue = Expr

// ---------------------------------------------------------------------------
// Triggers.
// ---------------------------------------------------------------------------

/** `CREATE TRIGGER` firing time. */
export type TriggerTime = "Before" | "After" | "InsteadOf"

/** `CREATE TRIGGER` event. */
export type TriggerEvent =
  | DeleteTriggerEvent
  | InsertTriggerEvent
  | UpdateTriggerEvent
  | UpdateOfTriggerEvent

// ---------------------------------------------------------------------------
// Trigger commands.  https://sqlite.org/lang_createtrigger.html
// ---------------------------------------------------------------------------

/**
 * ```sql
 * CREATE TRIGGER tr AFTER INSERT ON t BEGIN UPDATE t SET c = 1; END
 *                                           ^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface UpdateTriggerCmd {
  readonly kind: "UpdateTriggerCmd"
  readonly orConflict: ResolveType | undefined
  readonly tblName: QualifiedName
  readonly sets: readonly SetAssignment[]
  readonly from: FromClause | undefined
  readonly whereClause: Expr | undefined
  readonly span: Span
}

/**
 * ```sql
 * CREATE TRIGGER tr AFTER INSERT ON t BEGIN INSERT INTO t VALUES (1); END
 *                                           ^^^^^^^^^^^^^^^^^^^^^^^^
 * ```
 */
export interface InsertTriggerCmd {
  readonly kind: "InsertTriggerCmd"
  readonly orConflict: ResolveType | undefined
  readonly tblName: QualifiedName
  readonly colNames: DistinctNames | undefined
  readonly select: Select
  readonly upsert: Upsert | undefined
  readonly span: Span
}

/**
 * ```sql
 * CREATE TRIGGER tr AFTER INSERT ON t BEGIN DELETE FROM t; END
 *                                           ^^^^^^^^^^^^^
 * ```
 */
export interface DeleteTriggerCmd {
  readonly kind: "DeleteTriggerCmd"
  readonly tblName: QualifiedName
  readonly whereClause: Expr | undefined
  readonly span: Span
}

/**
 * ```sql
 * CREATE TRIGGER tr AFTER INSERT ON t BEGIN SELECT 1; END
 *                                           ^^^^^^^^
 * ```
 */
export interface SelectTriggerCmd {
  readonly kind: "SelectTriggerCmd"
  readonly select: Select
  readonly span: Span
}

/**
 * One command inside a trigger body.
 * https://sqlite.org/lang_createtrigger.html
 */
export type TriggerCmd = UpdateTriggerCmd | InsertTriggerCmd | DeleteTriggerCmd | SelectTriggerCmd

// ---------------------------------------------------------------------------
// Resolve types (ON CONFLICT, OR).
// ---------------------------------------------------------------------------

/** Conflict-resolution type for `ON CONFLICT` and `INSERT OR ...`. */
export type ResolveType = "Rollback" | "Abort" | "Fail" | "Ignore" | "Replace"

// ---------------------------------------------------------------------------
// WITH / CTE.
// ---------------------------------------------------------------------------

/**
 * `WITH` prefix.
 * https://sqlite.org/lang_with.html
 */
export interface With {
  readonly kind: "With"
  readonly recursive: boolean
  readonly ctes: readonly CommonTableExpr[]
  readonly span: Span
}

/** Optional materialization hint on a CTE. */
export type Materialized = "Any" | "Yes" | "No"

/**
 * One common table expression.
 * https://sqlite.org/syntax/common-table-expression.html
 */
export interface CommonTableExpr {
  readonly kind: "CommonTableExpr"
  readonly tblName: Name
  readonly columns: readonly IndexedColumn[] | undefined
  readonly materialized: Materialized
  readonly select: Select
  readonly span: Span
}

// ---------------------------------------------------------------------------
// Type annotations.
// ---------------------------------------------------------------------------

/**
 * Column type name.
 * https://sqlite.org/syntax/type-name.html
 */
export interface Type {
  readonly kind: "Type"
  readonly name: string
  readonly size: TypeSize | undefined
  readonly span: Span
}

/** Column type size arguments. */
export type TypeSize = MaxSizeTypeSize | TypeSizeTypeSize

// ---------------------------------------------------------------------------
// Transactions.
// ---------------------------------------------------------------------------

/** `BEGIN` transaction type. */
export type TransactionType = "Deferred" | "Immediate" | "Exclusive"

// ---------------------------------------------------------------------------
// Upsert.
// ---------------------------------------------------------------------------

/**
 * Upsert clause chained after `INSERT ... VALUES` / `SELECT`.
 * https://sqlite.org/lang_upsert.html
 */
export interface Upsert {
  readonly kind: "Upsert"
  readonly index: UpsertIndex | undefined
  readonly doClause: UpsertDo
  readonly next: Upsert | undefined
  readonly span: Span
}

/** Conflict targets on an upsert. */
export interface UpsertIndex {
  readonly kind: "UpsertIndex"
  readonly targets: readonly SortedColumn[]
  readonly whereClause: Expr | undefined
  readonly span: Span
}

/** `DO UPDATE SET ... [WHERE ...]` or `DO NOTHING`. */
export type UpsertDo = SetUpsertDo | NothingUpsertDo

// ---------------------------------------------------------------------------
// Window functions.
// ---------------------------------------------------------------------------

/** `FILTER` and/or `OVER` trailing a function call. */
export interface FunctionTail {
  readonly kind: "FunctionTail"
  readonly filterClause: Expr | undefined
  readonly overClause: Over | undefined
  readonly span: Span
}

/** `OVER (...)` or `OVER name`. */
export type Over = WindowOver | NameOver

/** One named window in a `WINDOW` clause. */
export interface WindowDef {
  readonly kind: "WindowDef"
  readonly name: Name
  readonly window: Window
  readonly span: Span
}

/**
 * Window definition body.
 * https://sqlite.org/syntax/window-defn.html
 */
export interface Window {
  readonly kind: "Window"
  readonly base: Name | undefined
  readonly partitionBy: readonly Expr[] | undefined
  readonly orderBy: readonly SortedColumn[] | undefined
  readonly frameClause: FrameClause | undefined
  readonly span: Span
}

/**
 * `ROWS`/`RANGE`/`GROUPS` frame specification.
 * https://sqlite.org/syntax/frame-spec.html
 */
export interface FrameClause {
  readonly kind: "FrameClause"
  readonly mode: FrameMode
  readonly start: FrameBound
  readonly end: FrameBound | undefined
  readonly exclude: FrameExclude | undefined
  readonly span: Span
}

/** Frame mode. */
export type FrameMode = "Groups" | "Range" | "Rows"

/** One side of a window frame. */
export type FrameBound =
  | CurrentRowFrameBound
  | FollowingFrameBound
  | PrecedingFrameBound
  | UnboundedFollowingFrameBound
  | UnboundedPrecedingFrameBound

/** `EXCLUDE` option on a frame. */
export type FrameExclude = "NoOthers" | "CurrentRow" | "Group" | "Ties"

// ---- Inline union variant interfaces (generated) ----

export interface SortListFunctionCallOrder {
  readonly kind: "SortListFunctionCallOrder"
  readonly columns: readonly SortedColumn[]
  readonly span: Span
}

export interface WithinGroupFunctionCallOrder {
  readonly kind: "WithinGroupFunctionCallOrder"
  readonly expr: Expr
  readonly span: Span
}

export interface SelectOneSelect {
  readonly kind: "SelectOneSelect"
  readonly distinctness: Distinctness | undefined
  readonly columns: readonly ResultColumn[]
  readonly from: FromClause | undefined
  readonly whereClause: Expr | undefined
  readonly groupBy: readonly Expr[] | undefined
  readonly having: Expr | undefined
  readonly windowClause: readonly WindowDef[] | undefined
  readonly span: Span
}

export interface ValuesOneSelect {
  readonly kind: "ValuesOneSelect"
  readonly values: readonly ValuesRow[]
  readonly span: Span
}

/**
 * ```sql
 * VALUES (1, 2), (3, 4)
 *        ^^^^^^
 * ```
 */
export interface ValuesRow {
  readonly kind: "ValuesRow"
  readonly values: readonly Expr[]
  readonly span: Span
}

export interface ExprResultColumn {
  readonly kind: "ExprResultColumn"
  readonly expr: Expr
  readonly alias: As | undefined
  readonly span: Span
}

export interface StarResultColumn {
  readonly kind: "StarResultColumn"
  readonly span: Span
}

export interface TableStarResultColumn {
  readonly kind: "TableStarResultColumn"
  readonly table: Name
  readonly span: Span
}

export interface AsAs {
  readonly kind: "AsAs"
  readonly name: Name
  readonly span: Span
}

export interface ElidedAs {
  readonly kind: "ElidedAs"
  readonly name: Name
  readonly span: Span
}

export interface TableSelectTable {
  readonly kind: "TableSelectTable"
  readonly name: QualifiedName
  readonly alias: As | undefined
  readonly indexed: Indexed | undefined
  readonly span: Span
}

export interface TableCallSelectTable {
  readonly kind: "TableCallSelectTable"
  readonly name: QualifiedName
  readonly args: readonly Expr[] | undefined
  readonly alias: As | undefined
  readonly span: Span
}

export interface SelectSelectTable {
  readonly kind: "SelectSelectTable"
  readonly select: Select
  readonly alias: As | undefined
  readonly span: Span
}

export interface SubSelectTable {
  readonly kind: "SubSelectTable"
  readonly from: FromClause
  readonly alias: As | undefined
  readonly span: Span
}

export interface CommaJoinOperator {
  readonly kind: "CommaJoinOperator"
  readonly span: Span
}

export interface TypedJoinJoinOperator {
  readonly kind: "TypedJoinJoinOperator"
  readonly joinType: JoinType | undefined
  readonly span: Span
}

export interface OnJoinConstraint {
  readonly kind: "OnJoinConstraint"
  readonly expr: Expr
  readonly span: Span
}

export interface UsingJoinConstraint {
  readonly kind: "UsingJoinConstraint"
  readonly columns: DistinctNames
  readonly span: Span
}

export interface RenameToAlterTableBody {
  readonly kind: "RenameToAlterTableBody"
  readonly name: Name
  readonly span: Span
}

export interface AddColumnAlterTableBody {
  readonly kind: "AddColumnAlterTableBody"
  readonly column: ColumnDefinition
  readonly span: Span
}

export interface DropColumnNotNullAlterTableBody {
  readonly kind: "DropColumnNotNullAlterTableBody"
  readonly column: Name
  readonly span: Span
}

export interface SetColumnNotNullAlterTableBody {
  readonly kind: "SetColumnNotNullAlterTableBody"
  readonly column: Name
  readonly onConflict: ResolveType | undefined
  readonly span: Span
}

export interface RenameColumnAlterTableBody {
  readonly kind: "RenameColumnAlterTableBody"
  readonly old: Name
  readonly new: Name
  readonly span: Span
}

export interface DropColumnAlterTableBody {
  readonly kind: "DropColumnAlterTableBody"
  readonly column: Name
  readonly span: Span
}

export interface AddConstraintAlterTableBody {
  readonly kind: "AddConstraintAlterTableBody"
  readonly constraint: NamedTableConstraint
  readonly span: Span
}

export interface DropConstraintAlterTableBody {
  readonly kind: "DropConstraintAlterTableBody"
  readonly name: Name
  readonly span: Span
}

export interface ColumnsAndConstraintsCreateTableBody {
  readonly kind: "ColumnsAndConstraintsCreateTableBody"
  readonly columns: readonly ColumnDefinition[]
  readonly constraints: readonly NamedTableConstraint[] | undefined
  readonly flags: TabFlags
  readonly span: Span
}

export interface AsSelectCreateTableBody {
  readonly kind: "AsSelectCreateTableBody"
  readonly select: Select
  readonly span: Span
}

export interface IndexedByIndexed {
  readonly kind: "IndexedByIndexed"
  readonly name: Name
  readonly span: Span
}

export interface NotIndexedIndexed {
  readonly kind: "NotIndexedIndexed"
  readonly span: Span
}

export interface OnDeleteRefArg {
  readonly kind: "OnDeleteRefArg"
  readonly action: RefAct
  readonly span: Span
}

export interface OnInsertRefArg {
  readonly kind: "OnInsertRefArg"
  readonly action: RefAct
  readonly span: Span
}

export interface OnUpdateRefArg {
  readonly kind: "OnUpdateRefArg"
  readonly action: RefAct
  readonly span: Span
}

export interface MatchRefArg {
  readonly kind: "MatchRefArg"
  readonly name: Name
  readonly span: Span
}

export interface SelectInsertBody {
  readonly kind: "SelectInsertBody"
  readonly select: Select
  readonly upsert: Upsert | undefined
  readonly span: Span
}

export interface DefaultValuesInsertBody {
  readonly kind: "DefaultValuesInsertBody"
  readonly span: Span
}

export interface EqualsPragmaBody {
  readonly kind: "EqualsPragmaBody"
  readonly value: PragmaValue
  readonly span: Span
}

export interface CallPragmaBody {
  readonly kind: "CallPragmaBody"
  readonly value: PragmaValue
  readonly span: Span
}

export interface DeleteTriggerEvent {
  readonly kind: "DeleteTriggerEvent"
  readonly span: Span
}

export interface InsertTriggerEvent {
  readonly kind: "InsertTriggerEvent"
  readonly span: Span
}

export interface UpdateTriggerEvent {
  readonly kind: "UpdateTriggerEvent"
  readonly span: Span
}

export interface UpdateOfTriggerEvent {
  readonly kind: "UpdateOfTriggerEvent"
  readonly columns: DistinctNames
  readonly span: Span
}

export interface MaxSizeTypeSize {
  readonly kind: "MaxSizeTypeSize"
  readonly size: Expr
  readonly span: Span
}

export interface TypeSizeTypeSize {
  readonly kind: "TypeSizeTypeSize"
  readonly size1: Expr
  readonly size2: Expr
  readonly span: Span
}

export interface SetUpsertDo {
  readonly kind: "SetUpsertDo"
  readonly sets: readonly SetAssignment[]
  readonly whereClause: Expr | undefined
  readonly span: Span
}

export interface NothingUpsertDo {
  readonly kind: "NothingUpsertDo"
  readonly span: Span
}

export interface WindowOver {
  readonly kind: "WindowOver"
  readonly window: Window
  readonly span: Span
}

export interface NameOver {
  readonly kind: "NameOver"
  readonly name: Name
  readonly span: Span
}

export interface CurrentRowFrameBound {
  readonly kind: "CurrentRowFrameBound"
  readonly span: Span
}

export interface FollowingFrameBound {
  readonly kind: "FollowingFrameBound"
  readonly expr: Expr
  readonly span: Span
}

export interface PrecedingFrameBound {
  readonly kind: "PrecedingFrameBound"
  readonly expr: Expr
  readonly span: Span
}

export interface UnboundedFollowingFrameBound {
  readonly kind: "UnboundedFollowingFrameBound"
  readonly span: Span
}

export interface UnboundedPrecedingFrameBound {
  readonly kind: "UnboundedPrecedingFrameBound"
  readonly span: Span
}

// ---------------------------------------------------------------------------
// Universal node index.
//
// `AstNodeMap` maps each `kind` discriminator string to its concrete
// interface.  It is the canonical source — `AstNode` is derived from it.
// Generic tree walkers, visitors, and JSON serializers can key off
// `AstNodeMap[kind]` to recover per-kind payload types without
// restating the union by hand.
// ---------------------------------------------------------------------------

/**
 * Map of all AST node shapes, keyed by their `kind` discriminator.
 *
 * Advanced users may inject new node shapes using TypeScript declaration merging.
 */
export interface AstNodeMap {
  // Top-level
  CmdList: CmdList

  // Statements
  AlterTableStmt: AlterTableStmt
  AnalyzeStmt: AnalyzeStmt
  AttachStmt: AttachStmt
  BeginStmt: BeginStmt
  CommitStmt: CommitStmt
  CreateIndexStmt: CreateIndexStmt
  CreateTableStmt: CreateTableStmt
  CreateTriggerStmt: CreateTriggerStmt
  CreateViewStmt: CreateViewStmt
  CreateVirtualTableStmt: CreateVirtualTableStmt
  DeleteStmt: DeleteStmt
  DetachStmt: DetachStmt
  DropIndexStmt: DropIndexStmt
  DropTableStmt: DropTableStmt
  DropTriggerStmt: DropTriggerStmt
  DropViewStmt: DropViewStmt
  ExplainStmt: ExplainStmt
  InsertStmt: InsertStmt
  PragmaStmt: PragmaStmt
  ReindexStmt: ReindexStmt
  ReleaseStmt: ReleaseStmt
  RollbackStmt: RollbackStmt
  SavepointStmt: SavepointStmt
  SelectStmt: SelectStmt
  UpdateStmt: UpdateStmt
  VacuumStmt: VacuumStmt

  // Expressions
  BetweenExpr: BetweenExpr
  BinaryExpr: BinaryExpr
  CaseExpr: CaseExpr
  WhenThen: WhenThen
  CastExpr: CastExpr
  CollateExpr: CollateExpr
  ExistsExpr: ExistsExpr
  FunctionCallExpr: FunctionCallExpr
  FunctionCallStarExpr: FunctionCallStarExpr
  InListExpr: InListExpr
  InSelectExpr: InSelectExpr
  InTableExpr: InTableExpr
  IsNullExpr: IsNullExpr
  LikeExpr: LikeExpr
  NameExpr: NameExpr
  NotNullExpr: NotNullExpr
  ParenthesizedExpr: ParenthesizedExpr
  QualifiedExpr: QualifiedExpr
  RaiseExpr: RaiseExpr
  SubqueryExpr: SubqueryExpr
  UnaryExpr: UnaryExpr
  VariableExpr: VariableExpr

  // Literals
  NumericLiteral: NumericLiteral
  StringLiteral: StringLiteral
  BlobLiteral: BlobLiteral
  KeywordLiteral: KeywordLiteral
  NullLiteral: NullLiteral
  CurrentDateLiteral: CurrentDateLiteral
  CurrentTimeLiteral: CurrentTimeLiteral
  CurrentTimestampLiteral: CurrentTimestampLiteral

  // SELECT
  Select: Select
  CompoundSelect: CompoundSelect
  FromClause: FromClause
  JoinedSelectTable: JoinedSelectTable
  SelectOneSelect: SelectOneSelect
  ValuesOneSelect: ValuesOneSelect
  ValuesRow: ValuesRow
  ExprResultColumn: ExprResultColumn
  StarResultColumn: StarResultColumn
  TableStarResultColumn: TableStarResultColumn
  AsAs: AsAs
  ElidedAs: ElidedAs
  TableSelectTable: TableSelectTable
  TableCallSelectTable: TableCallSelectTable
  SelectSelectTable: SelectSelectTable
  SubSelectTable: SubSelectTable
  CommaJoinOperator: CommaJoinOperator
  TypedJoinJoinOperator: TypedJoinJoinOperator
  OnJoinConstraint: OnJoinConstraint
  UsingJoinConstraint: UsingJoinConstraint
  SortListFunctionCallOrder: SortListFunctionCallOrder
  WithinGroupFunctionCallOrder: WithinGroupFunctionCallOrder

  // Identifiers
  Id: Id
  Name: Name
  QualifiedName: QualifiedName

  // CREATE TABLE — columns and constraints
  ColumnDefinition: ColumnDefinition
  NamedColumnConstraint: NamedColumnConstraint
  PrimaryKeyColumnConstraint: PrimaryKeyColumnConstraint
  NotNullColumnConstraint: NotNullColumnConstraint
  UniqueColumnConstraint: UniqueColumnConstraint
  CheckColumnConstraint: CheckColumnConstraint
  DefaultColumnConstraint: DefaultColumnConstraint
  DeferColumnConstraint: DeferColumnConstraint
  CollateColumnConstraint: CollateColumnConstraint
  ForeignKeyColumnConstraint: ForeignKeyColumnConstraint
  GeneratedColumnConstraint: GeneratedColumnConstraint
  NamedTableConstraint: NamedTableConstraint
  PrimaryKeyTableConstraint: PrimaryKeyTableConstraint
  UniqueTableConstraint: UniqueTableConstraint
  CheckTableConstraint: CheckTableConstraint
  ForeignKeyTableConstraint: ForeignKeyTableConstraint
  ColumnsAndConstraintsCreateTableBody: ColumnsAndConstraintsCreateTableBody
  AsSelectCreateTableBody: AsSelectCreateTableBody

  // ALTER TABLE
  RenameToAlterTableBody: RenameToAlterTableBody
  AddColumnAlterTableBody: AddColumnAlterTableBody
  DropColumnNotNullAlterTableBody: DropColumnNotNullAlterTableBody
  SetColumnNotNullAlterTableBody: SetColumnNotNullAlterTableBody
  RenameColumnAlterTableBody: RenameColumnAlterTableBody
  DropColumnAlterTableBody: DropColumnAlterTableBody
  AddConstraintAlterTableBody: AddConstraintAlterTableBody
  DropConstraintAlterTableBody: DropConstraintAlterTableBody

  // Indexing, sorting, limit
  IndexedColumn: IndexedColumn
  IndexedByIndexed: IndexedByIndexed
  NotIndexedIndexed: NotIndexedIndexed
  SortedColumn: SortedColumn
  Limit: Limit

  // Foreign keys
  ForeignKeyClause: ForeignKeyClause
  DeferSubclause: DeferSubclause
  OnDeleteRefArg: OnDeleteRefArg
  OnInsertRefArg: OnInsertRefArg
  OnUpdateRefArg: OnUpdateRefArg
  MatchRefArg: MatchRefArg

  // INSERT / UPDATE / PRAGMA
  SelectInsertBody: SelectInsertBody
  DefaultValuesInsertBody: DefaultValuesInsertBody
  SetAssignment: SetAssignment
  EqualsPragmaBody: EqualsPragmaBody
  CallPragmaBody: CallPragmaBody

  // Triggers
  UpdateTriggerCmd: UpdateTriggerCmd
  InsertTriggerCmd: InsertTriggerCmd
  DeleteTriggerCmd: DeleteTriggerCmd
  SelectTriggerCmd: SelectTriggerCmd
  DeleteTriggerEvent: DeleteTriggerEvent
  InsertTriggerEvent: InsertTriggerEvent
  UpdateTriggerEvent: UpdateTriggerEvent
  UpdateOfTriggerEvent: UpdateOfTriggerEvent

  // WITH / CTE
  With: With
  CommonTableExpr: CommonTableExpr

  // Types
  Type: Type
  MaxSizeTypeSize: MaxSizeTypeSize
  TypeSizeTypeSize: TypeSizeTypeSize

  // Upsert
  Upsert: Upsert
  UpsertIndex: UpsertIndex
  SetUpsertDo: SetUpsertDo
  NothingUpsertDo: NothingUpsertDo

  // Windows
  FunctionTail: FunctionTail
  WindowDef: WindowDef
  Window: Window
  FrameClause: FrameClause
  WindowOver: WindowOver
  NameOver: NameOver
  CurrentRowFrameBound: CurrentRowFrameBound
  FollowingFrameBound: FollowingFrameBound
  PrecedingFrameBound: PrecedingFrameBound
  UnboundedFollowingFrameBound: UnboundedFollowingFrameBound
  UnboundedPrecedingFrameBound: UnboundedPrecedingFrameBound
}

/** Discriminated union of every AST node shape defined in this file. */
export type AstNode = AstNodeMap[keyof AstNodeMap]

// ---------------------------------------------------------------------------
// Type-level invariant check for AstNodeMap.
//
// Verifies that every `AstNodeMap[K]["kind"]` equals `K`.  Catches two
// failure modes:
//   1. A node's `kind` is renamed but its `AstNodeMap` entry isn't updated
//      (stale key).
//   2. A new `AstNodeMap` entry's key is typo'd or points at the wrong node.
// ---------------------------------------------------------------------------

/** `true` per well-formed entry; otherwise a descriptive error string. */
type _AstNodeMapKeyCheck = {
  [K in keyof AstNodeMap]: K extends string
    ? AstNodeMap[K] extends { readonly kind: infer T extends string }
      ? K extends T
        ? T extends K
          ? true
          : `AstNodeMap["${K}"] error: node "kind" is wider than the map key`
        : `AstNodeMap["${K}"] error: node "kind" is "${T}", not "${K}"`
      : `AstNodeMap["${K}"] error: node has no string-literal "kind" field`
    : never
}

/** Forces `T` to be exactly `true` at the type level. */
type _AssertTrue<T extends true> = T

/**
 * Compile-time assertion: every `AstNodeMap` key matches its node's `kind`.
 * A failure here means `_AstNodeMapKeyCheck[keyof AstNodeMap]` contains
 * something other than `true` — see that type to find the bad entry.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AstNodeMapWellFormed = _AssertTrue<
  _AstNodeMapKeyCheck[keyof AstNodeMap] extends true ? true : false
>
