# Performance findings and plan

Captured from a CPU profile of `scripts/bench-common.ts`'s parser at
SQLite 3.53.0 on a macOS arm64 Apple M4 Max machine under Bun 1.3.11.
Profile run: 500µs sampling, 20,263 samples, 13.4s total wall; pre-warmed
with 5,000 iterations per input size, then ~1.84M measured calls across
TINY / SMALL / MEDIUM / LARGE / DEEP inputs. Raw profile captured under
`/tmp/prof/` at the time of investigation; this file is the distilled
finding + action list.

## Observed hot spots, by subsystem

Rolled-up from the per-function table — single percentages are
**self-time** share of total profile samples.

| Subsystem                                                  | Self % of total | Details                                                                                                                          |
| ---------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Tokenizer (generator + scanning + keyword)                 | **~25%**        | `iterate` × 4 locations + `finishKeyword` × 2 + `nextToken` + `toUpperCase`. `generatorResume` cumulative is **29% total time**. |
| LR engine (`#yy_reduce` + `next` + `reverse`)              | **~22%**        | `#yy_reduce` self alone is 24% across 7 line-level attributions; `next` 3.3%; `reverse` 5%.                                      |
| Generated reducer bodies (line-attributed in `parse.ts`)   | **~15%**        | Spread across ~30 rule handlers; no single rule dominates.                                                                       |
| AST construction helpers                                   | **~10%**        | `addColumn`, `extractSpan`, `spanOver`, `mkName`, `mkParenthesized`, `nodeSpan`, etc.                                            |
| Object-literal materialization (`defineProperties` native) | **~5%**         | Every `{kind, …, span}` allocation funnels through this host function.                                                           |
| Dequoting / small utils                                    | **~3%**         | `sqlite3Dequote` × 2 locations, `toUpperCase`, `copyDataProperties`.                                                             |

### Top 10 self-time functions

| %     | Function           | Location                                             |
| ----- | ------------------ | ---------------------------------------------------- |
| 13.6% | `#yy_reduce`       | `src/lempar.ts:555` (reducer call site)              |
| 6.7%  | `iterate`          | `src/tokenize.ts:1087` (generator body)              |
| 5.0%  | `reverse`          | native — from `popped.reverse()` inside `#yy_reduce` |
| 4.8%  | `defineProperties` | native — AST object-literal materialization          |
| 4.8%  | `finishKeyword`    | `src/tokenize.ts:1063`                               |
| 4.7%  | `nextToken`        | `src/tokenize.ts`                                    |
| 4.4%  | `iterate`          | `src/tokenize.ts:1106`                               |
| 3.9%  | `addColumn`        | `src/ast/parseActions.ts:737`                        |
| 3.3%  | `iterate`          | `src/tokenize.ts:1085`                               |
| 3.3%  | `next`             | `src/lempar.ts:500`                                  |

## Ranked action list

Ordered by (estimated impact × feasibility). Each entry is framed as a
concrete change with a success metric.

### 1. Replace the tokenizer generator with an iterator class — BIG ✅ LANDED

**Status:** Landed. The `function*` generator in `tokenize()` is now a
`TokenStreamImpl` class with `next()` / `[Symbol.iterator]()` and
public `offset` / `line` / `col` fields (no more `Object.defineProperties`
slow path on every call).

**Result (same 500µs profile, same inputs, same iteration counts):**

| Input  | Before |  After | Speedup   |
| ------ | -----: | -----: | --------- |
| TINY   | 1687ms |  903ms | **1.87×** |
| SMALL  | 2426ms | 1766ms | **1.37×** |
| MEDIUM | 3220ms | 2610ms | **1.23×** |
| LARGE  | 4100ms | 3436ms | **1.19×** |
| DEEP   | 3442ms | 3449ms | ~1.00×    |

Total profile wall time: **15.09s → 12.35s (−18%)**. `generatorResume`
(was 28.1% cumulative) and `defineProperties` (was 4.8% self — from the
`Object.defineProperties(iterate(), …)` cursor attachment) both dropped
out of the profile entirely. DEEP is unchanged because it's
parser-dominated (deep expression nesting → tons of reduces), not
tokenizer-dominated.

**Success metric was:** >15% gain on MEDIUM/LARGE/DEEP. Met on
MEDIUM/LARGE; DEEP unaffected by design (parser-bound, not
tokenizer-bound). Exceeded metric on TINY/SMALL.

### 2. Inline `extractSpan` via emitter-generated span code — MEDIUM ✅ LANDED

**Status:** Landed. The `nodeSpan()` closure that used to live at the
top of `reduce` is gone; each rule now emits its own `const _span: Span =
…` preamble — but only when the action body actually references it. For
~270 of the ~273 reducer cases the emitter inlines the span via direct
`(popped[i].minor as T).span` reads wrapped in `spanOver(...)`; the 3
remaining single-position rules whose only RHS is `string` or an array
fall back to the runtime `spanFromPopped(popped)` helper.

