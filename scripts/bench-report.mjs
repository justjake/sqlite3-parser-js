// Shared reporting helpers for the two bench-compare harnesses:
//
//   * scripts/bench-compare.ts   — full dev-time bench (includes
//                                  liteparser WASM from vendor/)
//   * dist-test/bench-compare.mjs — consumer-shape bench against the
//                                   published package tarball
//
// Only the *competitor set* and *parser setup* differ between the two
// harnesses. Everything downstream — aggregating mitata trials, laying
// out markdown / ASCII tables, formatting parser metadata — is pure
// string formatting that doesn't care which competitors ran, so it
// lives here once and both harnesses import from it.
//
// Kept as plain `.mjs` (not `.ts`) so Node can load it directly at
// dist-test runtime; Bun and the TypeScript source tree can both
// import .mjs without ceremony.

/**
 * @typedef {Object} TrialStats
 * @property {number} avg
 */

/**
 * @typedef {Object} TrialRun
 * @property {TrialStats} [stats]
 */

/**
 * @typedef {Object} Trial
 * @property {string} alias
 * @property {readonly TrialRun[]} runs
 */

/**
 * @typedef {Object} PkgInfo
 * @property {string} name
 * @property {string} [version]
 * @property {string} [description]
 * @property {string} [homepage]
 * @property {string | { url?: string }} [repository]
 */

/**
 * @typedef {Object} CompetitorMeta
 * @property {string} label
 * @property {PkgInfo} pkg
 */

/**
 * Walk a mitata `benchmarks` list and produce `{label, competitor, avg}`
 * rows. `alias` looks like `"<label> / <competitor>"`; split on the
 * last ` / ` so labels containing slashes survive.
 * @param {readonly Trial[]} benchmarks
 * @returns {{label: string, competitor: string, avg: number}[]}
 */
function extractTrials(benchmarks) {
  const out = []
  for (const t of benchmarks) {
    const idx = t.alias.lastIndexOf(" / ")
    if (idx < 0) continue
    const avg = t.runs[0]?.stats?.avg
    if (avg === undefined) continue
    out.push({ label: t.alias.slice(0, idx), competitor: t.alias.slice(idx + 3), avg })
  }
  return out
}

const BASELINE = "ours"

/**
 * Markdown table matching the `### Results` block in README.md: rows
 * are parsers, columns are inputs, each non-baseline cell carries a
 * `(N.N×)` slowdown factor relative to `ours`. Intended as a copy-
 * paste-into-README summary at the top of `bench-compare --md`.
 * @param {readonly Trial[]} benchmarks
 */
export function printReadmeSummaryTable(benchmarks) {
  const trials = extractTrials(benchmarks)
  if (trials.length === 0) return

  const labels = [...new Set(trials.map((t) => t.label))]
  const byKey = new Map()
  for (const t of trials) byKey.set(`${t.label}\0${t.competitor}`, t.avg)

  // Order competitors the way the README does: baseline first, then
  // the rest sorted by geometric mean of avg-time across inputs so the
  // fastest-next-to-ours lands near the top. Geometric mean because
  // sizes span four orders of magnitude (ns to ms) and an arithmetic
  // mean would be dominated by LARGE/MEDIUM.
  const allCompetitors = [...new Set(trials.map((t) => t.competitor))]
  const geomean = (/** @type {string} */ c) => {
    let log = 0
    let n = 0
    for (const l of labels) {
      const v = byKey.get(`${l}\0${c}`)
      if (v !== undefined && v > 0) {
        log += Math.log(v)
        n++
      }
    }
    return n === 0 ? Infinity : Math.exp(log / n)
  }
  const competitors = [
    ...(allCompetitors.includes(BASELINE) ? [BASELINE] : []),
    ...allCompetitors.filter((c) => c !== BASELINE).sort((a, b) => geomean(a) - geomean(b)),
  ]

  // README uses the short label (strip `" (..."` qualifier on LARGE / DEEP).
  const shortInput = (/** @type {string} */ l) => l.split(" (")[0]
  const parserDisplay = (/** @type {string} */ c) => (c === BASELINE ? "Ours" : `\`${c}\``)

  const oursByLabel = new Map()
  for (const l of labels) {
    const a = byKey.get(`${l}\0${BASELINE}`)
    if (a !== undefined) oursByLabel.set(l, a)
  }

  const header = ["Parser", ...labels.map((l) => `\`${shortInput(l)}\``)]
  const rows = [header]
  for (const c of competitors) {
    const row = [parserDisplay(c)]
    for (const l of labels) {
      const avg = byKey.get(`${l}\0${c}`)
      if (avg === undefined) {
        row.push("—")
        continue
      }
      const base = oursByLabel.get(l)
      if (c === BASELINE || base === undefined) {
        row.push(`\`${formatAvgReadme(avg)}\``)
      } else {
        row.push(`\`${formatAvgReadme(avg)}\` (${formatRatioShort(avg / base)})`)
      }
    }
    rows.push(row)
  }

  const widths = header.map((_, col) => Math.max(...rows.map((r) => r[col].length)))
  const padCell = (/** @type {string} */ s, /** @type {number} */ w) =>
    s + " ".repeat(Math.max(0, w - s.length))
  const formatRow = (/** @type {readonly string[]} */ r) =>
    "| " + r.map((cell, i) => padCell(cell, widths[i])).join(" | ") + " |"

  const print = (/** @type {string} */ s) => process.stdout.write(s + "\n")
  print("### Results (README-compatible summary)")
  print("")
  print(
    "Avg per-iteration parse time across the five inputs. Parentheticals show the slowdown factor vs ours (lower = closer to ours; ours is the baseline so it has no parenthetical).",
  )
  print("")
  print(formatRow(header))
  print("| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |")
  for (const r of rows.slice(1)) print(formatRow(r))
}

