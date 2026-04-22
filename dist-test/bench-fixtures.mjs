// Shared SQL fixtures for dist-test benchmarks.  Kept in sync with
// scripts/bench-common.ts by hand — these inputs rarely change, and
// duplicating them keeps dist-test self-contained (no `..` imports
// into the repo's scripts tree).

export const TINY = "SELECT 1;"

export const SMALL =
  "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE);"

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

export const BROKEN = "SELECT a,\n       b,\n       FROM t"
