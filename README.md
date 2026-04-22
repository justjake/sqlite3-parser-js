# sqlite3-parser

Parse SQLite query syntax.

- **Fast**: 2x-200x faster than other JavaScript SQL parsers, see [benchmarks](#benchmarks).
- **Light**: Pure JavaScript, no WebAssembly overhead. Ships ~32 KB gzipped and runs unchanged in Node, Bun, and the browser.
- **Faithful**: The parser based on [SQLite's `parse.y` grammar file](https://github.com/sqlite/sqlite/blob/master/src/parse.y) using a [patched version](https://github.com/justjake/sqlite3-parser-js/blob/main/vendor/patched/3.53.0/tool/lemon.c#L5231-L5238) of the [Lemon parser generator](https://sqlite.org/lemon.html) to emit [TypeScript code](https://github.com/justjake/sqlite3-parser-js/blob/main/generated/3.53.0/parse.ts).
- **Helpful**: Improved error messages, extending the canonical `near "X": syntax error` wording with source location, a list of terminals that would have been accepted, and a grammar-aware hint for common mistakes (unclosed groups with a pointer at the opener, trailing commas, keywords-used-as-identifiers, FILTER-before-OVER, etc.).

[![npm](https://img.shields.io/npm/v/sqlite3-parser?label=npm&logo=npm)](https://www.npmjs.com/package/sqlite3-parser) [![CI](https://img.shields.io/github/actions/workflow/status/justjake/sqlite3-parser-js/ci.yml?branch=main&label=CI&logo=github)](https://github.com/justjake/sqlite3-parser-js/actions/workflows/ci.yml?query=branch%3Amain)

## Usage

Parse SQL script with multiple statements, or return an error:

```ts
import { parse } from "sqlite3-parser"

const result = parse(`
  INSERT INTO users VALUES (1, 'Douglas');
  SELECT id, name FROM users WHERE active = 1
`)

// result is a union of ParseOk and ParseErr
// type ParseOk = { status: "ok"; root: CmdList; ... }
// type ParseErr = { status: "error"; errors: readonly ParseDiagnostic[]; ... }
if (result.status === "ok") {
  // Root is a CmdListNode containing all top-level statements
  const { cmds } = result.root
  console.log(cmds.length) // -> 2
  console.log(cmds[0].type) // -> InsertStmt
  console.log(cmds[1].type) // -> SelectStmt
} else {
  throw "expected ok"
}
```

Parse single statement at a time, or return an error:

```ts
import { parseStmt } from "sqlite3-parser"

const result = parseStmt("SELECT id, name FROM users WHERE active = 1")
if (result.status === "ok") {
  // Root is a StmtNode containing the first top-level statement
  console.log(result.root.type) // -> SelectStmt
}

// By default, parseStmt rejects trailing content (second statements, garbage tokens)
const result2 = parseStmt("SELECT id, name FROM users WHERE active = 1; SELECT 1")
if (result2.status === "error") {
  console.error(result2.errors.join("\n"))
}

// Use `allowTrailing: true` to incrementally parse a multi-statement script
function* parseEach(sql: string) {
  while (sql) {
    const result = parseStmt(sql, { allowTrailing: true })
    yield result
    if (result.status === "error") {
      return
    }
    sql = sql.slice(result.tail)
  }
}
```

Parse or throw an error:

```ts
import { parseOrThrow, parseStmtOrThrow } from "sqlite3-parser"

const { root: cmds } = parseOrThrow("SELECT id, name FROM users WHERE active = 1; SELECT 1")
console.log(cmds.type) // -> CmdList
const { root: stmt } = parseStmtOrThrow("SELECT id, name FROM users WHERE active = 1")
console.log(stmt.type) // -> SelectStmt
```

### Errors

Parse failures are modeled as "diagnostics". These are not sub-classes of `Error`, so constructing them is cheap since no stack trace is captured.

```ts
type ParseDiagnostic = {
  /** Error message */
  readonly message: string
  /** Location of the error */
  readonly span: Span
  /** Optional: the token that caused the error */
  readonly token?: Token
  /** Optional: additional hints about the error (eg, solutions)  */
  readonly hints?: readonly DiagnosticHint[]
  /** Optional: the filename used in error messages, if provided at parse time */
  readonly filename?: string
  /** Format the diagnostic as a string with source code citations rendered as code blocks */
  format(): string
  /** Alias of {@link format} */
  toString(): string
}

interface DiagnosticHint {
  /** Hint message */
  readonly message: string
  /** Optional: the source location the hint is referring to */
  readonly span?: Span
}
```

`parse` and `parseStmt` return an array of structured diagnostics when `status === "error"`. Because diagnostics implement `toString`, you can use `errors.join("\n")` to get a ready-to-print block with source code and carets.

```ts
const result = parse("SELECT FROM users")
if (result.status === "error") {
  for (const err of result.errors) {
    // access fields:
    //   err.message    → "near \"FROM\": syntax error"
    //   err.span       → { offset, length, line, col }
    //   err.token      → the offending Token, when available
    //   err.hints      → readonly { message, span? }[]
  }

  // Same as result.errors.map(e => e.format()).join("\n")
  console.error(result.errors.join("\n")) // -v
  // near "FROM": syntax error
  //
  // At 1:7:
  //    1│ SELECT FROM users
  //     │        ^^^^
  //
  //   hint: expected a result expression before FROM
} else {
  throw "expected error"
}
```

`parseOrThrow` and `parseStmtOrThrow` throw a `Sqlite3ParserDiagnosticError` with the diagnostics formatted as the error message.

```ts
import { parseOrThrow, Sqlite3ParserDiagnosticError } from "sqlite3-parser"
try {
  parseOrThrow("SELECT FROM users")
} catch (e) {
  if (e instanceof Sqlite3ParserDiagnosticError) {
    console.error(e.errors.length) // -> 1
    console.error(e.errors[0].message) // -> "near \"FROM\": syntax error"
    console.error(e.message) // -v
    // near "FROM": syntax error
    //
    // At 1:7:
    //    1│ SELECT FROM users
    //     │        ^^^^
    //
    //   hint: expected a result expression before FROM
  } else {
    throw e
  }
}
```

### Traversing the AST

`traverse` exposes an ESTree-style walker. A depth-first walk fires `enter` on every node, recurses into child slots in their surface-syntax order, then fires `leave`:

```ts
import { parseOrThrow, traverse } from "sqlite3-parser"

const { root } = parseOrThrow("SELECT a, b FROM t")
const tables: string[] = []

traverse(root, {
  // All args optional.
  enter(node, parent) {
    // Runs before `nodes` handler on every node.
  },
  nodes: {
    // Runs before visiting children.
    TableSelectTable(node, _parent) {
      // TableSelectTable.tblName → QualifiedName.objName → Name.text
      tables.push(node.tblName.objName.text)
      // From any handler:
      //   return "skip" to stop descending into the current node
      //   return "break" to halt the whole walk
      //   return "continue" / nothing to proceed
      return "skip"
    },
  },
  leave(node, parent) {
    // Runs after visiting children.
  },
  keys: {
    // Override traversal order & keys for a specific node type.
    Select: ["with", "select", "compounds"],
  },
})

console.log(tables) // -> ["t"]
```

A few things worth knowing:

- **Per-type handlers.** Instead of a single `enter` with a big switch, pass `nodes: { SelectStmt(node) { … }, BinaryExpr(node, parent) { … }, … }`. Each handler is strongly typed to that node type.
- **Visit control.** Callbacks may return `"skip"` to stop descending into the current node (but still fire `leave`), `"break"` to halt the whole walk, or nothing / `"continue"` to proceed.
- **Visitor keys.** `VisitorKeys` is the per-type list of child-bearing property names in traversal order. You can pass `keys: { CaseExpr: ["base", "elseExpr"] }` to override traversal for specific types per call.
- **Parent tracking.** Callbacks receive `(node, parent)` where parent is the enclosing AST node, or `undefined` at the root.

The type `AstNodeMap` maps every `type` discriminator string to its interface. `traverse` uses that map to type per-type handlers; user code can too — e.g. `type NodeOfType<T extends keyof AstNodeMap> = AstNodeMap[T]`.

## Benchmarks

tl;dr:

```text
    ~2.5x faster than liteparser (wasm)
    ~6x   faster than @guanmingchiu/sqlparser-ts (wasm)
   ~10x   faster than node-sql-parser
  ~100x   faster than pgsql-ast-parser
  ~200x   faster than sqlite-parser
  ~250x   faster than @appland/sql-parser
```

- Results are averages from `bun run bench:compare` on one machine:
  - CPU: Apple M4 Max
  - Runtime: Bun 1.3.11 (`arm64-darwin`)
- The compared parsers do not produce the same AST shape.
- WebAssembly libraries pay some bridging overhead.

### Cases

| Case     | Description                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------- |
| `tiny`   | Single `SELECT 1;` statement.                                                                   |
| `small`  | Single `CREATE TABLE users (...)` statement.                                                    |
| `medium` | `WITH` query with joins, aggregate, window function, `FILTER`, grouping, ordering, and `LIMIT`. |
| `large`  | Wide `CREATE TABLE analytics_events (...)` statement with 96 metric columns.                    |
| `deep`   | Nested expressions with a subquery.                                                             |
| `broken` | Invalid input with a trailing comma before `FROM`; used for the syntax-error path.              |

### Results

Avg per-iteration parse time across the five inputs, compared to ours.

| Parser                              | `tiny`             | `small`            | `medium`           | `large`             | `deep`             |
| ----------------------------------- | ------------------ | ------------------ | ------------------ | ------------------- | ------------------ |
| Ours                                | `0.77 µs`          | `2.74 µs`          | `17.61 µs`         | `55.41 µs`          | `8.48 µs`          |
| `liteparser (wasm)`                 | `1.93 µs` (2.5×)   | `4.58 µs` (1.7×)   | `46.12 µs` (2.6×)  | `81.20 µs` (1.5×)   | `30.03 µs` (3.5×)  |
| `@guanmingchiu/sqlparser-ts (wasm)` | `5.59 µs` (7.3×)   | `13.78 µs` (5.0×)  | `139.71 µs` (7.9×) | `176.26 µs` (3.2×)  | `65.80 µs` (7.8×)  |
| `node-sql-parser`                   | `9.34 µs` (12×)    | `25.25 µs` (9.2×)  | `259.20 µs` (15×)  | `525.64 µs` (9.5×)  | `1.03 ms` (121×)   |
| `pgsql-ast-parser`                  | `46.60 µs` (61×)   | `55.72 µs` (20×)   | `2.43 ms` (138×)   | `849.50 µs` (15×)   | `932.67 µs` (110×) |
| `sqlite-parser`                     | `430.27 µs` (559×) | `561.29 µs` (205×) | `4.95 ms` (281×)   | `6.34 ms` (114×)    | `2.88 ms` (340×)   |
| `@appland/sql-parser`               | `518.49 µs` (673×) | `655.36 µs` (239×) | `5.95 ms` (338×)   | `7.16 ms` (129×)    | `3.21 ms` (379×)   |

Libraries compared:

- **Ours** - TypeScript parser derived from SQLite's parse.y grammar, uses Lemon LALR(1) parser generator to dump parser tables as JSON, which is used to drive a small TypeScript emitter.
- **[`@sqliteai/liteparser`](https://github.com/sqliteai/liteparser)** — C/WebAssembly parser extracted from the original SQLite parser (parse.y) with minimal modifications. It uses the same Lemon LALR(1) parser generator and a hand-written tokenizer derived from SQLite's own lexer.
- **[`sqlite-parser`](https://github.com/codeschool/sqlite-parser)** — PEG.js-generated pure-JS parser for SQLite (Code School, 2015-2017).
- **[`@appland/sql-parser`](https://github.com/applandinc/sqlite-parser)** — AppLand's maintained fork of `sqlite-parser` with additional grammar coverage.
- **[`node-sql-parser`](https://github.com/taozhi8833998/node-sql-parser)** — PEG.js-derived multi-dialect parser; run here with `database: "sqlite"`.
- **[`pgsql-ast-parser`](https://github.com/oguimbal/pgsql-ast-parser)** — nearley + moo Postgres grammar.
- **[`@guanmingchiu/sqlparser-ts`](https://github.com/guan404ming/sqlparser-ts)** — Rust/WebAssembly wrapper around [`datafusion-sqlparser-rs`](https://github.com/apache/datafusion-sqlparser-rs); run with its `"sqlite"` dialect.

## Lemon JSON

Lemon is a LALR(1) parser generator similar to Yacc, written by SQLite's author, Dr. Richard Hipp. SQLite's own parser is generated with Lemon.

Our patched [lemon.c](https://github.com/sqlite/sqlite/blob/master/src/tool/lemon.c) can emit a JSON dump of the parser tables, making Lemon usable for any programming language.

- The dumped parse tables are described by a JSON Schema at [generated/json-schema/v1/parser.dev.schema.json](https://github.com/justjake/sqlite3-parser-js/blob/main/generated/json-schema/v1/parser.dev.schema.json).
- Our parse.y grammar file: [vendor/patched/3.53.0/src/parse.y](https://github.com/justjake/sqlite3-parser-js/blob/main/vendor/patched/3.53.0/src/parse.y).
- Example dumped parse tables: [generated/3.53.0/parser.dev.json](https://github.com/justjake/sqlite3-parser-js/blob/main/generated/3.53.0/parser.dev.json).
- Our TypeScript emitter script: [scripts/emit-ts-parser.ts](https://github.com/justjake/sqlite3-parser-js/blob/main/scripts/emit-ts-parser.ts).
- The output TypeScript parser: [generated/3.53.0/parse.ts](https://github.com/justjake/sqlite3-parser-js/blob/main/generated/3.53.0/parse.ts).

To implement a SQLite parser in another language you need roughly:

1. **A lexer.** Eg our [`src/tokenize.ts`](https://github.com/justjake/sqlite3-parser-js/blob/main/src/tokenize.ts), SQLite's [src/tokenize.c](https://github.com/sqlite/sqlite/blob/master/src/tokenize.c) — ~1000 LoC.
2. **An LALR(1) driver.** Eg our [`src/lempar.ts`](https://github.com/justjake/sqlite3-parser-js/blob/main/src/lempar.ts), SQLite's [tool/lempar.c](https://github.com/sqlite/sqlite/blob/master/tool/lempar.c) — ~400 LoC. Consumes the tables in `parser.dev.json`, emits shift/reduce events.
3. **parse.y**, updated for your AST & language. Eg our [parse.y](https://github.com/justjake/sqlite3-parser-js/blob/main/vendor/patched/3.53.0/src/parse.y),SQLite's [parse.y](https://github.com/sqlite/sqlite/blob/master/src/parse.y). Start with one and replace action bodies with your own.

## Contributing

```tree
├── src/                        runtime (TypeScript)
│   ├── lempar.ts               LALR(1) engine — 1:1 port of sqlite/tool/lempar.c
│   ├── parser.ts               AST-building parser layered on lempar
│   ├── tokenize.ts             lexer — port of sqlite/src/tokenize.c
│   ├── util.ts                 pure helpers from sqlite/src/util.c, string unquoting
│   ├── errors.ts               Diagnostic / ParseError API + grammar-aware hints
│   ├── traverse.ts             ESTree-style AST walker + helpers
│   └── ast/                    AST definitions + helpers
│       ├── nodes.ts            every node interface, plus `AstNode` / `AstNodeMap`
│       ├── parseActions.ts     node constructors invoked from grammar actions
│       └── parseState.ts       per-parse mutable state threaded to the reducer
├── generated/                  codegen + tables (checked into git)
│   ├── current.ts              re-export shim for the default version
│   ├── <version>/              one directory per tracked SQLite release
│   │   ├── index.ts            per-version TS wrapper (codegen)
│   │   ├── parse.ts            LALR tables + per-rule reducer (codegen)
│   │   ├── parser.dev.json     full grammar dump (debug/introspection)
│   │   └── keywords.{dev,prod}.json
│   └── json-schema/v1/         formal JSON Schemas for the dumps
├── vendor/                     vendored SQLite sources + patches
│   ├── manifest.json           which versions we track, their hashes & commits
│   ├── upstream/<version>/     pristine SQLite sources
│   ├── patched/<version>/      our patched lemon.c + mkkeywordhash.c + parse.y
│   └── README.md               details on the vendor tree
├── scripts/                    build + maintenance tooling
│   ├── build.ts                bun build + tsc → dist/
│   ├── vendor.ts               onboard a new SQLite version
│   ├── emit-ts-parser.ts       parser.dev.json → generated/<ver>/parse.ts
│   ├── emit-version-modules.ts codegen the per-version TS wrappers
│   ├── slim-dump.ts            slim keywords.dev.json → keywords.prod.json
│   ├── json-schemas.ts         emit the JSON Schemas
│   ├── validate-json.ts        validate a dump against its schema
│   ├── diff-ast.ts             grammar-shape diff across two parser.dev dumps
│   ├── ast-coverage.ts         unhit-rule report for the AST layer
│   ├── bench.ts                micro-benchmarks (tokenize, parse, errors)
│   └── bench-compare.ts        Compare performance against other libraries
├── test/                       test suites
├── bin/                        standalone CLIs (sqlite3-parser, sqlite3-tokenizer)
└── Makefile                    pattern rules for the per-version build graph
```

Development commands:

| Command                  | Purpose                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| `bun run test`           | Run the full test suite.                                               |
| `bun run build`          | Produce `dist/` (bundled JS + colocated `.d.ts`).                      |
| `bun run typecheck`      | `tsc --noEmit` over source + tests + scripts.                          |
| `bun run bench`          | Run the internal benchmarks (tokenize, parse, error path).             |
| `bun run bench:compare`  | Compare performance against other libraries.                           |
| `bun run vendor <ref>`   | Onboard a new SQLite version (see below).                              |
| `make generated/<ver>/…` | Regenerate a specific output without re-running the whole vendor flow. |
| `make help`              | List every pattern target Make knows about.                            |

Anything touching the vendored SQLite sources is explained in [`vendor/README.md`](./vendor/README.md).

### Adding new SQLite versions

```sh
bun run vendor 3.55.0
```

This:

1. **Adds a submodule** at `vendor/submodule/3.55.0/` pointing at SQLite's GitHub mirror, checked out at tag `version-3.55.0`.
2. **Copies** `tool/{lemon.c, mkkeywordhash.c, lempar.c}` and `src/parse.y` into `vendor/upstream/3.55.0/`.
3. **3-way merges** our patches against the most recent previous version's patched + upstream, writing the result to `vendor/patched/3.55.0/`. On conflict the script leaves `<<<<<<<` markers in the patched file and exits non-zero; resolve by hand and re-run.
4. **Rebuilds the tools** (`build/lemon-3.55.0`, `build/mkkeywordhash-3.55.0`) and runs them to produce `generated/3.55.0/{parse.ts, parser.dev.json, keywords.{dev,prod}.json}`, validated against the JSON Schemas.
5. **Regenerates** `generated/3.55.0/index.ts` and `generated/current.ts`. The new version becomes the current one in `vendor/manifest.json`; old versions are preserved forever.

After the script reports success, review the merged patches, run `bun test`, and commit. The script never auto-commits — it's easy to bury a silent regression otherwise.

Flags: `--no-submodule --from <path>` bring your own SQLite source tree (useful for building against an unreleased development snapshot), `--commit <sha>` overrides the commit hash recorded in the manifest.

## Stability

- AST shape may change on minor versions before v1.0.0.
