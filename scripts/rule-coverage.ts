#!/usr/bin/env -S bun run
// scripts/rule-coverage.ts — grammar rule coverage report.
//
// Reads `coverage/lcov.info` (produced by `bun test --coverage
// --coverage-reporter=lcov`) and maps DA hit counts inside
// `generated/<ver>/parse.ts` back to Lemon rule ids.
//
// Mechanism: each rule in the generated reducer's `switch (ruleId)`
// gets exactly one `case N:` label, even when a Lemon fallthrough
// group shares one action body.  Bun's v8 coverage emits a DA record
// for each case label line independently, so a zero count on the
// label line means that specific rule never fired — even if a
// fallthrough sibling did fire and hit the shared body.
//
// Exit code is non-zero if any rule has zero hits, so this script can
// gate CI once corpus coverage is complete.  Until then, run with
// `--list` to see the missing rules.
//
// Usage:
//   bun scripts/rule-coverage.ts                     # summary only
//   bun scripts/rule-coverage.ts --list              # + every uncovered rule
//   bun scripts/rule-coverage.ts --json coverage/rules.json
//   bun scripts/rule-coverage.ts --no-fail           # always exit 0 (for local dev)

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { CliUsageError, rootPath, rootRelativePath, runScript } from "./utils.ts"

// -------------------------------------------------------------------
// Inputs.
// -------------------------------------------------------------------

const LCOV_PATH = rootPath("coverage", "lcov.info")
const MANIFEST_PATH = rootPath("vendor", "manifest.json")

interface Manifest {
  current: string
}

function loadCurrentVersion(): string {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest
  return manifest.current
}

interface Rule {
  id: number
  lhsName: string
  line: number // line in parse.y
  nrhs: number
  rhs: { name: string }[]
  noCode: boolean
  canReduce: boolean
  neverReduce: boolean
}

function loadRules(version: string): Rule[] {
  const path = rootPath("generated", version, "parser.dev.json")
  const raw = JSON.parse(readFileSync(path, "utf8")) as { rules: Rule[] }
  return raw.rules
}

// -------------------------------------------------------------------
// LCOV parsing.  The format is line-oriented; we only care about
// `SF:` (start of a file section) and `DA:<line>,<count>[,<checksum>]`
// records inside the parse.ts section.  `end_of_record` terminates
// each file section.
// -------------------------------------------------------------------

function loadLcovHits(lcovPath: string, targetRel: string): Map<number, number> | undefined {
  if (!existsSync(lcovPath)) return undefined
  const raw = readFileSync(lcovPath, "utf8")
  const hits = new Map<number, number>()
  let inSection = false
  let sectionsSeen = 0
  for (const line of raw.split("\n")) {
    if (line.startsWith("SF:")) {
      const sf = line.slice(3).trim()
      // Match on exact string or trailing-path — Bun emits paths
      // relative to cwd, but be robust to absolute paths or other
      // workspace roots.
      inSection = sf === targetRel || sf.endsWith(`/${targetRel}`)
      if (inSection) sectionsSeen++
      continue
    }
    if (line === "end_of_record") {
      inSection = false
      continue
    }
    if (!inSection) continue
    if (line.startsWith("DA:")) {
      const body = line.slice(3)
      const comma = body.indexOf(",")
      if (comma < 0) continue
      const lineNo = Number(body.slice(0, comma))
      // `body` may be "<line>,<count>" or "<line>,<count>,<checksum>".
      const tail = body.slice(comma + 1)
      const comma2 = tail.indexOf(",")
      const countStr = comma2 < 0 ? tail : tail.slice(0, comma2)
      const count = Number(countStr)
      if (Number.isFinite(lineNo) && Number.isFinite(count)) {
        hits.set(lineNo, count)
      }
    }
  }
  if (sectionsSeen === 0) return undefined
  return hits
}

// -------------------------------------------------------------------
// Scan parse.ts for `case <N>:` labels.  Each rule gets exactly one
// case label; fallthrough groups stack consecutive case labels ahead
// of a shared body (`case 6:\n    case 7: { … }`), but every id is
// still a distinct label line.
// -------------------------------------------------------------------

function loadCaseLabels(parseTsAbs: string): Map<number, number> {
  const src = readFileSync(parseTsAbs, "utf8")
  const labels = new Map<number, number>()
  const lines = src.split("\n")
  const re = /^\s+case\s+(\d+):/
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]!)
    if (!m) continue
    labels.set(Number(m[1]), i + 1)
  }
  return labels
}