Mechanism: `scripts/emit-ts-parser.ts` now carries a `spanShape(typeStr)`
heuristic that classifies a `%type` datatype as `always` / `maybe` /
`never` / `unknown`. The emitter walks each rule's RHS, picks the first
and last positions with `always | maybe` shape, and emits a direct
`spanOver(...)` call. Anything `unknown` or `never` falls back to
`spanFromPopped`. Non-spanful `PascalCase` types (scratch helpers like
`FromClauseMut`, `SelectBody`, plus the string-literal-union enums) are
listed explicitly in `NON_SPANFUL_TYPES` so the heuristic stays honest.

**Result (500µs profile, same inputs, same iteration counts):**

| Input  | Before (post-addColumn) | After (post-extractSpan-inline) | Δ        |
| ------ | ----------------------: | ------------------------------: | -------- |
| TINY   |                   837ms |                           776ms | −7.3%    |
| SMALL  |                  1582ms |                          1415ms | −10.6%   |
| MEDIUM |                  2312ms |                          1970ms | −14.8%   |
| LARGE  |                  3085ms |                          2650ms | −14.1%   |
| DEEP   |                  3049ms |                          2519ms | **−17.4%** |

Total profile wall: **11.04s → 9.50s (−14.0%)**. `extractSpan` vanished
from the profile entirely. `spanFromPopped` dropped from 0.7% → 0.1%
(only the 3 fallback rules call it). DEEP got the biggest win because
deep expression nesting has the most reductions per parse, so the
per-reduce savings compound.

The "do not attempt `minor?.span`" warning from the prior failed
experiment is preserved as a comment on `extractSpan` in
`parseActions.ts` — the helper is still around for the runtime fallback
path and to keep tests/utilities working.

### 3. Audit AST node constructor shapes — UNKNOWN SIZE, LOW RISK

**Evidence:** `defineProperties` at **4.8% self** is V8/JSC's internal
machinery for object-literal creation. Shows up in the profile when
literals trigger the `defineOwnProperty` slow path, usually from:

- **Inconsistent property order** across call sites for the same
  `kind` (hidden-class explosion).
- **Spread syntax** (`{...x, y}`) triggering defineOwnProperty.
- **Very wide literals** (>10 properties) hitting a different code
  path than small ones.

**Change:** grep every `{ kind: "X", … }` construction for a given AST
kind, verify property order is identical across every site. Remove any
spread-construction if the same shape could be built with a plain
literal. This is an audit + targeted rewrites, not a large refactor.

The payoff is uncertain — could be 2–5% if there's real
hidden-class churn; could be 0% if JSC is already folding these into a
single shape. Worth a morning's audit regardless.

**Success metric:** measurable throughput bump _or_ confirmation that
the profile is honest and this %age is unavoidable.

### 3a. Length-bucketed keyword lookup — MEDIUM ✅ LANDED

**Status:** Landed. `finishKeyword` no longer allocates. The
`keywordCode` Map + `z.slice(p,i).toUpperCase()` + `Map.get()` triplet
is replaced with a length-indexed bucket array. For a word of length
`L`, `finishKeyword` pulls the bucket for `L` (or bails immediately if
`L > maxKwLen`) and walks candidates comparing source bytes via
`charCodeAt` with ASCII case-fold (`src === cand || src === (cand | 0x20)`).

**Result (500µs profile, same inputs, same iteration counts):**

| Input  | Before (post-tokenizer) | After (post-keyword) | Speedup |
| ------ | ----------------------: | -------------------: | ------- |
| TINY   |                   922ms |                836ms | -9.3%   |
| SMALL  |                  1814ms |               1584ms | -12.7%  |
| MEDIUM |                  2712ms |               2265ms | -16.5%  |
| LARGE  |                  3460ms |               3261ms | -5.8%   |
| DEEP   |                  3491ms |               3248ms | -7.0%   |

Total profile wall: **12.35s → 11.37s (−7.9%)**. `toUpperCase` (was
2.6% native self) dropped to 0.0%. `finishKeyword` self% appears
_higher_ (9.3% vs 7.3%) because the comparison work that previously
lived inside `toUpperCase`/`Map.get`/hash-probe now runs inline inside
`finishKeyword` — absolute combined time in the subsystem went
~1400ms → ~1060ms (−24%).

MEDIUM got the biggest win (schema + keyword mix maximizes both paths:
keyword fast-identify plus identifier-length-mismatch fast-reject).
LARGE and DEEP moved less since they're already parser-bound.

### 4. Audit `addColumn` and `parseActions.ts` list-mutation helpers — SMALL ✅ LANDED

**Status:** Landed — but the actual hotspot wasn't the mutation
pattern, it was O(n²) duplicate-name detection. `addColumn` and the
parallel `addCte` were both doing `columns.find(c => c.colName.text
=== cd.colName.text)`, which (a) allocates a fresh arrow closure on
every call and (b) doesn't inline through `Array.prototype.find`'s
dispatch. For the LARGE benchmark's 96-column CREATE TABLE that's
~4600 comparisons per table through a slow path.

