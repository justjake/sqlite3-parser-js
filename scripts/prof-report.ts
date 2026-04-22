#!/usr/bin/env -S bun run
// scripts/prof-report.ts — summarise a V8 `.cpuprofile` as markdown.
//
// Reproduces the shape of Bun's `--cpu-prof-md` output so Node's CPU
// profiles (which lack a built-in markdown sidecar) can be analysed the
// same way:
//
//   * header: duration / samples / interval / distinct functions
//   * top-10 one-liner by self time
//   * hot-functions table by self time (self% / self ms / total% / total ms)
//
// Aggregation key is `(functionName, url, lineNumber)` — the same as
// Bun's.  Multiple V8 call-tree nodes that share a call-site collapse
// to one row; different call-sites of the same function stay split.
//
// Usage:
//   bun scripts/prof-report.ts <path.cpuprofile>
//   bun scripts/prof-report.ts <path.cpuprofile> > REPORT.md

import { readFileSync, writeFileSync } from "node:fs"

import { CliUsageError, runScript } from "./utils.ts"

interface CallFrame {
  functionName: string
  scriptId: string
  url: string
  lineNumber: number
  columnNumber: number
}

interface CpuProfileNode {
  id: number
  callFrame: CallFrame
  hitCount?: number
  children?: number[]
}

interface CpuProfile {
  nodes: CpuProfileNode[]
  startTime: number
  endTime: number
  samples: number[]
  timeDeltas: number[]
}

interface AggregatedFrame {
  key: string
  functionName: string
  url: string
  lineNumber: number
  selfUs: number
  totalUs: number
}

/** Build a node-id → node map and a parent-of relation. */
function indexNodes(profile: CpuProfile): {
  byId: Map<number, CpuProfileNode>
  parentOf: Map<number, number>
} {
  const byId = new Map<number, CpuProfileNode>()
  const parentOf = new Map<number, number>()
  for (const n of profile.nodes) {
    byId.set(n.id, n)
  }
  for (const n of profile.nodes) {
    for (const childId of n.children ?? []) {
      parentOf.set(childId, n.id)
    }
  }
  return { byId, parentOf }
}

/** Self time per node-id, in microseconds, from the sample stream. */
function computeSelfUsById(profile: CpuProfile): Map<number, number> {
  const selfUsById = new Map<number, number>()
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i]!
    const us = profile.timeDeltas[i] ?? 0
    selfUsById.set(id, (selfUsById.get(id) ?? 0) + us)
  }
  return selfUsById
}

/**
 * Aggregate the call-tree into one row per (functionName, url, line).
 * Self time is a straight sum.  Total time is computed by walking each
 * sample's ancestry once and adding its self-us to every *distinct*
 * ancestor frame-key — so recursion doesn't inflate the total beyond
 * 100 %.
 */
function aggregate(profile: CpuProfile): {
  frames: AggregatedFrame[]
  totalUs: number
  sampleCount: number
} {
  const { byId, parentOf } = indexNodes(profile)
  const selfUsById = computeSelfUsById(profile)

  const keyFor = (frame: CallFrame): string =>
    `${frame.functionName || "(anonymous)"}\0${frame.url}\0${frame.lineNumber}`

  const frames = new Map<string, AggregatedFrame>()
  function getFrame(node: CpuProfileNode): AggregatedFrame {
    const key = keyFor(node.callFrame)
    let f = frames.get(key)
    if (!f) {
      f = {
        key,
        functionName: node.callFrame.functionName || "(anonymous)",
        url: node.callFrame.url,
        lineNumber: node.callFrame.lineNumber,
        selfUs: 0,
        totalUs: 0,
      }
      frames.set(key, f)
    }
    return f
  }

  // Attribute self time.
  for (const [id, us] of selfUsById) {
    const node = byId.get(id)
    if (!node) continue
    getFrame(node).selfUs += us
  }

  // Attribute total time: each sample's self-us contributes to every
  // distinct ancestor frame-key.  "Distinct" prevents self-recursion
  // from double-counting when the same frame appears up the stack.
  for (const [id, us] of selfUsById) {
    const seen = new Set<string>()
    let cur: number | undefined = id
    while (cur !== undefined) {
      const node = byId.get(cur)
      if (!node) break
      const f = getFrame(node)
      if (!seen.has(f.key)) {
        f.totalUs += us
        seen.add(f.key)
      }
      cur = parentOf.get(cur)
    }
  }

  const totalUs = [...selfUsById.values()].reduce((a, b) => a + b, 0)
  return { frames: [...frames.values()], totalUs, sampleCount: profile.samples.length }
}