// -------------------------------------------------------------------
// Reporting helpers.
// -------------------------------------------------------------------

function formatRuleLine(r: Rule): string {
  const rhs = r.nrhs === 0 ? "(empty)" : r.rhs.map((s) => s.name).join(" ")
  return `#${String(r.id).padStart(3, " ")}  ${r.lhsName} ::= ${rhs}  (parse.y:${r.line})`
}

interface PerRule {
  rule: Rule
  caseLine: number | undefined
  hits: number
}

function buildReport(
  rules: Rule[],
  labels: Map<number, number>,
  hits: Map<number, number>,
): PerRule[] {
  return rules.map((rule) => {
    const caseLine = labels.get(rule.id)
    const count = caseLine !== undefined ? (hits.get(caseLine) ?? 0) : 0
    return { rule, caseLine, hits: count }
  })
}

// -------------------------------------------------------------------
// Main.
// -------------------------------------------------------------------

await runScript(
  import.meta.main,
  {
    usage: "usage: bun scripts/rule-coverage.ts [--list] [--json <path>] [--no-fail]",
    options: {
      list: { type: "boolean" },
      json: { type: "string" },
      "no-fail": { type: "boolean" },
    },
  },
  ({ values }) => {
    const version = loadCurrentVersion()
    const parseTsRel = `generated/${version}/parse.ts`
    const parseTsAbs = rootPath(parseTsRel)

    const hits = loadLcovHits(LCOV_PATH, parseTsRel)
    if (!hits) {
      throw new CliUsageError(
        `no coverage section for ${parseTsRel} in ${rootRelativePath(LCOV_PATH)} — ` +
          `run \`bun test --coverage --coverage-reporter=lcov --path-ignore-patterns='vendor/**'\` first`,
      )
    }

    const rules = loadRules(version)
    const labels = loadCaseLabels(parseTsAbs)

    if (labels.size !== rules.length) {
      console.error(
        `warning: found ${labels.size} case labels in ${parseTsRel}, expected ${rules.length}`,
      )
    }
    for (const r of rules) {
      if (!labels.has(r.id)) {
        console.error(`warning: rule ${r.id} (${r.lhsName}) has no case label in ${parseTsRel}`)
      }
    }

    const report = buildReport(rules, labels, hits)
    const missing = report.filter((r) => r.hits === 0)
    const covered = report.length - missing.length
    const pct = report.length === 0 ? 0 : (100 * covered) / report.length

    console.log(`Rule coverage — parser ${version}`)
    console.log(`  Total rules:  ${report.length}`)
    console.log(`  Covered:      ${covered}  (${pct.toFixed(1)}%)`)
    console.log(`  Uncovered:    ${missing.length}`)
    console.log()

    if (missing.length > 0) {
      const byLhs = new Map<string, PerRule[]>()
      for (const m of missing) {
        const bucket = byLhs.get(m.rule.lhsName) ?? []
        bucket.push(m)
        byLhs.set(m.rule.lhsName, bucket)
      }
      const top = [...byLhs.entries()].sort((a, b) => b[1].length - a[1].length)

      console.log(`Uncovered rules by LHS (top 15):`)
      for (const [lhs, arr] of top.slice(0, 15)) {
        console.log(`  ${lhs.padEnd(24)} ${arr.length}`)
      }
      console.log()

      if (values.list) {
        console.log(`All uncovered rules:`)
        for (const m of missing) console.log(`  ${formatRuleLine(m.rule)}`)
        console.log()
      } else {
        console.log(`(re-run with --list to see every uncovered rule)`)
        console.log()
      }
    }

    if (values.json) {
      const out = {
        version,
        generatedFile: parseTsRel,
        totalRules: report.length,
        covered,
        uncovered: missing.length,
        rules: report.map((p) => ({
          id: p.rule.id,
          lhsName: p.rule.lhsName,
          rhs: p.rule.rhs.map((s) => s.name),
          parseYLine: p.rule.line,
          caseLine: p.caseLine,
          hits: p.hits,
          noCode: p.rule.noCode,
        })),
      }
      const dest = resolve(values.json)
      writeFileSync(dest, JSON.stringify(out, null, 2) + "\n")
      console.log(`JSON report written to ${rootRelativePath(dest)}`)
    }

    if (missing.length > 0 && !values["no-fail"]) {
      process.exit(1)
    }
  },
)
