# CST → AST: implementation guide

## Status

`src/parser.ts` produces a **CST**: one `RuleNode` per grammar reduction,
one `TokenNode` per terminal, plus the parser-specific wrapper recovery
documented inline in that file.

The AST layer is intentionally smaller than the original design sketch:

- `src/ast/types.ts` defines the AST node shapes.
- `src/ast/handlers.ts` is one flat stable-key → handler map.
- `src/ast/dispatch.ts` computes stable keys, verifies the handler map
  against a grammar defs object, and runs CST → AST conversion.
- `test/ast.test.ts` verifies the handler table against the current
  grammar. This replaces the older idea of generating TypeScript
  exhaustiveness machinery for every rule.

The AST layer is still scaffolding. With no real handlers registered yet,
conversion falls back to `UnknownAstNode`.

## What we are NOT going to do

### We are not going to transpile `actionC` to TypeScript

SQLite's `parse.y` actions do not define a user-facing AST. They mutate
`Parse *pParse`, construct SQLite's internal IR, emit codegen state, and
free intermediate objects. Porting those actions mechanically would either:

1. emit calls into missing SQLite helper functions, or
2. force us to reimplement a large slice of SQLite's frontend in order to
   preserve semantics we do not actually want.

The AST we want is our own shape for tools like formatters, analyzers, and
rewriters. It should not be a transliteration of SQLite internals.

### We are not going to build a registration framework before we have handlers

The first draft of this design leaned toward:

- per-category handler modules
- a merged registry object
- a binding phase that converted stable keys into a rule-id dispatch table
- generated TypeScript unions / exhaustiveness checks over all rules

That is too much framework for the current stage of the codebase.

The simplified rule is:

- keep stable keys
- keep one flat handler map
- do direct lookup at conversion time
- verify the handler map in a `.test.ts` file

If the handler file grows large enough later, we can split it. We do not
need to pre-pay that complexity now.

## Current architecture

```
SQL source
  -> tokenizer
  -> LALR driver
  -> CST (`RuleNode` / `TokenNode`)
  -> stable-key dispatch
  -> AST (`AstNode`)
```

### `src/ast/types.ts`

Owns the AST shape.

Key rules:

- AST nodes are our own model, not SQLite's internal IR.
- Every AST node keeps a `cst` back-pointer so downstream code can recover
  source spans and original syntax without reparsing.
- `UnknownAstNode` is the fallback when no concrete handler exists yet.

### `src/ast/handlers.ts`

Exports one flat object:

```ts
export const handlers: HandlerMap = {
  "cmd::BEGIN transtype trans_opt": handleBegin,
  "select::WITH selectnowith": handleSelectWith,
}
```

Keep it flat until there is enough real implementation pressure to justify
splitting it.

### `src/ast/dispatch.ts`

This file does three things:

1. builds stable keys from grammar rules
2. verifies that a handler map lines up with a concrete defs object
3. converts CST nodes to AST nodes

`createAstBuilder(defs, handlers, opts)` closes over one grammar defs object
and returns:

- `verify()` — test-oriented verification data
- `build(cst, sql)` — CST → AST conversion

There is no separate registry binding phase.

### Missing handlers

If a rule has no registered handler:

- normal mode returns `UnknownAstNode`
- `strict: true` throws

This keeps the AST layer usable while coverage is incomplete.

## Why stable keys still matter

SQLite rule ids are not stable across versions. Stable keys are.

Today the key is:

```ts
`${lhsName}::${rhs symbol names joined by spaces}`
```

Examples:

- `cmd::BEGIN transtype trans_opt`
- `expr::LP expr RP`
- `oneselect::SELECT distinct selcollist from where_opt groupby_opt having_opt orderby_opt limit_opt`

Stable keys let us:

- author handlers against grammar shape instead of rule number
- diff grammar changes across SQLite upgrades with `scripts/diff-ast.ts`
- keep the handler table readable

## Verification strategy

We explicitly moved away from "generate TypeScript types for every rule and
let the compiler enforce exhaustiveness."

Instead, `test/ast.test.ts` verifies the simpler invariants that actually
matter to the current scaffolding:

- every stable key in the current grammar is unique
- every registered handler key exists in the current grammar
- the default builder falls back to `UnknownAstNode`
- `strict: true` fails loudly on unhandled rules

This is easier to understand, cheaper to maintain, and closer to the real
runtime behavior than a generated compile-time layer.

## Version upgrade workflow

1. Regenerate `generated/<ver>/parser.dev.json` and `parser.prod.json`.
2. Run:

   ```sh
   bun scripts/diff-ast.ts OLD.json NEW.json
   ```

   This reports:
   - added stable keys
   - removed stable keys
   - rules whose `actionC` changed while the grammar shape stayed the same

3. Update `src/ast/handlers.ts` if any stable keys we care about changed.
4. Run `bun test test/ast.test.ts`.

The important part is that stable-key changes are reviewed explicitly, not
hidden behind generated boilerplate.

## Build-out plan

Start from the outside in:

1. Statement wrappers
   - `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`
   - `EXPLAIN`
   - `ATTACH`, `DETACH`

2. Expressions
   - literals
   - identifiers / qualified names
   - unary / binary ops
   - function calls
   - `CASE`, `IN`, `BETWEEN`, `LIKE`, subqueries, window attachments

3. SELECT pipeline
   - single SELECT core
   - FROM/JOIN structure
   - ORDER/GROUP/HAVING/LIMIT
   - compound SELECT
   - CTEs

4. DML / DDL
   - `INSERT`, `UPDATE`, `DELETE`
   - `CREATE TABLE`
   - constraints and column definitions

5. Long tail
   - triggers
   - virtual tables
   - pragma / vacuum / analyze / reindex

At each step, unimplemented rules still convert to `UnknownAstNode`.

## Notes for future ergonomics

### Aliases

The runtime defs (`parser.prod.json`) intentionally strip a lot of data,
including RHS aliases. If alias-based reducer ergonomics become important,
derive helper accessors from `parser.dev.json` at build time.

Do not bloat the runtime defs just to make handler authoring nicer.

### Trivia / comments

The tokenizer currently drops trivia by default. If formatters need comment
preservation, that starts in the tokenizer / CST layer first. AST nodes
should reference the CST rather than inventing comment nodes prematurely.

### Source locations

The `cst` back-pointer on every AST node is the source-of-truth for spans.
Keep that invariant. It is cheaper and more reliable than recreating source
ranges during later semantic passes.
