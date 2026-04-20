#!/usr/bin/env -S bun run
// scripts/build.ts — produce the shippable dist/ tree.
//
// Bun is used for JS bundling (fast, handles TS + JSON imports
// natively) and tsc is used for .d.ts emission (bun doesn't produce
// declarations and tsc is the source of truth for types anyway).
//
// Output layout:
//
//   dist/
//   ├── bin/
//   │   ├── sqlite3-parser.js      shipped CLI (shebang: node)
//   │   └── sqlite3-tokenizer.js   shipped CLI (shebang: node)
//   ├── generated/
//   │   ├── current.js             entry for `import 'sqlite3-parser'`
//   │   ├── current.d.ts           types (colocated with the .js)
//   │   └── <version>/
//   │       ├── index.js           entry for `/sqlite-<version>`.
//   │       │                      Bun inlines the prod JSON dumps
//   │       │                      into this bundle — consumers get
//   │       │                      them via the `PARSER_DUMP` and
//   │       │                      `KEYWORDS_DUMP` named exports.
//   │       └── index.d.ts         types
//   ├── src/
//   │   └── *.d.ts                 types only — runtime JS is inlined
//   │                              into bun's shared chunks below
//   └── chunk-*.js                 shared chunks (bun's splitting)
//
// NO JSON FILES SHIP with the package.  The prod dumps are inlined
// into the bundled JS, so a consumer doing
// `import { PARSER_DUMP } from 'sqlite3-parser/sqlite-3.54.0'` gets
// the same bytes that would have sat on disk.  The dev dumps (with
// rule action C source, full symbol metadata, etc.) aren't shipped
// at all — developers who need them can clone the repo and regenerate
// via `bun run vendor <ref>` or `make generated/<ver>/parser.dev.json`.
//
// `.js` and `.d.ts` are colocated per-file, matching the convention
// most npm packages follow.  Bun preserves the source tree relative
// to the project root; tsc emits declarations into the same tree with
// matching paths.  The only things without a sibling are src/*.d.ts —
// those are type-only because the runtime JS has been inlined into a
// shared chunk rather than getting its own per-file output.
//
// The runtime graph doesn't touch any Node built-in, so `target:
// 'browser'` produces JS that also runs on Node ≥ 18 and Bun without
// a per-platform build matrix.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { gzipSync } from "node:zlib"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const GENERATED = join(ROOT, "generated")
const BIN = join(ROOT, "bin")
const DIST = join(ROOT, "dist")

/**
 * Source CLIs that should be bundled and shipped as executables.
 * Paths are relative to BIN; outputs land at dist/bin/<name>.js.
 */
const BIN_ENTRIES = ["sqlite3-parser.ts", "sqlite3-tokenizer.ts"]

function log(msg: string): void {
  console.log(`[build] ${msg}`)
}

/**
 * List every `generated/<version>/` that looks like a version dir.
 * The version dirs start with a digit (e.g. `3.54.0`); other children
 * of generated/ — `current.ts`, `json-schema/` — are not versions.
 */
function discoverVersions(): string[] {
  return readdirSync(GENERATED)
    .filter((entry) => {
      const p = join(GENERATED, entry)
      return statSync(p).isDirectory() && /^\d/.test(entry)
    })
    .sort()
}

function clean(): void {
  rmSync(DIST, { recursive: true, force: true })
  mkdirSync(DIST, { recursive: true })
}

/**
 * Bundle every public entrypoint with Bun.  The caller supplies the
 * full list of version dirs; we add the cross-version `current.ts`
 * and point bun at the *project* root as its root so the output paths
 * preserve the full `generated/<version>/…` tree.  That lets tsc's
 * declarations (which also preserve the tree) colocate one-for-one
 * with the bundled JS per file.
 *
 * `splitting: true` extracts the shared src/ modules (parser,
 * tokenize, lempar, util) into common chunks rather than duplicating
 * them into every per-version bundle.
 */
async function buildJs(versions: string[]): Promise<void> {
  const entries = [
    join(GENERATED, "current.ts"),
    ...versions.map((v) => join(GENERATED, v, "index.ts")),
    ...BIN_ENTRIES.map((f) => join(BIN, f)),
  ]
  log(`bundling ${entries.length} entrypoint(s) with bun…`)

  const r = await Bun.build({
    entrypoints: entries,
    outdir: DIST,
    root: ROOT, // preserves `generated/…` in output paths
    target: "browser",
    format: "esm",
    splitting: true,
    sourcemap: "linked",
    // Minify whitespace + rename identifiers + drop dead code.  Gives
    // a meaningful reduction in raw bundle bytes; the gzipped delta is
    // smaller because gzip already squeezes whitespace and repetitive
    // identifiers.  Sourcemaps are emitted alongside so debuggers and
    // error reporters can still show original symbol names.
    minify: true,
    // Return {success,logs} instead of throwing an AggregateError on
    // failure — otherwise bun's per-file BuildMessages get swallowed
    // behind the generic "Bundle failed" top-level message.
    throw: false,
  })

  if (!r.success) {
    for (const msg of r.logs) console.error(String(msg))
    throw new Error(
      `bun build failed (${r.logs.length} diagnostic${r.logs.length === 1 ? "" : "s"})`,
    )
  }
  log(`  → ${r.outputs.length} output file(s)`)
}

