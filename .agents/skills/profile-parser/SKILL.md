---
name: profile-parser
description: Use when investigating parser performance — which functions are hot, where allocations happen, whether a change actually helped. Runs a CPU profile of the parser hot loop and surfaces the report.
---

# Profile the parser

Run `bun run prof` to capture a CPU profile of the parser exercising
five representative inputs (TINY / SMALL / MEDIUM / LARGE / DEEP). The
script writes a timestamped subdirectory under `tmp/prof/` (gitignored,
suffixed `-bun` or `-node` so back-to-back runs don't clobber each
other) containing:

- `CPU.<...>.cpuprofile` — V8 binary format for Chrome DevTools →
  Performance → Load Profile (flame graph).
- `CPU.<...>.md` — grep-friendly markdown, designed for scanning
  self-time tables without a GUI.

## Basic use

```bash
bun run prof                              # all inputs, 500µs sampling, Bun runtime
bun run prof -- --filter=MEDIUM,DEEP      # a subset
bun run prof -- --interval=250            # tighter sampling
bun run prof:node                         # same, but profile under Node (V8)
bun run prof:report <path.cpuprofile>     # re-analyse any cpuprofile ad-hoc
```

After the run, the script echoes the artifact paths. Open the `.md`
first — its top section is a self-time table that usually names the
bottleneck in one scan.

### Runtime choice: Bun vs Node

`bun run prof` uses Bun's sampler (`--cpu-prof --cpu-prof-md`). `bun
run prof:node` runs the same workload under Node (`--cpu-prof
--experimental-transform-types`) and then post-processes the output
through `scripts/prof-report.ts` so both runtimes land with a `.md`
sidecar in the same format.

- Default to **Bun** when you're profiling to guide an edit — it's
  what consumers hitting our source files use, and line numbers in
  the report point at the real source.
- Use **Node** when the question is "does our dist bundle behave the
  same under Node" or "is a hot path runtime-specific" — pair with
  `bun run bench:compare:node:dist` for throughput numbers.
- **Caveat for `prof:node`**: Node's `--experimental-transform-types`
  rewrites TS to JS before V8 records line numbers. Function names in
  the report are correct; line numbers are shifted (e.g. `parse.ts`
  is ~5800 lines but Node may report a line in the 13k range). Read
  the function name first and only use the line as a rough hint.

The `prof:report` script accepts any V8 `.cpuprofile` (either runtime)
and emits the same markdown the `prof` wrappers do. Use it to
re-summarise an old profile, tweak `--top N`, or target `--out
path.md` when piping output is awkward.

## Workflow

1. **Capture a baseline** on `main` before making changes: `bun run prof`.
2. **Note the top 10** self-time functions and their % share. Those are
   what any optimization needs to move.
3. **Make the change** on a branch.
4. **Re-capture** with `bun run prof` again — the new timestamped dir
   keeps the baseline intact for side-by-side diffing.
5. **Compare** the top-10 lists. If the targeted function's % didn't
   drop — the change didn't help and shouldn't land.
6. **Record findings** in `PERF_IDEAS.md` — both wins _and_ failed
   experiments with their regression data, so the next person doesn't
   redo the same dead-end.

## What to look for in the `.md`

- **Hot Functions (Self Time)** at the top — sorted by % of total
  profile samples attributed directly to that function body. Always
  present (both runtimes).
- **Call Tree (Total Time)** and **Function Details** — present in
  Bun's native `--cpu-prof-md` output. The `prof:node` /
  `prof:report` output is more minimal: just the header + top-10
  line + hot-functions table. If you need "where is this being
  called from" for a Node profile, load the `.cpuprofile` in Chrome
  DevTools (Performance → Load Profile) and use the bottom-up view.

## Common interpretations

- High `generatorResume` cumulative % → JS generator overhead. See
  `PERF_IDEAS.md` entry on the tokenizer iterator rewrite.
- High `defineProperties` native % → object-literal hidden-class churn.
  Usually a symptom, not something to fix directly — look for
  inconsistent property order across constructors of the same AST kind.
- High `reverse` / `pop` native % under `#yy_reduce` → this is the
  already-tuned LR hot path. **Do not try to optimize** — see the
  "Do not revisit" section in `PERF_IDEAS.md` for the failed
  experiments and why.

## Extending the workload

The hot loop lives in `scripts/prof-run.ts`. To profile a different
query shape, add a constant to `scripts/bench-common.ts` alongside
`TINY`/`SMALL`/`MEDIUM`/`LARGE`/`DEEP` and append it to the `PLANS`
array in `prof-run.ts` with an iteration count that targets ~1-3s of
wall time at current baseline perf (so samples are balanced across
shapes).

## Related

- `PERF_IDEAS.md` — ranked, evidence-backed list of optimization
  targets with success metrics. Update it with findings from each
  profile run.
- `bun run bench` / `bun run bench:compare` — mitata-driven throughput
  numbers; use when the question is "is it faster" rather than "where
  is the time going."
