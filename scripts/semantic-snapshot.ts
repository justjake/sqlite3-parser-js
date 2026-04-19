#!/usr/bin/env -S bun run
// scripts/semantic-snapshot.ts
//
// Track SQLite's parse-time validation actions (sqlite3ErrorMsg,
// sqlite3DequoteNumber, ASSERT_IS_CREATE) so that upstream changes
// to those action bodies fail the build instead of landing silently.
//
// The CST driver never executes parse.y's semantic actions, so SQL
// that upstream SQLite rejects at parse time (e.g.
// `CREATE TABLE t(x) WITHOUT frobnicate`) is accepted unless we port
// the check to src/semantic.ts.  This script is the drift alarm:
// it hashes every validation-bearing action body and compares to a
// committed snapshot.
//
// Usage:
//   bun scripts/semantic-snapshot.ts --check <ver>
//   bun scripts/semantic-snapshot.ts --write <ver>
//
// --check: fail non-zero if the current parser.dev.json disagrees with
//          generated/<ver>/semantic-actions.snapshot.json.  Wired into
//          the Makefile `gen` target.
// --write: regenerate the snapshot.  Run this by hand after updating
//          src/semantic.ts to cover the drift.

import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { buildSymbolName, stableKeyForRule } from "../src/ast/dispatch.ts"
import type { ParserDefs, ParserRule } from "../src/lempar.ts"

// Substrings in a rule's action-C that indicate parse-time validation
// upstream.  Any rule whose actionC contains at least one of these is
// tracked in the snapshot.  Broadening this list is a deliberate
// widening of the safety net.
const VALIDATION_PATTERNS = ["sqlite3ErrorMsg", "sqlite3DequoteNumber", "ASSERT_IS_CREATE"] as const

interface DevRule extends ParserRule {
  readonly actionC: string | null
  readonly noCode: boolean
}
interface DevDefs {
  readonly rules: readonly DevRule[]
  readonly symbols: ParserDefs["symbols"]
}

interface SnapshotEntry {
  readonly stableKey: string
  readonly ruleId: number
  readonly patterns: readonly string[]
  readonly hash: string
}
interface Snapshot {
  readonly sqliteVersion: string
  readonly schemaVersion: 1
  readonly entries: readonly SnapshotEntry[]
}

function devDefsPath(version: string): string {
  return `generated/${version}/parser.dev.json`
}
function snapshotPath(version: string): string {
  return `generated/${version}/semantic-actions.snapshot.json`
}

function computeSnapshot(version: string): Snapshot {
  const defs = JSON.parse(readFileSync(devDefsPath(version), "utf8")) as DevDefs
  const symbolName = buildSymbolName(defs)
  const entries: SnapshotEntry[] = []

  for (let i = 0; i < defs.rules.length; i++) {
    const rule = defs.rules[i]!
    const body = rule.actionC ?? ""
    const patterns = VALIDATION_PATTERNS.filter((p) => body.includes(p))
    if (patterns.length === 0) continue
    entries.push({
      stableKey: stableKeyForRule(rule, symbolName),
      ruleId: i,
      patterns,
      hash: createHash("sha256").update(body).digest("hex"),
    })
  }

  entries.sort((a, b) => a.stableKey.localeCompare(b.stableKey))
  return { sqliteVersion: version, schemaVersion: 1, entries }
}

interface Diff {
  readonly added: readonly SnapshotEntry[]
  readonly removed: readonly SnapshotEntry[]
  readonly changed: readonly { readonly before: SnapshotEntry; readonly after: SnapshotEntry }[]
}

function diffEntries(before: readonly SnapshotEntry[], after: readonly SnapshotEntry[]): Diff {
  const beforeByKey = new Map(before.map((e) => [e.stableKey, e]))
  const afterByKey = new Map(after.map((e) => [e.stableKey, e]))
  const added = after.filter((e) => !beforeByKey.has(e.stableKey))
  const removed = before.filter((e) => !afterByKey.has(e.stableKey))
  const changed: { before: SnapshotEntry; after: SnapshotEntry }[] = []
  for (const [key, a] of afterByKey) {
    const b = beforeByKey.get(key)
    if (b && b.hash !== a.hash) changed.push({ before: b, after: a })
  }
  return { added, removed, changed }
}

function usage(code: number): never {
  console.error("usage: bun scripts/semantic-snapshot.ts --check|--write <ver>")
  process.exit(code)
}

function main(): void {
  const [mode, version] = process.argv.slice(2)
  if (!version || (mode !== "--check" && mode !== "--write")) usage(2)

  if (!existsSync(devDefsPath(version))) {
    console.error(`missing ${devDefsPath(version)} — run \`make ${devDefsPath(version)}\` first`)
    process.exit(2)
  }

  const current = computeSnapshot(version)
  const outPath = snapshotPath(version)

  if (mode === "--write") {
    writeFileSync(outPath, `${JSON.stringify(current, null, 2)}\n`)
    console.log(`wrote ${outPath} (${current.entries.length} entries)`)
    return
  }

  if (!existsSync(outPath)) {
    console.error(
      `no snapshot at ${outPath}\n` +
        `run: bun scripts/semantic-snapshot.ts --write ${version}\n` +
        `then audit src/semantic.ts and commit both.`,
    )
    process.exit(1)
  }

  const committed = JSON.parse(readFileSync(outPath, "utf8")) as Snapshot
  const diff = diffEntries(committed.entries, current.entries)
  if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) return

  const print = (heading: string, keys: readonly string[]) => {
    if (keys.length === 0) return
    console.error(`\n## ${heading} (${keys.length})`)
    for (const k of [...keys].sort()) console.error(`  ${k}`)
  }

  console.error(`\nSemantic-action drift detected in ${devDefsPath(version)}:`)
  print(
    "Added (new upstream validation — needs a handler in src/semantic.ts)",
    diff.added.map((e) => e.stableKey),
  )
  print(
    "Removed (upstream dropped a validation — handler is dead)",
    diff.removed.map((e) => e.stableKey),
  )
  print(
    "Changed (action body edited — re-audit the handler)",
    diff.changed.map((c) => c.after.stableKey),
  )
  console.error(
    `\nAfter updating src/semantic.ts, adopt the drift with:\n` +
      `  bun scripts/semantic-snapshot.ts --write ${version}\n`,
  )
  process.exit(1)
}

main()
