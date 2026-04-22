#!/usr/bin/env -S bun run
// scripts/audit-ast-shapes.ts — audit AST object-literal constructor
// shapes for consistency.
//
// V8 and JSC both specialise on hidden-class / object-shape.  If the
// same AST `type` is constructed with different property orders across
// reducer arms (e.g. `BinaryExpr` as `{left, op, right}` one place and
// `{op, left, right}` another), the runtime falls off the monomorphic
// fast path and each construction costs more.  This script scans
// `src/ast/parseActions.ts` and `generated/<ver>/parse.ts` for every
// object literal whose first property is `type: "<Pascal>"` and flags
// any type whose literals use more than one distinct key ordering.
//
// Convention it relies on: AST literals start with `type` as their
// first property.  All of our constructors follow this today — the
// anchor regex wouldn't find a literal that puts `type` later, so
// fixing a violation first means reordering so `type` leads, then
// rerunning this script.
//
// Usage:
//   bun scripts/audit-ast-shapes.ts                # scan default files
//   bun scripts/audit-ast-shapes.ts src/foo.ts …   # scan specific files

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, rootRelativePath, runScript } from "./utils.ts"

interface FoundShape {
  file: string
  line: number
  typeName: string
  keys: string[]
}

function findAstShapes(src: string, file: string): FoundShape[] {
  const results: FoundShape[] = []
  const n = src.length

  const lineOf = new Array<number>(n + 1)
  let line = 1
  for (let j = 0; j < n; j++) {
    lineOf[j] = line
    if (src[j] === "\n") line++
  }
  lineOf[n] = line

  function skipStringOrComment(start: number): number {
    const c = src[start]
    if (c === '"' || c === "'" || c === "`") {
      let j = start + 1
      while (j < n && src[j] !== c) {
        if (src[j] === "\\") j++
        j++
      }
      return j + 1
    }
    if (c === "/" && src[start + 1] === "/") {
      let j = start + 2
      while (j < n && src[j] !== "\n") j++
      return j
    }
    if (c === "/" && src[start + 1] === "*") {
      let j = start + 2
      while (j < n - 1 && !(src[j] === "*" && src[j + 1] === "/")) j++
      return j + 2
    }
    return start + 1
  }

  function atStringOrCommentStart(j: number): boolean {
    const c = src[j]
    if (c === '"' || c === "'" || c === "`") return true
    if (c === "/" && (src[j + 1] === "/" || src[j + 1] === "*")) return true
    return false
  }

  // Walk the object literal body alternating between "expect key" and
  // "expect value" states; collect the top-level keys in source order.
  function extract(startIdx: number): { keys: string[]; endIdx: number } | undefined {
    let depth = 0
    let j = startIdx
    const keys: string[] = []
    const seen = new Set<string>()
    let mode: "key" | "value" = "key"

    while (j < n) {
      if (atStringOrCommentStart(j)) {
        j = skipStringOrComment(j)
        continue
      }
      const c = src[j]
      if (c === "{" || c === "[" || c === "(") {
        depth++
        j++
        continue
      }
      if (c === "}" || c === "]" || c === ")") {
        depth--
        if (c === "}" && depth === 0) return { keys, endIdx: j }
        if (c === "}" && mode === "value" && depth === 1) mode = "key"
        j++
        continue
      }
      if (depth === 1 && mode === "key") {
        if (/\s/.test(c!)) {
          j++
          continue
        }
        const rest = src.slice(j, j + 128)
        // `key:value`, or shorthand `key,` / `key}` / `key  $`.
        const m = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*(:|,|}|$)/.exec(rest)
        if (!m) {
          j++
          continue
        }
        const key = m[1]!
        if (!seen.has(key)) {
          keys.push(key)
          seen.add(key)
        }
        const delim = m[2]
        j += m[1]!.length
        while (j < n && /\s/.test(src[j]!)) j++
        if (delim === ":") {
          mode = "value"
          j++
        } else if (delim === ",") {
          j++
        }
        continue
      }
      if (depth === 1 && mode === "value" && c === ",") {
        mode = "key"
        j++
        continue
      }
      j++
    }
    return undefined
  }

  // Anchor on `{[ws]type[ws]:[ws]"<Pascal>"` — the AST literal pattern.
  // This bypasses context-based `{` detection (block-statement vs
  // object-literal expression) entirely: if the first property is
  // `type: "X"`, it's an AST literal.
  const anchorRe = /\{\s*type\s*:\s*"([A-Z][A-Za-z0-9_]*)"/g
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(src))) {
    const j = m.index
    if (insideStringOrComment(src, j)) continue
    const ext = extract(j)
    if (!ext) continue
    if (ext.keys.length > 15 || ext.keys.length < 2) continue
    if (!ext.keys.includes("type")) continue
    results.push({ file, line: lineOf[j]!, typeName: m[1]!, keys: ext.keys })
    anchorRe.lastIndex = ext.endIdx
  }
  return results
}

