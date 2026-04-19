#!/usr/bin/env -S bun run
// Slim a parser.json or keywords.json defs down to only the fields
// the JS runtime actually reads.  The Makefile wires this in as the
// transformation `*.dev.json → *.prod.json`:
//
//     bun scripts/slim-dump.ts generated/<ver>/parser.dev.json \
//                              generated/<ver>/parser.prod.json
//     bun scripts/slim-dump.ts generated/<ver>/keywords.dev.json \
//                              generated/<ver>/keywords.prod.json
//
// The set of kept fields is driven by the `.prod` JSON Schemas exported
// from scripts/json-schemas.ts (which derive from src/lempar.ts and
// src/tokenize.ts).  To start preserving a new runtime-read field: add
// it to the relevant TypeBox type in scripts/json-schemas.ts — this
// script will pick it up automatically.

import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { Clean } from 'typebox/value';

import { SCHEMAS, type SchemaName } from './json-schemas.ts';

// ---------------------------------------------------------------------------
// Detect kind by content shape so callers don't have to pass a flag.
// ---------------------------------------------------------------------------
function detectSchemaName(d: Record<string, unknown>): SchemaName {
  if ('rules' in d && 'tables' in d && 'symbols' in d) return 'parser.prod';
  if ('keywords' in d && 'meta' in d)                  return 'keywords.prod';
  throw new Error(
    'Unrecognised defs shape: expected either a parser.json (with rules/tables/symbols) ' +
    'or a keywords.json (with keywords/meta).',
  );
}

// ---------------------------------------------------------------------------
// Size reporter — useful for deciding whether to ship slim or not.
// ---------------------------------------------------------------------------
function sizes(buf: Buffer | string): { raw: number; gz: number } {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return { raw: b.byteLength, gz: gzipSync(b).byteLength };
}

function fmt(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

// ---------------------------------------------------------------------------
// CLI entry.
// ---------------------------------------------------------------------------
function main(): void {
  const [, , inPath, outPath] = process.argv;
  if (!inPath || !outPath) {
    console.error('usage: bun scripts/slim-dump.ts <input.json> <output.json>');
    process.exit(2);
  }

  const inBytes = readFileSync(inPath);
  const defs = JSON.parse(inBytes.toString('utf8')) as Record<string, unknown>;
  const schemaName = detectSchemaName(defs);
  // `Clean` mutates, but we just parsed `defs` for our own use — no
  // caller is relying on the parsed object.  Returns `unknown`; the
  // schema is what controls the shape so the `as` cast is safe.
  const slim = Clean(SCHEMAS[schemaName], defs);
  // Compact JSON — every saved byte counts when the defs dominates the bundle.
  const outText = JSON.stringify(slim);
  writeFileSync(outPath, outText);

  const before = sizes(inBytes);
  const after  = sizes(outText);
  const pct = (n: number, d: number) => ((1 - n / d) * 100).toFixed(1);
  console.log(`${inPath}  ->  ${outPath}  (schema: ${schemaName})`);
  console.log(`  raw:     ${fmt(before.raw)}  →  ${fmt(after.raw)}  (-${pct(after.raw, before.raw)}%)`);
  console.log(`  gzipped: ${fmt(before.gz)}  →  ${fmt(after.gz)}  (-${pct(after.gz, before.gz)}%)`);
}

main();
