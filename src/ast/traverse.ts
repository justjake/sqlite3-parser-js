// Depth-first walker over the SQLite AST defined in `./nodes.ts`.
//
// Shape and semantics follow the ESTree family (`estraverse`,
// `eslint-visitor-keys`) so that downstream code — and eventually
// `typescript-eslint`-style lint rules — can drive traversal through
// a familiar `VisitorKeys` map plus enter/leave callbacks.  The one
// notable divergence today is that our node discriminator is named
// `kind`, not `type`; renaming is a follow-on when the AST stabilises.

import type { AstNode, AstNodeMap } from "./nodes.ts"

// ---------------------------------------------------------------------------
// Type-level plumbing.
// ---------------------------------------------------------------------------

/**
 * Keys on `T` whose value is either a direct `AstNode` or a
 * `ReadonlyArray<AstNode>`.  That is exactly the ESTree-style shape for
 * child-bearing properties — every traversable payload in the grammar
 * is either a single node or a flat list of nodes.
 */
type ChildNodeProperties<T> = {
  [K in keyof T]: NonNullable<T[K]> extends AstNode
    ? K
    : NonNullable<T[K]> extends ReadonlyArray<infer U>
      ? U extends AstNode
        ? K
        : never
      : never
}[keyof T]

/** Subset of `AstNodeMap` restricted to nodes that actually have children. */
type ParentNodeMap = {
  [K in keyof AstNodeMap as ChildNodeProperties<AstNodeMap[K]> extends never
    ? never
    : K]: AstNodeMap[K]
}

/** Any AST node that can contain child nodes. */
export type ParentNode = ParentNodeMap[keyof ParentNodeMap]

/**
 * Per-kind list of property names to descend into, in visit order.
 * Leaf kinds (no child-bearing property) are absent — lookups on them
 * fall through to "no children" at runtime.
 */
type VisitorKeyMap = {
  [K in keyof ParentNodeMap]: ReadonlyArray<ChildNodeProperties<ParentNodeMap[K]>>
}

// ---------------------------------------------------------------------------
// Visitor keys.
//
// Order matches the SQL source layout — left-to-right as the clauses
// appear in the surface syntax — so a straight depth-first walk emits
// nodes in reading order.
//
// `<Prop>Keys` constants hoist the most repeated key arrays so the
// identical shape is reused rather than rewritten per entry.  Their
// element type stays literal (via `as const`) so each assignment
// site still type-checks against the per-kind `ChildNodeProperties`.
// ---------------------------------------------------------------------------

const StmtKeys = ["stmt"] as const
const NameKeys = ["name"] as const
const ExprKeys = ["expr"] as const
const SelectKeys = ["select"] as const
const ColumnsKeys = ["columns"] as const
const ColumnKeys = ["column"] as const
const ValueKeys = ["value"] as const
const ValuesKeys = ["values"] as const
const ObjNameKeys = ["objName"] as const
const SizeKeys = ["size"] as const