Replaced both with plain for-loops that compare `.text` directly.

**Result:**

| Input  | Before |  After | Δ           |
| ------ | -----: | -----: | ----------- |
| TINY   |  836ms |  837ms | ~0%         |
| SMALL  | 1584ms | 1582ms | ~0%         |
| MEDIUM | 2265ms | 2312ms | +2% (noise) |
| LARGE  | 3261ms | 3085ms | **−5.4%**   |
| DEEP   | 3248ms | 3049ms | **−6.1%**   |

Total profile wall: 11.37s → 11.04s (−2.9%). `addColumn` self%
dropped 5.1% → 4.0% (absolute 580ms → 447ms, −23%). LARGE got the
expected win from removing the quadratic scan; DEEP's drop came along
for the ride (CTE dedup in nested-subquery shape).

Still O(n²) in the worst case — a wider table (~500 columns) would
reward a Set-based fast path. Not relevant on our current workloads.

### 5. `tokenStream` retention on the happy path — MEMORY, NOT CPU

**Evidence:** Not visible in the CPU profile (`Array.prototype.push`
calls are cheap and the nursery recycles the array fast), but flagged
in an earlier code review. Every successful parse retains the full
parser-visible token list in memory purely to rebuild diagnostics in
the error branch, which the happy path never needs.

**Change:** drop `tokenStream: Token[]` on the hot path, track a
counter instead, and re-tokenize on error to reconstruct. The
tokenizer is cheap relative to the error-rendering machinery, so the
re-tokenize in the error branch is effectively free. See the "Option A"
proposal in the code-review discussion for the full sketch.

**Success metric:** no per-op throughput change expected; sustained
parsing reduces GC pressure and working-set size roughly linearly with
input size.

### 6. Do not revisit: `popped` array allocation inside `#yy_reduce`

**Already investigated, confirmed not a win.** The original `lempar.ts`
reduce body — `const popped = []` + `pop` + `push` + `reverse` +
fresh `{major, minor}` wrappers — looked wasteful on paper, but
benchmarks showed three separate attempts to eliminate the allocation
each regressed throughput by 3–109%:

| Attempt                                                     | Regression vs. baseline                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| Alias stack entries directly (share hidden class)           | −109% (SMALL) — reducer's `popped[i].minor` inline-cache went polymorphic |
| Fresh wrappers + reused array + indexed fill + `length` set | −14% (DEEP)                                                               |
| Fresh wrappers + reused array + pop/reverse                 | −6% (uniform)                                                             |

**Root cause:** V8/JSC already fast-paths `new Array()` + `push` +
`reverse` + short-lived nursery-allocated `{major, minor}` wrappers.
Any attempt to change the pattern breaks one of:

- Monomorphic inline-cache at `popped[i].minor` (aliasing stack entries
  introduces the `stateno` field and shifts the hidden class).
- V8's specialized `Array.prototype.pop` intrinsic (indexed access + `length = N`
  goes through a slower path).
- The young-generation bump-pointer allocator's best case (fresh small arrays
  hit the fastest alloc path; reused arrays transition element kinds).

The doc comment on `LalrReduce` documents the current shape as the
intended one. **Leave the reduce body alone unless new evidence
contradicts the benchmarks above.**

## Suggested order of attack

1. **Tokenizer generator → iterator class.** Highest expected win, single
   self-contained refactor. Prototype, benchmark, merge if ≥10% win.
2. **`extractSpan` fast-path (option 1).** Tiny change, modest win.
3. **AST-node constructor audit.** Not a code change per se — an audit
   that may or may not produce follow-up patches.
4. **`addColumn` / list-helper review.** Lightweight.
5. **`tokenStream` retention fix.** Memory/GC hygiene; not benchmark-visible
   but correct behavior.

Do not touch `#yy_reduce` without new data.

## How to reproduce the profile

```bash
bun run prof                              # all inputs, 500µs sampling
bun run prof -- --filter=MEDIUM,DEEP      # subset of input shapes
bun run prof -- --interval=250            # tighter sampling
```

Artifacts land under `tmp/prof/<timestamp>/` (gitignored) as
`CPU.<epoch>.<pid>.{cpuprofile,md}`. The `.md` is grep-friendly
(self-time table, then call tree, then per-function details); the
`.cpuprofile` loads in Chrome DevTools → Performance → Load Profile
for a flame graph.

The orchestrator lives in `scripts/prof.ts` (creates the dir, wraps a
child bun in `--cpu-prof` flags) and the hot loop itself lives in
`scripts/prof-run.ts` — edit that file to add inputs, and
`scripts/bench-common.ts` to add new SQL fixtures. The `profile-parser`
skill (`.claude/skills/profile-parser/SKILL.md`) describes the full
workflow, including common pitfalls to avoid when interpreting the
output.
