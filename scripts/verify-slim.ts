// Smoke-test that the slim dumps actually parse the same SQL as the
// full dumps.  Run after every change to scripts/slim-dump.ts (or
// after editing the field-keep tables there) to catch any field that
// the runtime reads but the slimmer drops.

import full        from '../generated/parser.json'   with { type: 'json' };
import fullKw      from '../generated/keywords.json' with { type: 'json' };
import slim        from '../dist/parser.slim.json'   with { type: 'json' };
import slimKw      from '../dist/keywords.slim.json' with { type: 'json' };
import { createParser, formatCst } from '../src/parser.ts';

const SAMPLES = [
  'SELECT 1',
  'SELECT 1; SELECT 2;',
  "INSERT INTO t VALUES (1, 'a')",
  'SELECT * FROM t WHERE x BETWEEN 1 AND 5 ORDER BY y DESC',
  `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<10)
   SELECT * FROM n;`,
  `CREATE TABLE t (
     id INTEGER PRIMARY KEY,
     x  TEXT NOT NULL DEFAULT 'foo',
     y  REAL CHECK (y > 0)
   );`,
];

const fullParser = createParser(full as any, fullKw as any);
const slimParser = createParser(slim as any, slimKw as any);

let pass = 0, fail = 0;
for (const sql of SAMPLES) {
  const a = fullParser.parse(sql);
  const b = slimParser.parse(sql);
  const sa = a.cst ? formatCst(a.cst) : `<errors: ${a.errors.length}>`;
  const sb = b.cst ? formatCst(b.cst) : `<errors: ${b.errors.length}>`;
  if (sa === sb) {
    pass++;
  } else {
    fail++;
    console.error(`MISMATCH: ${JSON.stringify(sql)}`);
    console.error('  full:', sa.slice(0, 120));
    console.error('  slim:', sb.slice(0, 120));
  }
}
console.log(`${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