export const VisitorKeys: VisitorKeyMap = {
  // Commands.
  CmdList: ["cmds"],
  ExplainCmd: StmtKeys,
  ExplainQueryPlanCmd: StmtKeys,
  StmtCmd: StmtKeys,

  // Statements.
  AlterTableStmt: ["tblName", "body"],
  AnalyzeStmt: ObjNameKeys,
  AttachStmt: ["expr", "dbName", "key"],
  BeginStmt: NameKeys,
  CommitStmt: NameKeys,
  CreateIndexStmt: ["idxName", "tblName", "columns", "whereClause"],
  CreateTableStmt: ["tblName", "body"],
  CreateTriggerStmt: ["triggerName", "event", "tblName", "whenClause", "commands"],
  CreateViewStmt: ["viewName", "columns", "select"],
  CreateVirtualTableStmt: ["tblName", "moduleName"],
  DeleteStmt: ["with", "tblName", "indexed", "whereClause", "returning", "orderBy", "limit"],
  DetachStmt: ExprKeys,
  DropIndexStmt: ["idxName"],
  DropTableStmt: ["tblName"],
  DropTriggerStmt: ["triggerName"],
  DropViewStmt: ["viewName"],
  InsertStmt: ["with", "tblName", "columns", "body", "returning"],
  PragmaStmt: ["name", "body"],
  ReindexStmt: ObjNameKeys,
  ReleaseStmt: NameKeys,
  RollbackStmt: ["txName", "savepointName"],
  SavepointStmt: NameKeys,
  SelectStmt: SelectKeys,
  UpdateStmt: [
    "with",
    "tblName",
    "indexed",
    "sets",
    "from",
    "whereClause",
    "returning",
    "orderBy",
    "limit",
  ],
  VacuumStmt: ["name", "into"],

  // Expressions.
  BetweenExpr: ["lhs", "start", "end"],
  BinaryExpr: ["left", "right"],
  CaseExpr: ["base", "whenThenPairs", "elseExpr"],
  WhenThen: ["when", "then"],
  CastExpr: ["expr", "typeName"],
  CollateExpr: ExprKeys,
  DoublyQualifiedExpr: ["schema", "table", "column"],
  ExistsExpr: SelectKeys,
  FunctionCallExpr: ["name", "args", "orderBy", "filterOver"],
  FunctionCallStarExpr: ["name", "filterOver"],
  IdExpr: ["id"],
  InListExpr: ["lhs", "rhs"],
  InSelectExpr: ["lhs", "rhs"],
  InTableExpr: ["lhs", "rhs", "args"],
  IsNullExpr: ExprKeys,
  LikeExpr: ["lhs", "rhs", "escape"],
  LiteralExpr: ["literal"],
  NameExpr: NameKeys,
  NotNullExpr: ExprKeys,
  ParenthesizedExpr: ["exprs"],
  QualifiedExpr: ["table", "column"],
  RaiseExpr: ["message"],
  SubqueryExpr: SelectKeys,
  UnaryExpr: ExprKeys,

  // SELECT.
  Select: ["with", "body", "orderBy", "limit"],
  SelectBody: ["select", "compounds"],
  CompoundSelect: SelectKeys,
  FromClause: ["select", "joins"],
  JoinedSelectTable: ["operator", "table", "constraint"],
  SelectOneSelect: ["columns", "from", "whereClause", "groupBy", "having", "windowClause"],
  ValuesOneSelect: ValuesKeys,
  ValuesRow: ValuesKeys,
  ExprResultColumn: ["expr", "alias"],
  TableStarResultColumn: ["table"],
  AsAs: NameKeys,
  ElidedAs: NameKeys,
  TableSelectTable: ["name", "alias", "indexed"],
  TableCallSelectTable: ["name", "args", "alias"],
  SelectSelectTable: ["select", "alias"],
  SubSelectTable: ["from", "alias"],
  OnJoinConstraint: ExprKeys,
  UsingJoinConstraint: ColumnsKeys,
  SortListFunctionCallOrder: ColumnsKeys,
  WithinGroupFunctionCallOrder: ExprKeys,

  // Identifiers.
  QualifiedName: ["dbName", "name", "alias"],

  // CREATE TABLE — columns and constraints.
  ColumnDefinition: ["colName", "colType", "constraints"],
  NamedColumnConstraint: ["name", "constraint"],
  CheckColumnConstraint: ExprKeys,
  DefaultColumnConstraint: ExprKeys,
  DeferColumnConstraint: ["clause"],
  CollateColumnConstraint: ["collationName"],
  ForeignKeyColumnConstraint: ["clause", "deferClause"],
  GeneratedColumnConstraint: ["expr", "typ"],
  NamedTableConstraint: ["name", "constraint"],
  PrimaryKeyTableConstraint: ColumnsKeys,
  UniqueTableConstraint: ColumnsKeys,
  CheckTableConstraint: ExprKeys,
  ForeignKeyTableConstraint: ["columns", "clause", "deferClause"],
  ColumnsAndConstraintsCreateTableBody: ["columns", "constraints"],
  AsSelectCreateTableBody: SelectKeys,

  // ALTER TABLE.
  RenameToAlterTableBody: NameKeys,
  AddColumnAlterTableBody: ColumnKeys,
  DropColumnNotNullAlterTableBody: ColumnKeys,
  SetColumnNotNullAlterTableBody: ColumnKeys,
  RenameColumnAlterTableBody: ["old", "new"],
  DropColumnAlterTableBody: ColumnKeys,
  AddConstraintAlterTableBody: ["constraint"],
  DropConstraintAlterTableBody: NameKeys,

  // Indexing, sorting, limit.
  IndexedColumn: ["colName", "collationName"],
  IndexedByIndexed: NameKeys,
  SortedColumn: ExprKeys,
  Limit: ["expr", "offset"],

  // Foreign keys.
  ForeignKeyClause: ["tblName", "columns", "args"],
  MatchRefArg: NameKeys,

  // INSERT / UPDATE / PRAGMA.
  SelectInsertBody: ["select", "upsert"],
  SetAssignment: ["colNames", "expr"],
  EqualsPragmaBody: ValueKeys,
  CallPragmaBody: ValueKeys,

  // Triggers.
  UpdateTriggerCmd: ["tblName", "sets", "from", "whereClause"],
  InsertTriggerCmd: ["tblName", "colNames", "select", "upsert"],
  DeleteTriggerCmd: ["tblName", "whereClause"],
  SelectTriggerCmd: SelectKeys,
  UpdateOfTriggerEvent: ColumnsKeys,

  // WITH / CTE.
  With: ["ctes"],
  CommonTableExpr: ["tblName", "columns", "select"],

  // Types.
  Type: SizeKeys,
  MaxSizeTypeSize: SizeKeys,
  TypeSizeTypeSize: ["size1", "size2"],

  // Upsert.
  Upsert: ["index", "doClause", "next"],
  UpsertIndex: ["targets", "whereClause"],
  SetUpsertDo: ["sets", "whereClause"],

  // Windows.
  FunctionTail: ["filterClause", "overClause"],
  WindowDef: ["name", "window"],
  Window: ["base", "partitionBy", "orderBy", "frameClause"],
  FrameClause: ["start", "end"],
  WindowOver: ["window"],
  NameOver: NameKeys,
  FollowingFrameBound: ExprKeys,
  PrecedingFrameBound: ExprKeys,
}

