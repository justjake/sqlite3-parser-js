# sqlite3-parser

Parse SQLite query syntax.
Surprisingly fast, hopefully correct SQLite SQL parser.

- **Fast**: N.NNx faster than liteparser WASM (bridging overhead), N.NNx faster than sqlite-parser, N.NNx faster than @appland/sql-parser. See [benchmarks](#benchmarks).
- **Light**: Pure JavaScript, no WebAssembly overhead. Ships ~22 KB gzipped and runs unchanged in Node, Bun, and the browser.
- **Faithful**: The parser is generated from [SQLite's `parse.y` grammar file](https://github.com/sqlite/sqlite/blob/master/src/parse.y) using a [patched version](https://github.com/justjake/sqlite3-parser-js/blob/main/vendor/patched/3.53.0/tool/lemon.c#L5231-L5238) of the [Lemon parser generator](https://sqlite.org/lemon.html).
- **Helpful**: Improved error messages, extending the canonical `near "X": syntax error` wording with source location, a list of terminals that would have been accepted, and a grammar-aware hint for common mistakes (unclosed groups with a pointer at the opener, trailing commas, keywords-used-as-identifiers, FILTER-before-OVER, etc.).

## Usage

```ts
import { parse } from "sqlite3-parser"

const result = parse("SELECT id, name FROM users WHERE active = 1")
if (result.status === "accepted") {
  const cmd = result.ast.cmds[0] // CmdList → first top-level command
  // cmd.kind === "SelectStmt", walk from here
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
    }
  },
  leave(node, parent) {
    // Runs after visiting children.
  },
  keys: {
    // Override traversal order & keys for a specific node type.
    SelectStmt: ["with", "select", "compounds"],
  }
})
```

A few things worth knowing:

- **Per-kind handlers.** Instead of a single `enter` with a big switch, pass `nodes: { SelectStmt(node) { … }, BinaryExpr(node, parent) { … }, … }`. Each handler is strongly typed to that kind.
- **Visit control.** Callbacks may return `"skip"` to stop descending into the current node (but still fire `leave`), `"break"` to halt the whole walk, or nothing / `"continue"` to proceed.
- **Visitor keys.** `VisitorKeys` is the per-kind list of child-bearing property names in traversal order. You can pass `keys: { CaseExpr: ["base", "elseExpr"] }` to override traversal for specific kinds per call.
- **Parent tracking.** Callbacks receive `(node, parent)` where parent is the enclosing AST node, or `undefined` at the root.

The type `AstNodeMap` maps every `kind` discriminator string to its interface. `traverse` uses that map to type per-kind handlers; user code can too — e.g. `type NodeOfKind<K extends keyof AstNodeMap> = AstNodeMap[K]`.

## Parse rules & porting

At runtime, the parser is driven by JSON tables (for keywords) and emitted TypeScript (for the LALR reducer) per SQLite version:

| File                                     | Contents                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `generated/<version>/parse.ts`           | LALR(1) action/goto tables, symbol list, rule list, and the per-rule reducer that builds the AST. Self-contained module; no deps. |
| `generated/<version>/keywords.prod.json` | The SQL keyword table — maps keyword text to the terminal id the grammar expects.                                                  |

The parser tables and reducer are **generated** from the upstream `tool/lemon.c`, `tool/mkkeywordhash.c`, and `src/parse.y` (the first two patched to emit a machine-readable JSON dump alongside their usual output — see [`vendor/README.md`](./vendor/README.md)). A `generated/<version>/parser.dev.json` sits alongside with the full un-slimmed grammar dump: rule action-C source, symbol metadata, precedence tables, destructors. `parser.dev.json` is for debugging and introspection; `parse.ts` is what the runtime actually loads.

`parser.dev.json` ships with a formal JSON Schema at `generated/json-schema/v1/parser.dev.schema.json`, validated in the Makefile's build graph so a malformed dump never lands silently on disk.

### Porting to another language

The dumps + grammar file are self-contained: no SQLite sources, no C toolchain required by the consumer. To implement a SQLite parser in another language you need roughly:

1. **A lexer.** Port `src/tokenize.ts` — ~1000 lines of pure character-class dispatch plus a keyword-lookup table built from `keywords.prod.json`. It's a 1:1 port of SQLite's `src/tokenize.c`.
2. **An LALR(1) driver.** Port `src/lempar.ts` — ~400 lines, 1:1 with SQLite's `tool/lempar.c`. Consumes the tables in `parser.dev.json`, emits shift/reduce events.
3. **A reducer.** Our implementation runs the action bodies verbatim from the grammar file to build the AST defined in `src/ast/nodes.ts`. Yours could target any shape: a flat IR, semantic analysis on the fly, or nothing at all — the driver is agnostic.

The JSON Schemas at `generated/json-schema/v1/` document every field the runtime reads. Any language with a JSON parser and typed integer arrays can consume them.

## Contributing

```tree
├── src/                        runtime (TypeScript)
│   ├── lempar.ts               LALR(1) engine — 1:1 port of sqlite/tool/lempar.c
│   ├── parser.ts               AST-building parser layered on lempar
│   ├── tokenize.ts             lexer — port of sqlite/src/tokenize.c
│   ├── util.ts                 pure helpers from sqlite/src/util.c
│   ├── errors.ts               Diagnostic / ParseError API + grammar-aware hints
│   ├── traverse.ts             ESTree-style AST walker (`sqlite3-parser/traverse`)
│   └── ast/                    AST definitions + helpers
│       ├── nodes.ts            every node interface, plus `AstNode` / `AstNodeMap`
│       ├── parseActions.ts     node constructors invoked from grammar actions
│       ├── parseState.ts       per-parse mutable state threaded to the reducer
│       └── printer.ts          AST → indented s-expression (used by `bin`)
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
│   └── bench-compare.ts        ours vs liteparser / sqlite-parser / @appland
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
| `bun run bench:compare`  | Four-way comparison: ours vs liteparser, sqlite-parser, @appland.      |
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
