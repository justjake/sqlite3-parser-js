// Slim a parser.json or keywords.json dump down to only the fields
// the JS runtime actually reads.  Intended for the build pipeline:
//
//     bun scripts/slim-dump.ts generated/parser.json   dist/parser.slim.json
//     bun scripts/slim-dump.ts generated/keywords.json dist/keywords.slim.json
//
// The output is the same JSON schema with unused fields stripped, so
// the runtime modules don't need to know whether they're reading a
// slim dump or a full one.  If the runtime ever starts reading a new
// field, add it to the keep-set below — the script will preserve it.
//
// This is the only place in the project that has to know "what does the
// runtime actually read?", so update it whenever you change the field
// access pattern in src/parser.ts, src/tokenize.ts, src/lempar.ts, or
// src/enhanceError.ts.

import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// Field-keep tables.  Adding a field here is the one-line escape hatch
// when a runtime change starts depending on something we used to drop.
// ---------------------------------------------------------------------------

/** Top-level keys we keep in parser.json. */
const PARSER_KEEP_TOP = new Set([
  'constants', 'tables', 'symbols', 'rules',
] as const);

/** Per-symbol keys we keep. */
const SYMBOL_KEEP = new Set(['id', 'name', 'isTerminal'] as const);

/** Per-rule keys we keep. */
const RULE_KEEP = new Set([
  'id', 'lhs', 'lhsName', 'nrhs', 'rhs', 'doesReduce',
] as const);

/** Per-RHS-position keys we keep.  `pos` is array-index trivial; drop it. */
const RHS_KEEP = new Set(['symbol', 'multi'] as const);

/** Per-multi-alternative keys we keep. */
const MULTI_KEEP = new Set(['symbol'] as const);

/** Per-keyword keys we keep. */
const KW_KEEP = new Set(['name', 'tokenName', 'flags'] as const);

/** Keys under keywords.meta we keep (only maskFlags is read at runtime). */
const KW_META_KEEP = new Set(['maskFlags'] as const);

// ---------------------------------------------------------------------------
// Slimmers.
// ---------------------------------------------------------------------------

type Json = unknown;

function pickKeys<T extends Record<string, Json>>(obj: T, keep: Set<string>): Partial<T> {
  const out: Record<string, Json> = {};
  for (const k of Object.keys(obj)) {
    if (keep.has(k)) out[k] = obj[k];
  }
  return out as Partial<T>;
}

function slimParserDump(d: Record<string, Json>): Record<string, Json> {
  const top = pickKeys(d, PARSER_KEEP_TOP as Set<string>);

  // Symbols: a flat array of {id, name, isTerminal}.
  const symbols = (d.symbols as Array<Record<string, Json>>).map((s) =>
    pickKeys(s, SYMBOL_KEEP as Set<string>),
  );

  // Rules: keep the structural fields; rhs entries themselves get slimmed.
  const rules = (d.rules as Array<Record<string, Json>>).map((r) => {
    const slim = pickKeys(r, RULE_KEEP as Set<string>) as Record<string, Json>;
    const rhs = (r.rhs as Array<Record<string, Json>>).map((p) => {
      const sp = pickKeys(p, RHS_KEEP as Set<string>) as Record<string, Json>;
      if (Array.isArray(sp.multi)) {
        sp.multi = (sp.multi as Array<Record<string, Json>>).map((m) =>
          pickKeys(m, MULTI_KEEP as Set<string>),
        );
      }
      return sp;
    });
    slim.rhs = rhs;
    return slim;
  });

  return { ...top, symbols, rules };
}

function slimKeywordsDump(d: Record<string, Json>): Record<string, Json> {
  const meta = pickKeys(d.meta as Record<string, Json>, KW_META_KEEP as Set<string>);
  const keywords = (d.keywords as Array<Record<string, Json>>).map((kw) =>
    pickKeys(kw, KW_KEEP as Set<string>),
  );
  return { meta, keywords };
}

// ---------------------------------------------------------------------------
// Detect kind by content shape so callers don't have to pass a flag.
// ---------------------------------------------------------------------------
function detectAndSlim(d: Record<string, Json>): Record<string, Json> {
  if ('rules' in d && 'tables' in d && 'symbols' in d) return slimParserDump(d);
  if ('keywords' in d && 'meta' in d)                  return slimKeywordsDump(d);
  throw new Error(
    'Unrecognised dump shape: expected either a parser.json (with rules/tables/symbols) ' +
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
  const dump = JSON.parse(inBytes.toString('utf8'));
  const slim = detectAndSlim(dump);
  // Compact JSON — every saved byte counts when the dump dominates the bundle.
  const outText = JSON.stringify(slim);
  writeFileSync(outPath, outText);

  const before = sizes(inBytes);
  const after  = sizes(outText);
  const pct = (n: number, d: number) => ((1 - n / d) * 100).toFixed(1);
  console.log(`${inPath}  ->  ${outPath}`);
  console.log(`  raw:     ${fmt(before.raw)}  →  ${fmt(after.raw)}  (-${pct(after.raw, before.raw)}%)`);
  console.log(`  gzipped: ${fmt(before.gz)}  →  ${fmt(after.gz)}  (-${pct(after.gz, before.gz)}%)`);
}

main();
