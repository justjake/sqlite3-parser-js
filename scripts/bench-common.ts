// Shared helpers for benchmark scripts.
//
// These bind directly to the checked-in generated tables + reducer so
// the benchmarks exercise the in-repo parser implementation without
// depending on the package wrapper layer.

import keywordDefsJson from "../generated/3.53.0/keywords.prod.json" with { type: "json" }
import * as parserDefs from "../generated/3.53.0/parse.ts"
import { parserModuleForGrammar } from "../src/parser.ts"
import type { KeywordDefs } from "../src/tokenize.ts"

export const TINY = "SELECT 1;"

export const SMALL =
  "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE);"

// MEDIUM intentionally avoids window functions (`… OVER (…)`) and
// `FILTER (WHERE …)` so every parser in bench-compare.ts can handle
// it — sqlite-parser (2015-2017) predates both.  Everything else —
// CTE, joins, IN lists, correlated subqueries, CASE, date() — is
// supported across the board.
export const MEDIUM = `
WITH active AS (
  SELECT u.id, u.name, MAX(o.created_at) AS last_order
  FROM users u
  LEFT JOIN orders o ON o.user_id = u.id
  WHERE o.status IN ('paid', 'shipped')
  GROUP BY u.id, u.name
)
SELECT a.id,
       a.name,
       a.last_order,
       (SELECT COUNT(*) FROM orders o WHERE o.user_id = a.id) AS order_count,
       (SELECT COALESCE(SUM(o.total), 0) FROM orders o
        WHERE o.user_id = a.id AND o.status = 'paid') AS paid_total,
       CASE WHEN a.last_order > date('now', '-30 days') THEN 'active'
            ELSE 'dormant' END AS activity
FROM active a
WHERE a.last_order IS NOT NULL
ORDER BY a.last_order DESC
LIMIT 100;
`.trim()

const LARGE_METRICS = Array.from({ length: 96 }, (_, i) => {
  const suffix = String(i + 1).padStart(2, "0")
  const notNull = i % 8 === 0 ? " NOT NULL" : ""
  return `metric_${suffix} REAL${notNull}`
}).join(",\n  ")

export const LARGE = `
CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT,
  ${LARGE_METRICS}
);
`.trim()

// Deep expression + subquery nesting. Stresses the engine's LALR
// stack, the reducer's recursive construction, and each parser's
// tolerance for nested parentheses / correlated subqueries — the
// opposite axis from LARGE's wide-not-deep column list.
const DEEP_EXPR = (() => {
  let e = "a"
  for (let i = 0; i < 16; i++) e = `(${e} + ${i})`
  return e
})()
const DEEP_SUBQUERY = (() => {
  let q = `SELECT ${DEEP_EXPR} FROM t`
  for (let i = 0; i < 4; i++) q = `SELECT (${q}) FROM t`
  return q
})()
export const DEEP = `${DEEP_SUBQUERY};`

// Error-path input: trailing comma before FROM. Exercises the hint
// heuristics and renderCodeBlock-oriented diagnostics.
export const BROKEN = "SELECT a,\n       b,\n       FROM t"

const parser = parserModuleForGrammar(parserDefs, keywordDefsJson as KeywordDefs, {})

export const parse = parser.parse
export const tokenize = parser.tokenize

export function parseAccepted(sql: string) {
  const result = parse(sql)
  if (result.status !== "accepted") {
    throw new Error(`expected parse success, got: ${formatErrors(result.errors)}`)
  }
  return result
}

export function parseErrored(sql: string) {
  const result = parse(sql)
  if (result.status !== "errored") {
    throw new Error("expected parse errors, but parse succeeded")
  }
  return result.errors
}

function formatErrors(errors: readonly { message: string }[]): string {
  return errors.map((error) => error.message).join("; ") || "unknown parse error"
}
