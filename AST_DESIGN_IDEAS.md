# CST → AST: implementation guide

## Status

`src/parser.ts` currently produces a **CST** — a faithful tree of grammar
reductions. Every rule in `fixtures/parser.json` becomes a `RuleNode`; every
terminal becomes a `TokenNode`; the unit-rule-elimination and multi-terminal
divergences are documented inline (`CST DIVERGENCE #1` / `#2`).

This document is about the next layer: turning that CST into an **AST** that
downstream tooling (formatters, linters, analyzers, rewriters) can consume.

## What we are NOT going to do (and why)

### Option rejected: mechanically transpile `actionC` → TypeScript

`fixtures/parser.json` already contains every rule's C action body on the
`actionC` field, plus `codePrefix` / `codeSuffix`, `preamble`, `syntaxError`,
and `stackOverflow`. A builder of the form
`createParser(parser.json, out.ts)` that emits a reducer per rule is
mechanically possible.

It is semantically a dead end. Representative actions:

- rule 3 (`cmd ::= BEGIN transtype trans_opt`):
  `sqlite3BeginTransaction(pParse, yymsp[-1].minor.yy502);`
- rule 13 (`create_table ::= createkw temp TABLE ifnotexists nm dbnm`):
  `sqlite3StartTable(pParse, &yymsp[-1].minor.yy0, &yymsp[0].minor.yy0, yymsp[-4].minor.yy502, 0, 0, yymsp[-2].minor.yy502);`
- rule 20 (`create_table_args ::= AS select`):
  `sqlite3EndTable(pParse, 0, 0, 0, yymsp[0].minor.yy637); sqlite3SelectDelete(pParse->db, yymsp[0].minor.yy637);`

Those calls aren't "build an AST node". They mutate `pParse`, emit VDBE
opcodes, free memory, and construct SQLite's internal IR (`Expr*`, `Select*`,
`Table*`, `ExprList*`) — structures tuned for the code generator, not for
external tools. SQLite has **no AST stage**; the parser actions directly drive
codegen across `src/build.c`, `expr.c`, `select.c`, `insert.c`, `where.c`, and
friends. That's ~50 kloc of SQLite frontend behind the ~2 kloc `parse.y`.

Transpiling `actionC` without porting the callees yields calls into an empty
shell. Porting the callees means reimplementing most of SQLite's frontend, and
the output is still the wrong *shape* for a JS AST.

### Option rejected: stub out `sqlite3*` helpers as AST builders

"Just make `sqlite3ExprFunction` return an AST node." This shifts the problem:
we now define dozens of C-style helpers with the exact arity and side-effect
contract of their SQLite originals, and every helper's correctness is pinned
to whatever SQLite's `build.c` / `expr.c` expected at that moment. Version
upgrades become archaeology.

The AST we want isn't lurking inside `parse.y` waiting to be extracted. It's
ours to define.

## What we WILL do

Write a dedicated CST → AST reducer in TypeScript, keyed on rule id. Own the
AST shape. Use `parser.json` as the source of truth for grammar shape, and as
a diff surface for SQLite version upgrades.

### Why this is tractable

- Only **350 of 414 rules have actions** (`YYNRULE_WITH_ACTION: 350` —
  `fixtures/parser.json:31`). The others are pass-throughs; we can
  auto-generate identity reducers for them.
- The interesting rules cluster around `expr`, `select`, DDL. A handwritten
  reducer set covering ~50-100 rule groups carries most of the weight.
- Every rule's RHS in `parser.json` already carries an `alias` per position —
  the same `Y`/`X`/`E` capture names `parse.y` uses. Our reducers can read
  children by alias, not position, mirroring the grammar authors' mental
  model.
