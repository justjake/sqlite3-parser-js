# sqlite3-parser

Parse SQLite query syntax.

- **Fast**: 1.5x-200x faster than other SQL parsers See [benchmarks](#benchmarks).
- **Light**: Pure JavaScript, no WebAssembly overhead. Ships ~22 KB gzipped and runs unchanged in Node, Bun, and the browser.
- **Faithful**: The parser based on [SQLite's `parse.y` grammar file](https://github.com/sqlite/sqlite/blob/master/src/parse.y) using a [patched version](https://github.com/justjake/sqlite3-parser-js/blob/main/vendor/patched/3.53.0/tool/lemon.c#L5231-L5238) of the [Lemon parser generator](https://sqlite.org/lemon.html) to emit [TypeScript code](https://github.com/justjake/sqlite3-parser-js/blob/main/generated/3.53.0/parse.ts).
- **Helpful**: Improved error messages, extending the canonical `near "X": syntax error` wording with source location, a list of terminals that would have been accepted, and a grammar-aware hint for common mistakes (unclosed groups with a pointer at the opener, trailing commas, keywords-used-as-identifiers, FILTER-before-OVER, etc.).

## Usage

```ts
import { parse } from "sqlite3-parser"

const result = parse("SELECT id, name FROM users WHERE active = 1")
if (result.status === "accepted") {
  const cmd = result.ast.cmds[0] // CmdList → first top-level command
  // cmd.type === "SelectStmt", walk from here
}
```

`ParseResult` is a discriminated union:

```ts
type ParseResult =
  | { status: "accepted"; ast: CmdList }
  | { status: "errored"; errors: readonly ParseError[] }
```

Errors come back as structured diagnostics. Call `err.format()` for a ready-to-print block with source code and carets, or read the fields directly:

```ts
const result = parse("SELECT FROM users")
if (result.status === "errored") {
  for (const err of result.errors) {
    console.error(err.format())
    // — or access fields:
    //   err.message    → "near \"FROM\": syntax error"
    //   err.span       → { offset, length, line, col }
    //   err.token      → the offending Token, when available
    //   err.hints      → readonly { message, span? }[]
  }
}
// near "FROM": syntax error
//
// At 1:7:
//    1│ SELECT FROM users
//     │        ^^^^
//
//   hint: expected a result expression before FROM
```

### Traversing the AST

`sqlite3-parser/traverse` exposes an ESTree-style walker. A depth-first walk fires `enter` on every node, recurses into child slots in their surface-syntax order, then fires `leave`:

```ts
import { parse } from "sqlite3-parser"
import { traverse } from "sqlite3-parser/traverse"

const { ast } = parse("SELECT a, b FROM t")
const tables: string[] = []

traverse(ast, {
  // All args optional.
  enter(node, parent) {
    // Runs before `nodes` handler on every node.
  },
  nodes: {
    // Runs before visiting children.
    TableSelectTable(node, _parent) {
      // QualifiedName.name → Name.name
      tables.push(node.name.name.name)
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
    SelectStmt: ["with", "select", "compounds"],
  },
})
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
    ~1.5x faster than liteparser (wasm)
    ~5x   faster than @guanmingchiu/sqlparser-ts (wasm)
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

Avg per-iteration parse time across the five inputs.

| Parser                              | `tiny`      | `small`     | `medium`    | `large`     | `deep`     |
| ----------------------------------- | ----------- | ----------- | ----------- | ----------- | ---------- |
| Ours                                | `1.52 µs`   | `4.36 µs`   | `22.96 µs`  | `68.24 µs`  | `11.57 µs` |
| `liteparser (wasm)`                 | `1.87 µs`   | `4.65 µs`   | `46.10 µs`  | `84.00 µs`  | `29.41 µs` |
| `@guanmingchiu/sqlparser-ts (wasm)` | `5.98 µs`   | `14.57 µs`  | `142.96 µs` | `184.17 µs` | `68.29 µs` |
| `node-sql-parser`                   | `9.95 µs`   | `24.41 µs`  | `262.60 µs` | `557.08 µs` | `1.07 ms`  |
| `pgsql-ast-parser`                  | `51.89 µs`  | `55.27 µs`  | `2.44 ms`   | `919.56 µs` | `1.02 ms`  |
| `sqlite-parser`                     | `424.35 µs` | `559.10 µs` | `4.91 ms`   | `6.75 ms`   | `2.98 ms`  |
| `@appland/sql-parser`               | `501.53 µs` | `640.94 µs` | `6.01 ms`   | `7.81 ms`   | `3.37 ms`  |

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
