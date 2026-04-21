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

| Input  | Before | After  | Speedup        |
| ------ | -----: | -----: | -------------- |
| TINY   | 1687ms |  903ms | **1.87×**      |
| SMALL  | 2426ms | 1766ms | **1.37×**      |
| MEDIUM | 3220ms | 2610ms | **1.23×**      |
| LARGE  | 4100ms | 3436ms | **1.19×**      |
| DEEP   | 3442ms | 3449ms | ~1.00×         |

Total profile wall time: **15.09s → 12.35s (−18%)**. `generatorResume`
(was 28.1% cumulative) and `defineProperties` (was 4.8% self — from the
`Object.defineProperties(iterate(), …)` cursor attachment) both dropped
out of the profile entirely. DEEP is unchanged because it's
parser-dominated (deep expression nesting → tons of reduces), not
tokenizer-dominated.

**Success metric was:** >15% gain on MEDIUM/LARGE/DEEP. Met on
MEDIUM/LARGE; DEEP unaffected by design (parser-bound, not
tokenizer-bound). Exceeded metric on TINY/SMALL.

### 2. Inline `extractSpan` via emitter-generated span code — MEDIUM

**Evidence:** `extractSpan` is **2.5% self**, called inside
`spanFromPopped`. It's defensive because `minor` is typed `unknown`:

```ts
function extractSpan(minor: unknown): Span | undefined {
  if (minor && typeof minor === "object" && "span" in minor) {
    return (minor as { span: Span }).span
  }
  return undefined
}
```

**Do not attempt the `minor?.span` fast path.** Replacing the gauntlet
with `(minor as {span?:Span} | null | undefined)?.span` **regresses**:
extractSpan self% jumped from 3.0% → 8.0% and TINY/SMALL/MEDIUM wall
time got 7–11% slower. Why: `?.` on primitive `minor` values
(numbers/booleans from grammar reductions) boxes them and sends the
property access through a polymorphic IC, whereas `typeof === "object"`
short-circuits primitives without allocation. Verified by benchmark on
2026-04-21; also documented as a comment on the function itself.

The remaining idea worth trying:

- **Emitter inlining** — `scripts/emit-ts-parser.ts` knows per-rule which
  popped positions carry spans (from the `%type` declarations), so it
  can emit `const _span = spanOver(popped[0]!.minor.span, popped[N]!.minor.span)`
  directly in the reducer body and skip `spanFromPopped` entirely. This
  avoids the defensive check by construction — the emitter only emits
  `.span` access for positions that statically have one.

**Success metric:** ~2–3% throughput gain on the emitter-inlined version.

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

### 4. Audit `addColumn` and `parseActions.ts` list-mutation helpers — SMALL

**Evidence:** `addColumn` at `parseActions.ts:737` is **3.9% self**,
one specific helper for CREATE TABLE column lists. Other list-mutation
helpers are probably similarly costly but split across shorter-named
functions.

**Change:** review `parseActions.ts:~720–780` for the mutation pattern.
Confirm it uses the `(list ? list.push(x) : [x])` idiom (which V8
optimizes well) rather than `Object.assign`, spread concatenation, or
shape-transitioning operations.

**Success metric:** small (~1–2%), more about confirming we're not
leaving easy wins on the table.

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