function fmtMs(us: number): string {
  const ms = us / 1_000
  if (ms < 10) return `${ms.toFixed(1)}ms`
  if (ms < 1_000) return `${ms.toFixed(1)}ms`
  return `${ms.toFixed(0)}ms`
}

function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

function shortLocation(url: string, lineNumber: number): string {
  if (!url) return "`[native code]`"
  // The V8 lineNumber is 0-based; Bun's report prints it 1-based.
  const line = lineNumber >= 0 ? `:${lineNumber + 1}` : ""
  return `\`${url}${line}\``
}

function renderMarkdown(profile: CpuProfile, topN: number): string {
  const { frames, totalUs, sampleCount } = aggregate(profile)
  const durationUs = profile.endTime - profile.startTime
  const intervalUs = sampleCount > 0 ? durationUs / sampleCount : 0

  frames.sort((a, b) => b.selfUs - a.selfUs)

  const lines: string[] = []
  lines.push("# CPU Profile")
  lines.push("")
  lines.push("| Duration | Samples | Interval | Functions |")
  lines.push("|----------|---------|----------|-----------|")
  lines.push(`| ${fmtMs(durationUs)} | ${sampleCount} | ${fmtMs(intervalUs)} | ${frames.length} |`)
  lines.push("")

  const top10 = frames
    .slice(0, 10)
    .map((f) => `\`${f.functionName}\` ${fmtPct(f.selfUs / totalUs)}`)
    .join(", ")
  lines.push(`**Top 10:** ${top10}`)
  lines.push("")

  lines.push("## Hot Functions (Self Time)")
  lines.push("")
  lines.push("| Self% | Self | Total% | Total | Function | Location |")
  lines.push("|------:|-----:|-------:|------:|----------|----------|")
  for (const f of frames.slice(0, topN)) {
    if (f.selfUs <= 0 && f.totalUs <= 0) continue
    lines.push(
      `| ${fmtPct(f.selfUs / totalUs)} | ${fmtMs(f.selfUs)} | ${fmtPct(f.totalUs / totalUs)} | ${fmtMs(f.totalUs)} | \`${f.functionName}\` | ${shortLocation(f.url, f.lineNumber)} |`,
    )
  }
  lines.push("")
  return lines.join("\n")
}

await runScript(
  import.meta.main,
  {
    usage:
      "usage: bun scripts/prof-report.ts <path.cpuprofile> [--out <path.md>] [--top <N>]\n" +
      "  --out  write the report to a file instead of stdout\n" +
      "  --top  max rows in the hot-functions table (default 60)",
    options: {
      out: { type: "string" },
      top: { type: "string" },
    },
  },
  ({ positionals, values }) => {
    const [input] = positionals
    if (!input) throw new CliUsageError("missing path to .cpuprofile")
    const topN = values.top ? Number(values.top) : 60
    if (!Number.isFinite(topN) || topN <= 0) {
      throw new CliUsageError(`--top must be a positive number`)
    }

    const profile = JSON.parse(readFileSync(input, "utf8")) as CpuProfile
    const md = renderMarkdown(profile, topN)

    if (values.out) {
      writeFileSync(values.out, md)
      process.stderr.write(`wrote ${values.out}\n`)
    } else {
      process.stdout.write(md)
    }
  },
)