/**
 * Rewrite each bundled CLI so it ships a portable node shebang and is
 * marked executable.  The source files carry `#!/usr/bin/env bun` for
 * dev ergonomics, but the shipped bundle targets plain node — consumers
 * who `npm install sqlite3-parser` are not expected to have bun.
 */
function finalizeBin(): void {
  const binDir = join(DIST, "bin")
  if (!existsSync(binDir)) return
  for (const entry of readdirSync(binDir)) {
    if (!entry.endsWith(".js")) continue
    const p = join(binDir, entry)
    const src = readFileSync(p, "utf8")
    const body = src.startsWith("#!") ? src.slice(src.indexOf("\n") + 1) : src
    writeFileSync(p, `#!/usr/bin/env node\n${body}`)
    chmodSync(p, 0o755)
  }
}

/**
 * Emit .d.ts files into `dist/` using tsc.  Tsc preserves the source
 * tree structure (generated/*.ts → dist/generated/*.d.ts, src/*.ts →
 * dist/src/*.d.ts), which matches what bun's JS output does above —
 * so `.js` and its corresponding `.d.ts` end up in the same directory.
 */
function buildTypes(): void {
  log("emitting declarations with tsc…")
  const r = spawnSync("bunx", ["tsc", "-p", "tsconfig.build.json"], {
    stdio: "inherit",
    cwd: ROOT,
  })
  if (r.status !== 0) throw new Error("tsc --emitDeclarationOnly failed")
}

// ---------------------------------------------------------------------------
// Size reporting.
// ---------------------------------------------------------------------------

/** Human-readable bytes, rounded to one decimal place for KB and up. */
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  return `${(n / 1024).toFixed(1)} KB`
}

/** Walk `dir` recursively, returning every non-sourcemap .js file. */
function walkJs(dir: string): string[] {
  const out: string[] = []
  const stack: string[] = [dir]
  while (stack.length) {
    const d = stack.pop()!
    for (const entry of readdirSync(d)) {
      const p = join(d, entry)
      if (statSync(p).isDirectory()) stack.push(p)
      else if (p.endsWith(".js")) out.push(p)
    }
  }
  return out
}

/**
 * Print the per-file size table and per-entrypoint effective totals.
 *
 * An "entrypoint" file is one that consumers name directly (matched to
 * package.json's `exports`); a "chunk" is bun's shared code extracted
 * by `splitting: true`.  We tell them apart by filename — bun emits
 * chunks as `chunk-<hash>.js`.
 *
 * The effective per-entrypoint size assumes every entry loads every
 * chunk.  This is exact for our current tree (one shared chunk serves
 * both entries) and over-reports for grammars where bun produces
 * multiple disjoint chunks — refine later if that changes.
 */
function reportSizes(): void {
  const jsFiles = walkJs(DIST).sort()
  const entries = jsFiles.filter((f) => !basename(f).startsWith("chunk-"))
  const chunks = jsFiles.filter((f) => basename(f).startsWith("chunk-"))

  // Pre-read to avoid hitting disk twice per file for raw + gzip calcs.
  const bytes = new Map<string, Buffer>()
  for (const f of jsFiles) bytes.set(f, readFileSync(f))

  log("")
  log("bundle sizes:")
  log(`  ${"file".padEnd(42)}  ${"raw".padStart(9)}  ${"gzipped".padStart(11)}`)
  for (const f of [...entries, ...chunks]) {
    const b = bytes.get(f)!
    const raw = b.byteLength
    const gz = gzipSync(b).byteLength
    log(
      `  ${relative(ROOT, f).padEnd(42)}  ` +
        `${fmtBytes(raw).padStart(9)}  ` +
        `(${fmtBytes(gz).padStart(8)} gz)`,
    )
  }

  if (entries.length === 0 || chunks.length === 0) return

  // Concatenate all chunks once — every entry's effective download is
  // "this entry" + "all the chunks" because (for now) every entry
  // transitively imports every chunk.
  const chunkBytes = Buffer.concat(chunks.map((c) => bytes.get(c)!))

  log("")
  log("effective entrypoint download (entry + shared chunks, gzipped):")
  for (const e of entries) {
    const combined = Buffer.concat([bytes.get(e)!, chunkBytes])
    const gz = gzipSync(combined).byteLength
    log(`  ${relative(ROOT, e).padEnd(42)}  ${fmtBytes(gz).padStart(9)} gz`)
  }
}

async function main(): Promise<void> {
  clean()
  const versions = discoverVersions()
  log(`versions: ${versions.join(", ") || "(none)"}`)
  if (versions.length === 0) {
    throw new Error("No versions found under generated/.  Run `bun run vendor <ref>` first.")
  }
  await buildJs(versions)
  finalizeBin()
  buildTypes()
  reportSizes()
  log("done.")
}

main().catch((err) => {
  // AggregateError (e.g. from Bun.build without throw:false) hides its
  // real diagnostics in `.errors` — surface each one before exiting.
  if (err instanceof AggregateError) {
    for (const inner of err.errors) console.error(String(inner))
    console.error(err.message)
  } else {
    console.error(err instanceof Error ? err.message : String(err))
  }
  process.exit(1)
})