/**
 * Per-input aggregate table. Markdown when `md` is true, ASCII box
 * characters otherwise. Covers every competitor that produced a trial.
 * @param {readonly Trial[]} benchmarks
 * @param {boolean} [md]
 */
export function printAggregateTable(benchmarks, md = false) {
  const trials = extractTrials(benchmarks)
  if (trials.length === 0) return

  const labels = [...new Set(trials.map((t) => t.label))]
  const allCompetitors = [...new Set(trials.map((t) => t.competitor))]
  const byKey = new Map()
  for (const t of trials) byKey.set(`${t.label}\0${t.competitor}`, t.avg)

  const cols = [{ header: "input", cell: (/** @type {string} */ l) => l }]
  for (const c of allCompetitors) {
    cols.push({
      header: c,
      cell: (/** @type {string} */ l) => formatAvg(byKey.get(`${l}\0${c}`)),
    })
    if (c !== BASELINE) {
      cols.push({
        header: `vs ${BASELINE}`,
        cell: (/** @type {string} */ l) => formatRatio(byKey, l, c, BASELINE),
      })
    }
  }

  const print = (/** @type {string} */ s) => process.stdout.write(s + "\n")
  print("")
  if (md) {
    print("### aggregate (avg / iter)")
    print("")
    print("| " + cols.map((c) => c.header).join(" | ") + " |")
    print("| " + cols.map(() => "---").join(" | ") + " |")
    for (const l of labels) print("| " + cols.map((c) => c.cell(l)).join(" | ") + " |")
    return
  }

  const widths = cols.map((c) =>
    Math.max(c.header.length, ...labels.map((l) => stripAnsi(c.cell(l)).length)),
  )
  const rule = widths.map((w) => "─".repeat(w)).join("─┼─")
  const join = (/** @type {readonly string[]} */ parts) =>
    parts.map((p, i) => padEnd(p, widths[i])).join(" │ ")

  print("aggregate (avg / iter)")
  print(join(cols.map((c) => c.header)))
  print(rule)
  for (const l of labels) print(join(cols.map((c) => c.cell(l))))
}

/**
 * Markdown bullet list of "parsers under test", with homepage / repo
 * links and the installed package version.
 * @param {readonly CompetitorMeta[]} parsers
 */
export function printParserHeader(parsers) {
  const print = (/** @type {string} */ s) => process.stdout.write(s + "\n")
  print("## parsers under test")
  print("")
  for (const c of parsers) {
    const pkg = c.pkg
    const version = pkg.version ? ` \`${pkg.version}\`` : ""
    const link = packageLink(pkg)
    const name = link ? `[\`${pkg.name}\`](${link})` : `\`${pkg.name}\``
    const desc = pkg.description ? ` — ${pkg.description}` : ""
    print(`- **${c.label}**: ${name}${version}${desc}`)
  }
  print("")
}

/** @param {PkgInfo} pkg */
function packageLink(pkg) {
  if (pkg.homepage) return pkg.homepage
  const repo = pkg.repository
  if (!repo) return undefined
  const raw = typeof repo === "string" ? repo : repo.url
  if (!raw) return undefined
  return normalizeRepoUrl(raw)
}

/** @param {string} raw */
function normalizeRepoUrl(raw) {
  let url = raw.replace(/^git\+/, "").replace(/\.git$/, "")
  const sshMatch = url.match(/^git@([^:]+):(.+)$/)
  if (sshMatch) url = `https://${sshMatch[1]}/${sshMatch[2]}`
  return url
}

/**
 * @param {number | undefined} avg
 */
export function formatAvg(avg) {
  if (avg === undefined) return "—"
  if (avg < 1_000) return `${avg.toFixed(1)} ns`
  if (avg < 1_000_000) return `${(avg / 1_000).toFixed(2)} µs`
  if (avg < 1_000_000_000) return `${(avg / 1_000_000).toFixed(2)} ms`
  return `${(avg / 1_000_000_000).toFixed(2)} s`
}

/**
 * Like formatAvg but always µs/ms/s (no ns) and two decimals. Matches
 * the README's `### Results` table convention so the summary is a
 * drop-in paste.
 * @param {number} avg
 */
export function formatAvgReadme(avg) {
  if (avg < 1_000_000) return `${(avg / 1_000).toFixed(2)} µs`
  if (avg < 1_000_000_000) return `${(avg / 1_000_000).toFixed(2)} ms`
  return `${(avg / 1_000_000_000).toFixed(2)} s`
}

/**
 * @param {Map<string, number>} byKey
 * @param {string} label
 * @param {string} competitor
 * @param {string} baseline
 */
export function formatRatio(byKey, label, competitor, baseline) {
  const a = byKey.get(`${label}\0${competitor}`)
  const b = byKey.get(`${label}\0${baseline}`)
  if (a === undefined || b === undefined) return "—"
  if (a >= b) return `${(a / b).toFixed(2)}× slower`
  return `${(b / a).toFixed(2)}× faster`
}

/**
 * `(1.47×)` / `(12×)` / `(559×)`. Matches the README's parenthetical style.
 * @param {number} r
 */
export function formatRatioShort(r) {
  if (r >= 10) return `${Math.round(r)}×`
  return `${r.toFixed(1)}×`
}

/** @param {string} s */
function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "")
}

/**
 * @param {string} s
 * @param {number} w
 */
function padEnd(s, w) {
  const visible = stripAnsi(s).length
  return visible >= w ? s : s + " ".repeat(w - visible)
}
