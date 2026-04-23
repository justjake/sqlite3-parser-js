#!/usr/bin/env -S bun run
// scripts/pick-sqllogictest-corpus.ts — greedy corpus picker.
//
// Walks vendor/submodule/sqllogictest/test/**/*.test, parses each
// file's SQL statements with a reducer that tracks rule-id hits, and
// greedy-picks the subset whose union maximises grammar coverage
// starting from the baseline already covered by the existing test
// suite (taken from coverage/rules.json if present, else empty).
//
// The picker never adds a file that contributes zero new rules, so
// the output is self-limiting.  It writes two artefacts:
//
//   * test/sqllogictest/corpus.txt  — the chosen submodule paths, one
//                                     per line, in selection order.
//   * stdout                        — per-pick log with "+N" rule gain.
//
// Wire the manifest into a Makefile rule that generates .test.ts
// files from each entry — see the comment block in Makefile next to
// sqllogictest-corpus for the evidence/ variant.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { rootPath, rootRelativePath, runScript } from "./utils.ts"
import { parseTest } from "../src/sqllogictest/testparser.ts"
import { parserModuleForGrammar } from "../src/parser.ts"
import * as parserDefs from "../generated/3.53.0/parse.ts"
import _keywordDefs from "../generated/3.53.0/keywords.prod.json" with { type: "json" }
import type { KeywordDefs } from "../src/tokenize.ts"
import type { ParseState } from "../src/ast/parseState.ts"
import type { LalrPopped, RuleId } from "../src/lempar.ts"

const SUBMODULE_ROOT = rootPath("vendor", "submodule", "sqllogictest", "test")
const MANIFEST_PATH = rootPath("test", "sqllogictest", "corpus.txt")
const BASELINE_PATH = rootPath("coverage", "rules.json")

// -------------------------------------------------------------------
// Rule-hit-tracking parser.  We clone parserDefs with a reducer that
// adds each ruleId into a per-run `Set` before delegating to the
// original.  The set is swapped in/out per call via a module-scope
// handle — cheaper than rebuilding the module.
// -------------------------------------------------------------------

let currentHits: Set<number> | undefined
const origReduce = parserDefs.reduce

function trackingReduce(state: ParseState, ruleId: RuleId, popped: LalrPopped<unknown>[]): unknown {
  if (currentHits !== undefined) currentHits.add(ruleId as unknown as number)
  return origReduce(state, ruleId, popped)
}

const mod = parserModuleForGrammar(
  { ...parserDefs, reduce: trackingReduce },
  _keywordDefs as KeywordDefs,
  {},
)

function collectHits(sql: string, into: Set<number>): void {
  currentHits = into
  try {
    mod.parse(sql)
  } catch {
    // `parse` returns errors as values, but a SQL string that blows
    // the stack or triggers an unrelated throw shouldn't kill the
    // scan.  Any rules that did fire before the throw are still in
    // `into`.
  }
  currentHits = undefined
}

// -------------------------------------------------------------------
// Filesystem walk.
// -------------------------------------------------------------------

function walkTestFiles(root: string): string[] {
  const out: string[] = []
  const queue: string[] = [root]
  while (queue.length > 0) {
    const dir = queue.pop()!
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) queue.push(full)
      else if (e.isFile() && e.name.endsWith(".test")) out.push(full)
    }
  }
  return out
}

// -------------------------------------------------------------------
// Baseline loader.  Read coverage/rules.json (produced by
// scripts/rule-coverage.ts --json) and take every rule with hits > 0
// as already-covered.  If the file doesn't exist, start from empty.
// -------------------------------------------------------------------

interface BaselineRule {
  id: number
  hits: number
}

function loadBaseline(): Set<number> {
  const covered = new Set<number>()
  try {
    const raw = readFileSync(BASELINE_PATH, "utf8")
    const parsed = JSON.parse(raw) as { rules: BaselineRule[] }
    for (const r of parsed.rules) if (r.hits > 0) covered.add(r.id)
  } catch {
    // no baseline
  }
  return covered
}

// -------------------------------------------------------------------
// Main.
// -------------------------------------------------------------------

await runScript(
  import.meta.main,
  {
    usage: "usage: bun scripts/pick-sqllogictest-corpus.ts [--limit <N>]",
    options: {
      limit: { type: "string" },
    },
  },
  ({ values }) => {
    const limit = values.limit === undefined ? Infinity : Number(values.limit)

    try {
      statSync(SUBMODULE_ROOT)
    } catch {
      console.error(
        `error: ${rootRelativePath(SUBMODULE_ROOT)} not found — ` +
          `run \`git submodule update --init vendor/submodule/sqllogictest\` first`,
      )
      process.exit(2)
    }

    const files = walkTestFiles(SUBMODULE_ROOT)
    console.error(`scanning ${files.length} .test files`)

    // Per-file rule hits.  We hold everything in memory — 622 files
    // × up-to-413 rule ids as a Set.  Worst case ~2 MB, fine.
    const fileRules = new Map<string, Set<number>>()
    let i = 0
    for (const f of files) {
      i++
      let source
      try {
        source = readFileSync(f, "utf8")
      } catch {
        continue
      }
      const res = parseTest({ source, filename: f, emitTrivia: false })
      const hits = new Set<number>()
      for (const r of res.records) {
        if (r.type !== "statement" && r.type !== "query") continue
        collectHits(r.sql, hits)
      }
      fileRules.set(rootRelativePath(f), hits)
      if (i % 50 === 0) {
        console.error(`  parsed ${i}/${files.length}`)
      }
    }

    const baseline = loadBaseline()
    console.error(`baseline covered: ${baseline.size} rules`)

    // Greedy set-cover.  On each iteration, pick the candidate with
    // the largest unique contribution over `covered`; stop when no
    // remaining file adds a new rule, or when we've hit --limit.
    const covered = new Set(baseline)
    const chosen: { path: string; added: number; total: number }[] = []
    const candidates = new Map(fileRules)
    while (chosen.length < limit) {
      let bestPath: string | undefined
      let bestGain = 0
      for (const [path, hits] of candidates) {
        let gain = 0
        for (const id of hits) if (!covered.has(id)) gain++
        if (gain > bestGain) {
          bestGain = gain
          bestPath = path
        }
      }
      if (bestPath === undefined || bestGain === 0) break
      const hits = candidates.get(bestPath)!
      for (const id of hits) covered.add(id)
      chosen.push({ path: bestPath, added: bestGain, total: covered.size })
      candidates.delete(bestPath)
    }

    console.error(
      `chose ${chosen.length} files; final coverage: ${covered.size} rules` +
        (baseline.size > 0 ? ` (+${covered.size - baseline.size} over baseline)` : ""),
    )

    const manifest = chosen.map((c) => c.path).join("\n") + "\n"
    writeFileSync(MANIFEST_PATH, manifest)
    console.error(`wrote manifest to ${rootRelativePath(MANIFEST_PATH)}`)

    console.log(`# chose ${chosen.length} files; final coverage: ${covered.size}/413`)
    for (const c of chosen) {
      console.log(`${c.path}  +${c.added}  (running ${c.total})`)
    }
  },
)