function insideStringOrComment(src: string, pos: number): boolean {
  // Re-walk from the top of the file to `pos` and return whether we're
  // currently inside a string or comment.  O(pos) per call is fine —
  // we only invoke it on anchor-regex hits, which are sparse.
  let i = 0
  while (i < pos) {
    const c = src[i]
    if (c === '"' || c === "'" || c === "`") {
      i++
      while (i < pos && src[i] !== c) {
        if (src[i] === "\\") i++
        i++
      }
      i++
      continue
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < pos && src[i] !== "\n") i++
      continue
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2
      while (i < pos - 1 && !(src[i] === "*" && src[i + 1] === "/")) i++
      i += 2
      continue
    }
    i++
  }
  return i > pos
}

const DEFAULT_FILES = ["src/ast/parseActions.ts", "generated/3.53.0/parse.ts"]

await runScript(
  import.meta.main,
  {
    usage: "usage: bun scripts/audit-ast-shapes.ts [file …]",
  },
  ({ positionals }) => {
    const files = positionals.length > 0 ? positionals : DEFAULT_FILES
    const byType = new Map<string, FoundShape[]>()
    for (const relOrAbs of files) {
      const abs = relOrAbs.startsWith("/") ? relOrAbs : join(REPO_ROOT, relOrAbs)
      const src = readFileSync(abs, "utf8")
      const rel = rootRelativePath(abs)
      const shapes = findAstShapes(src, rel)
      console.error(`[audit] ${rel}: ${shapes.length} AST literal(s)`)
      for (const r of shapes) {
        if (!byType.has(r.typeName)) byType.set(r.typeName, [])
        byType.get(r.typeName)!.push(r)
      }
    }

    const variants: Array<{ t: string; shapes: Array<[string, FoundShape[]]> }> = []
    for (const [t, sites] of byType) {
      const shapes = new Map<string, FoundShape[]>()
      for (const s of sites) {
        const shape = s.keys.join(",")
        if (!shapes.has(shape)) shapes.set(shape, [])
        shapes.get(shape)!.push(s)
      }
      if (shapes.size > 1) variants.push({ t, shapes: [...shapes.entries()] })
    }
    variants.sort((a, b) => b.shapes.length - a.shapes.length)

    console.log("=== AST types with multiple shape orderings ===\n")
    for (const v of variants) {
      const totalSites = v.shapes.reduce((acc, [, s]) => acc + s.length, 0)
      console.log(`${v.t} (${v.shapes.length} shapes across ${totalSites} sites):`)
      for (const [shape, sites] of v.shapes) {
        console.log(`  [${shape}]`)
        for (const s of sites.slice(0, 5)) {
          console.log(`    ${s.file}:${s.line}`)
        }
        if (sites.length > 5) console.log(`    … ${sites.length - 5} more`)
      }
      console.log()
    }

    console.log(`total distinct types with inconsistent shapes: ${variants.length}`)
    const allSites = [...byType.values()].reduce((a, b) => a + b.length, 0)
    console.log(
      `scan stats: ${byType.size} distinct types found across ${allSites} construction sites`,
    )

    const topHitters = [...byType.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 15)
    console.log("\ntop construction hotspots (type × site count):")
    for (const [t, sites] of topHitters) console.log(`  ${t}: ${sites.length}`)

    if (variants.length > 0) process.exit(1)
  },
)
