# sqlite3-parser

Parse SQLite query syntax into a concrete syntax tree (CST).

- **Light**: Pure JavaScript, no WebAssembly overhead. Ships ~22 KB gzipped and runs unchanged in Node, Bun, and the browser.
- **Faithful**: The parser is generated from [SQLite's `parse.y` grammar file](https://github.com/sqlite/sqlite/blob/master/src/parse.y) using a [patched version](https://github.com/justjake/sqlite3-parser-js/blob/main/vendor/patched/3.54.0/tool/lemon.c#L5231-L5238) of the [Lemon parser generator](https://sqlite.org/lemon.html). Uses the same LALR(1) parser state tables as SQLite itself.
- **Helpful**: Improved error messages, extending the canonical `near "X": syntax error` wording with source location, a list of terminals that would have been accepted, and a grammar-aware hint for common mistakes (unclosed groups, trailing commas, keywords-used-as-identifiers, FILTER-before-OVER, etc.).

## Usage

```ts
import { parse } from "sqlite3-parser"

const { cst, errors } = parse("SELECT id, name FROM users WHERE active = 1")
if (cst) {
  // cst.kind === 'rule', cst.name === 'input' — walk the tree from here.
}
```

Errors come back as structured diagnostics:

```ts
const { errors } = parse("SELECT FROM users")

for (const err of errors) {
  console.error(`${err.line}:${err.col}: ${err.canonical}`)
  if (err.hint) console.error(`  hint: ${err.hint}`)
  if (err.expected) console.error(`  expected: ${err.expected.join(", ")}`)
}
// 1:8: near "FROM": syntax error
//   hint: a SELECT list cannot start with the keyword "FROM"
//   expected: "*", "ALL", "DISTINCT", identifier, literal, …
```

Pin to a specific SQLite version by importing the subpath directly:

```ts
import { parse } from "sqlite3-parser/sqlite-3.54.0"
```

Every version we track ships both `parse(sql, opts?)` (convenience) and `createParser(opts?)` (advanced). Both accept the same tokenizer options, so you can enable non-default behavior like a custom digit separator or a pared-down keyword-flag set without reaching into internal modules. Internal AST scaffolding exists in `src/ast/`, but it is not yet part of the published API.

## Parse rules & porting

At runtime, the parser is driven by two JSON files per SQLite version:

| File                                     | Contents                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `generated/<version>/parser.prod.json`   | LALR(1) action/goto tables, symbol list, rule list — everything the state machine needs to drive a parse. |
| `generated/<version>/keywords.prod.json` | The SQL keyword table — maps keyword text to the terminal id the grammar expects.                         |

Both are **generated** from the upstream `tool/lemon.c` and `tool/mkkeywordhash.c` (patched to emit a machine-readable JSON dump alongside their usual C output — see [`vendor/README.md`](./vendor/README.md)). A `.dev.json` companion sits next to each `.prod.json` with the full un-slimmed dump: rule action-C source, symbol metadata, precedence tables, destructors. The `.dev.json` files are for debugging and introspection; the runtime reads `.prod.json`.

Every dump ships with a formal JSON Schema at `generated/json-schema/v1/<name>.schema.json`. The schemas are the single source of truth for the dump format and are validated in the Makefile's build graph, so a malformed dump never lands silently on disk.

### Porting to another language

The JSON dumps are self-contained: no SQLite sources, no C toolchain, no grammar semantics baked into the consumer. To implement a SQLite parser in another language you need roughly:

1. **A lexer.** Port `src/tokenize.ts` — ~700 lines of pure character-class dispatch plus a keyword-lookup table built from `keywords.prod.json`. It's a 1:1 port of SQLite's `src/tokenize.c`.
2. **An LALR(1) driver.** Port `src/lempar.ts` — ~400 lines, 1:1 with SQLite's `tool/lempar.c`. Consumes the tables in `parser.prod.json`, emits shift/reduce events.
3. **A reducer.** Our implementation builds a CST (see `src/parser.ts`); yours could build an AST, validate without building anything, or do semantic analysis as it goes — the driver is agnostic.

The JSON Schemas at `generated/json-schema/v1/` document every field the runtime reads. Any language with a JSON parser and typed integer arrays can consume them.

## Contributing

```tree
├── src/                        runtime (TypeScript)
│   ├── lempar.ts               LALR(1) engine — 1:1 port of sqlite/tool/lempar.c
│   ├── parser.ts               CST emitter layered on lempar
│   ├── tokenize.ts             lexer — port of sqlite/src/tokenize.c
│   ├── util.ts                 pure helpers from sqlite/src/util.c
│   ├── enhanceError.ts         grammar-aware error diagnostics
│   └── ast/                    CST → AST conversion (experimental, see Roadmap)
├── generated/                  codegen + JSON dumps (checked into git)
│   ├── current.ts              re-export shim for the default version
│   ├── <version>/              one directory per tracked SQLite release
│   │   ├── index.ts            per-version TS wrapper (codegen)
│   │   ├── parser.{dev,prod}.json
│   │   └── keywords.{dev,prod}.json
│   └── json-schema/v1/         formal JSON Schemas for the dumps
├── vendor/                     vendored SQLite sources + patches
│   ├── manifest.json           which versions we track, their hashes & commits
│   ├── upstream/<version>/     pristine SQLite sources
│   ├── patched/<version>/      our patched lemon.c + mkkeywordhash.c
│   └── README.md               details on the vendor tree
├── scripts/                    build + maintenance tooling
│   ├── build.ts                bun build + tsc → dist/
│   ├── vendor.ts               onboard a new SQLite version
│   ├── slim-dump.ts            .dev.json → .prod.json
│   ├── verify-slim.ts          smoke-test that slim and full dumps parse identically
│   ├── json-schemas.ts         emit the JSON Schemas
│   ├── validate-json.ts        validate a dump against its schema
│   ├── emit-version-modules.ts codegen the per-version TS wrappers
│   ├── diff-ast.ts             grammar-shape diff across two parser.dev dumps
│   └── ast-coverage.ts         unhit-rule report for the AST layer
├── test/                       test suites
│   ├── *.test.ts               unit tests
│   └── sqlite/*.test.ts        ports of SQLite tests
├── bin/                        standalone CLIs (sqlite3-parser, sqlite3-tokenizer)
└── Makefile                    pattern rules for the per-version build graph
```

Development commands:

| Command                  | Purpose                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| `bun run test`           | Run the full test suite.                                               |
| `bun run build`          | Produce `dist/` (bundled JS + colocated `.d.ts`).                      |
| `bun run typecheck`      | `tsc --noEmit` over source + tests + scripts.                          |
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
4. **Rebuilds the tools** (`build/lemon-3.55.0`, `build/mkkeywordhash-3.55.0`) and runs them to produce `generated/3.55.0/{parser,keywords}.{dev,prod}.json`, validated against the JSON Schemas.
5. **Regenerates** `generated/3.55.0/index.ts` and `generated/current.ts`. The new version becomes the current one in `vendor/manifest.json`; old versions are preserved forever.

After the script reports success, review the merged patches, run `bun test`, and commit. The script never auto-commits — it's easy to bury a silent regression otherwise.

Flags: `--no-submodule --from <path>` bring your own SQLite source tree (useful for building against an unreleased development snapshot), `--commit <sha>` overrides the commit hash recorded in the manifest.

### Roadmap

- **AST layer**. `src/ast/` contains internal scaffolding for CST → AST conversion: stable-key dispatch, a flat handler table in `src/ast/handlers.ts`, and `scripts/diff-ast.ts` / `scripts/ast-coverage.ts` for tracking grammar drift and coverage. The current fallback path returns `UnknownAstNode` for unhandled rules, and `test/ast.test.ts` verifies that the handler table still lines up with the current grammar.
- **More SQLite versions**. Currently pinned to 3.54.0. The `bun run vendor <ref>` workflow is designed to roll forward at minimum effort; expect periodic releases that track upstream.
- **libsql / other Lemon-using dialects**. The vendor tooling is structured to accept other Lemon-based grammars (the `generated/sqlite-<ver>/` subpath convention leaves room for `generated/libsql-<ver>/` siblings), but no other dialect is wired up yet.