- The CST we already emit has the exact structure Lemon generated — unit
  rules re-expanded (divergence #1), multi-terminals preserved (divergence
  #2) — so reducers see a predictable shape per rule id.

## Architecture

```
┌──────────┐   tokenize    ┌──────────┐  engine.run   ┌────────────┐
│  source  │ ───────────▶  │  tokens  │ ─────────────▶│    CST     │
│   SQL    │               │ (TK_*)   │               │ RuleNode/  │
└──────────┘               └──────────┘               │ TokenNode  │
                                                      └─────┬──────┘
                                                            │ rule-keyed
                                                            │ dispatch
                                                            ▼
                                                      ┌────────────┐
                                                      │    AST     │
                                                      │ (our own   │
                                                      │  shape)    │
                                                      └────────────┘
```

Two new modules:

- `src/ast.ts` — AST node types. Hand-written, designed for downstream use
  (name-resolution, formatting, rewriting). Not a 1:1 image of anything in
  SQLite.
- `src/reduce.ts` — CST → AST reducers. Auto-generated dispatch skeleton
  keyed by rule id; hand-written bodies for the rules that do real work.

Plus one build-time tool:

- `bin/gen-reducers.ts` — reads `fixtures/parser.json`, emits
  `src/reduce.generated.ts`:
  - A union type `RuleKey = "explain:0" | "cmd:3" | ...` or similar
    signature-based keying.
  - An identity reducer for every `doesReduce=true` rule that is a pure
    1:N pass-through of its children.
  - A stub `assertUnhandled(rule, cst)` for every rule with non-trivial
    action semantics, so missing reducers fail loudly rather than silently
    producing an incomplete AST.
  - A manifest `ruleFingerprints` mapping each rule id to a hash of
    `(lhsName, rhs symbol names, actionC)` — used by the version-diff
    tool (see below).

### Rule-keyed dispatch shape

```ts
// src/reduce.ts
import type { CstNode, RuleNode, TokenNode } from './parser.ts';
import type { SqlAst, Expr, Select, Stmt, ... } from './ast.ts';

type Reducer<T> = (cst: RuleNode, ctx: ReduceContext) => T;

// Keyed by rule id (numeric) for O(1) dispatch; the generator also
// emits a named-alias helper per rule so bodies stay readable.
const reducers: Record<RuleId, Reducer<unknown>> = {
  [RULE_EXPLAIN_0]: (r) => ({ kind: 'Explain', mode: 'basic' }),
  [RULE_EXPLAIN_1]: (r) => ({ kind: 'Explain', mode: 'queryPlan' }),
  [RULE_CMD_BEGIN]: (r, ctx) => {
    const { Y: transtype } = aliasesOf(r);
    return { kind: 'Begin', mode: reduce<TransType>(transtype, ctx) };
  },
  // ... ~350 entries, most auto-generated identity-or-stub
};
```

`aliasesOf(cst)` exploits the fact that `parser.json` gives us both the rule's
RHS shape and the source alias per position. The generator emits a typed
alias accessor per rule so the reducer body reads like the grammar:

```ts
// generated — one per rule that has aliases
export function aliasesOfRule13(r: RuleNode) {
  // create_table ::= createkw temp(T) TABLE ifnotexists(E) nm(Y) dbnm(Z)
  return {
    T: r.children[1] as RuleNode,
    E: r.children[3] as RuleNode,
    Y: r.children[4] as RuleNode,
    Z: r.children[5] as RuleNode,
  };
}
```

### Reducer context

A small `ReduceContext` carries whatever cross-cutting state the reducers
need. Early on that's probably just:

```ts
interface ReduceContext {
  readonly sql: string;              // for extracting token text
  readonly errors: AstError[];       // semantic issues found during reduction
  readonly options: ReduceOptions;   // strict vs lenient, dialect, etc.
}
```

Do **not** mirror `Parse *pParse`. Most of what SQLite puts there is codegen
state. We don't generate code.

## Version upgrade workflow

This is the key reason the rule-keyed design is worth the effort.

1. Regenerate `fixtures/parser.json` from an upgraded SQLite.
2. Run `bin/diff-grammar.ts old.json new.json`. It emits:
   - **Added rules** — need new reducer entries. The tool inserts stubs into
     `src/reduce.generated.ts` with a TODO marker.
   - **Removed rules** — dead reducer entries; the tool removes them.
   - **Changed RHS shape** — same rule id (or same lhs/alias but different
     children). The tool flags these; the existing reducer body probably
     needs edits.
   - **Changed `actionC` only** — shape unchanged. These are candidates to
     ignore (we don't transpile actions), but the tool prints them so a human
     can sanity-check whether the semantic change matters to our AST shape.

3. TypeScript's exhaustiveness checking on `RuleKey` forces every rule to
   have a reducer entry, so a forgotten rule is a compile error.

This replaces "chase C diffs across 50 kloc" with "read a ~20-50 line report
and update a handful of reducers."

## Incremental build-out plan

Work from statements outward:

1. **Scaffolding** (~1 day)
   - `bin/gen-reducers.ts` — emit `RuleKey` union, identity reducers, stubs,
     alias accessors, fingerprints.
   - `src/ast.ts` — stub types for top-level: `Stmt`, `SqlFile`,
     `UnknownStmt`.
   - `src/reduce.ts` — dispatcher + `ReduceContext` + fallback that wraps
     unhandled rules as `UnknownStmt { cst }` so downstream code keeps
     working.

2. **Statements: trivial DDL/DML** (~1-2 days each)
   - `BEGIN` / `COMMIT` / `ROLLBACK` / `SAVEPOINT` / `RELEASE`.
   - `EXPLAIN` wrappers.
   - `ATTACH` / `DETACH`.
   - These map directly from 1-3 rules each; good warm-up for the
     alias-based reducer style.

3. **Expressions** (~1 week)
   - The `expr` nonterminal is the heaviest. Do it as one cohesive PR:
     unary/binary ops, literals, column refs, function calls, CAST,
     CASE/WHEN, subqueries, `IN`/`BETWEEN`/`LIKE`, window functions,
     `COLLATE`, `RAISE`.
   - Most grammar shapes map to a small set of AST variants; a few (e.g.
     function call with `FILTER (WHERE ...)` / `OVER`) need careful
     structural choices.

4. **SELECT** (~3-5 days)
   - `select_no_cte` + `cte_selectlist` + `compound_op` compose the SELECT
     pipeline. Design the AST's `Select` shape to separate set-operations
     from per-query clauses cleanly — do not mirror SQLite's `Select` linked
     list (`pPrior` / `pNext`), which exists for codegen reasons.

5. **INSERT / UPDATE / DELETE / CREATE TABLE** (~1 week total)
   - `create_table` is deceptively big — column defs, constraints
     (`ccons` / `tcons`), foreign-key actions, generated columns. The CST
     groups these cleanly; the AST should too.

6. **Triggers, virtual tables, the long tail** (~as-needed)

At each stage, the generated stubs for unhandled rules make the dispatcher
total — `parse("some SQL")` always returns *some* AST, with well-labeled
`UnknownStmt` placeholders where coverage is missing. This lets downstream
consumers start integrating before we're "done."

## Testing

- **Snapshot tests** on representative SQL from `test/` (currently has
  syntax-level fixtures; add semantic ones for AST). One snapshot per
  statement category; expect a golden file.
- **Grammar coverage report**: at the end of the test run, print which rule
  ids were touched. Any rule id with an action that was never exercised is a
  coverage gap, not necessarily a bug — but worth surfacing.
- **Round-trip check** where it makes sense: for a subset of statements we
  claim to fully understand, `print(parse(sql)) === canonicalize(sql)`. This
  catches reducer bugs that pass schema validation.

## Open questions

- **Errors during reduction.** Some CSTs are syntactically valid but
  semantically nonsense (e.g. `CREATE TEMP TEMP TABLE`). SQLite's
  `actionC` raises these via `sqlite3ErrorMsg`. We can either (a) mirror
  that — collect errors in `ReduceContext.errors` and still produce a
  best-effort AST; or (b) leave semantic checks to a later pass over the
  AST. Recommend (b): keeps reducers simple, makes the semantic layer
  independently testable.

- **Trivia / comments.** The CST currently drops comments (tokenizer skips
  them). If formatters need them, that's a tokenizer change, not an AST
  change — plumb trivia into `TokenNode` first, then decide how the AST
  represents it (usually: as attached prefix/suffix trivia on the nearest
  token-bearing node, never as first-class AST nodes).

- **Rename support.** SQLite has `IN_RENAME_OBJECT` paths in actions that
  attach source ranges for editors. We already have `start` / `length` on
  every CST node — AST nodes should preserve a reference back to the CST
  node they came from, so rename / hover features can always recover source
  spans without a second parse.