// ---------------------------------------------------------------------------
// Visitor API.
// ---------------------------------------------------------------------------

/**
 * Control signal returned from a visitor callback.
 *   - `"break"` halts the entire walk.
 *   - `"skip"` (from `enter` or a per-kind handler) skips the current
 *     node's children; `leave` is still called.
 *   - `"continue"` (or returning nothing) proceeds normally.
 */
export type VisitorResult = "break" | "skip" | "continue" | void

type VisitorFn<N extends AstNode = AstNode, P extends ParentNode = ParentNode> = (
  node: N,
  parent: P | undefined,
) => VisitorResult

export interface Visitor {
  /** Called on every node before descending into its children. */
  enter?: VisitorFn
  /** Called on every node after its children have been visited. */
  leave?: VisitorFn
  /** Per-kind enter-style callbacks.  Fire after `enter` on matching nodes. */
  nodes?: {
    [K in keyof AstNodeMap]?: VisitorFn<AstNodeMap[K], ParentNode>
  }
  /** Per-call overrides for `VisitorKeys`.  Replaces, not merges. */
  keys?: Partial<VisitorKeyMap>
}

/**
 * Depth-first walk the AST rooted at `node`, dispatching to `visitor`.
 * Traversal order for each kind is `visitor.keys?.[kind]` if present,
 * otherwise `VisitorKeys[kind]`, otherwise (leaves) no children.
 */
export function traverse(root: AstNode, visitor: Visitor): void {
  const overrideKeys = visitor.keys

  // `walk` / `visitValue` return `false` to unwind the whole traversal
  // (a "break" signal) and `true` to continue.  Parent tracking uses
  // the nearest enclosing *AST node* — intermediate plain-object
  // wrappers like `CaseExpr.whenThenPairs[i]` are transparent.
  const walk = (node: AstNode, parent: ParentNode | undefined): boolean => {
    let skipChildren = false

    if (visitor.enter) {
      const r = visitor.enter(node, parent)
      if (r === "break") return false
      if (r === "skip") skipChildren = true
    }

    if (!skipChildren) {
      const handler = visitor.nodes?.[node.kind] as VisitorFn | undefined
      if (handler) {
        const r = handler(node, parent)
        if (r === "break") return false
        if (r === "skip") skipChildren = true
      }
    }

    if (!skipChildren) {
      const nodeKeys = (overrideKeys?.[node.kind as keyof VisitorKeyMap] ??
        VisitorKeys[node.kind as keyof VisitorKeyMap]) as readonly string[] | undefined
      if (nodeKeys) {
        const record = node as unknown as Record<string, unknown>
        const parentNode = node as ParentNode
        for (const key of nodeKeys) {
          if (!visitValue(record[key], parentNode)) return false
        }
      }
    }

    if (visitor.leave) {
      const r = visitor.leave(node, parent)
      if (r === "break") return false
    }

    return true
  }

  const visitValue = (value: unknown, parent: ParentNode): boolean => {
    if (value == null) return true

    if (Array.isArray(value)) {
      for (const item of value) {
        if (!visitValue(item, parent)) return false
      }
      return true
    }

    return walk(value as AstNode, parent)
  }

  walk(root, undefined)
}
