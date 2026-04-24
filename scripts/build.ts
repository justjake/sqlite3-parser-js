#!/usr/bin/env -S bun run
// scripts/build.ts — produce the shippable dist/ tree.
//
// No bundling.  `tsc -p tsconfig.build.json` emits a 1:1 mirror of
// the source tree: src/*.ts → dist/src/*.js (+ .d.ts, .js.map,
// .d.ts.map), generated/<ver>/*.ts → dist/generated/<ver>/*.js, and
// bin/*.ts → dist/bin/*.js.  `rewriteRelativeImportExtensions: true`
// (in tsconfig.build.json) swaps `.ts` import specifiers for `.js`
// so the emit resolves under Node's ESM loader.
//
// This script's remaining jobs:
//
//   1. `tsc` — delegated to the TypeScript compiler.
//   2. Swap the `#!/usr/bin/env bun` shebang on dist/bin/*.js for
//      `#!/usr/bin/env node` and `chmod +x` — consumers who
//      `npm install sqlite3-parser` are not expected to have bun.
//   3. Print a compact size report of the shipped JS, raw and gzipped.
//
// Output layout:
//
//   dist/
//   ├── bin/<name>.js          shipped CLIs (shebang: node)
//   ├── generated/
//   │   ├── current.js         entry for `import 'sqlite3-parser'`
//   │   └── <version>/
//   │       ├── index.js       entry for `./sqlite-<version>`
//   │       ├── parse.js       runtime parser tables (emitted)
//   │       └── keywords.js    runtime keyword tables (emitted)
//   └── src/                   the library, file-for-file with the
//                              source tree (including src/cli/run.js,
//                              which bin/ imports).
//
// No JSON files ship — `generated/<ver>/keywords.ts` embeds the
// keyword data as a typed const (see scripts/emit-keywords-module.ts).

import {
  chmodSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { gzipSync } from "node:zlib"

import { runScript } from "./utils.ts"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const DIST = join(ROOT, "dist")

function log(msg: string): void {
  console.log(`[build] ${msg}`)
}

function clean(): void {
  rmSync(DIST, { recursive: true, force: true })
}

/**
 * Run `tsc -p tsconfig.build.json`.  Tsc writes the whole dist/ tree
 * — .js, .d.ts, .js.map, .d.ts.map — in one pass.
 */
function buildTsc(): void {
  log("compiling with tsc…")
  const r = spawnSync("bunx", ["tsc", "-p", "tsconfig.build.json"], {
    stdio: "inherit",
    cwd: ROOT,
  })
  if (r.status !== 0) throw new Error("tsc failed")
}

/**
 * Rewrite each CLI's shebang to node and mark the file executable.
 * The source carries `#!/usr/bin/env bun` for dev ergonomics; the
 * shipped bundle runs on plain node.
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

// ---------------------------------------------------------------------------
// Size reporting.
// ---------------------------------------------------------------------------

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  return `${(n / 1024).toFixed(1)} KB`
}

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
 * Print a table of .js file sizes in dist/, split into "entries"
 * (paths named by package.json `exports` or under bin/) and
 * "library" (everything else, i.e. the internal modules pulled in
 * transitively).
 */
function reportSizes(): void {
  const jsFiles = walkJs(DIST).sort()
  if (jsFiles.length === 0) return

  const bytes = new Map<string, Buffer>()
  for (const f of jsFiles) bytes.set(f, readFileSync(f))

  const isEntry = (f: string): boolean => {
    const rel = relative(DIST, f)
    return (
      rel.startsWith("bin/") ||
      rel === "generated/current.js" ||
      /^generated\/[^/]+\/index\.js$/.test(rel) ||
      rel === "src/sqllogictest/public.js"
    )
  }

  log("")
  log("dist sizes:")
  log(`  ${"file".padEnd(48)}  ${"raw".padStart(9)}  ${"gzipped".padStart(11)}`)
  for (const f of jsFiles) {
    if (!isEntry(f)) continue
    const b = bytes.get(f)!
    log(
      `  ${relative(ROOT, f).padEnd(48)}  ` +
        `${fmtBytes(b.byteLength).padStart(9)}  ` +
        `(${fmtBytes(gzipSync(b).byteLength).padStart(8)} gz)`,
    )
  }

  const allRaw = Array.from(bytes.values()).reduce((n, b) => n + b.byteLength, 0)
  const allGz = Array.from(bytes.values()).reduce((n, b) => n + gzipSync(b).byteLength, 0)
  log("")
  log(
    `  ${"(all .js in dist/)".padEnd(48)}  ` +
      `${fmtBytes(allRaw).padStart(9)}  ` +
      `(${fmtBytes(allGz).padStart(8)} gz)  [${jsFiles.length} files]`,
  )
}

await runScript(import.meta.main, { usage: "usage: bun scripts/build.ts" }, async () => {
  clean()
  buildTsc()
  finalizeBin()
  reportSizes()
  log("done.")
})
