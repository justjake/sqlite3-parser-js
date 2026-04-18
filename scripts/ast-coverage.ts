#!/usr/bin/env -S bun run
// scripts/ast-coverage.ts
//
// Report which rules-with-actions in a parser.dev.json have been
// exercised by the test suite.  The test suite is expected to opt into
// `ConvertOptions.onHit` and dump the resulting hit set to a JSON file;
// this script reads that file and diffs it against the dump.
//
// Usage:
//   bun scripts/ast-coverage.ts parser.dev.json coverage.json
//
// `coverage.json` shape:  `string[]` — one stable key per entry.
//
// Exit codes:
//   0 — every rule with an action was hit
//   1 — some rules with actions were unhit (report printed)
//   2 — bad arguments / missing files

import { readFileSync } from 'node:fs';
import { buildSymbolName, stableKeyForRule } from '../src/ast/dispatch.ts';
import type { DumpRule, LemonDump } from '../src/lempar.ts';

interface DevRule extends DumpRule {
  readonly actionC: string | null;
  readonly noCode: boolean;
}
interface DevDump {
  readonly rules: readonly DevRule[];
  readonly symbols: LemonDump['symbols'];
}

function main(): void {
  const [dumpPath, coveragePath] = process.argv.slice(2);
  if (!dumpPath || !coveragePath) {
    console.error('usage: bun scripts/ast-coverage.ts parser.dev.json coverage.json');
    process.exit(2);
  }

  const dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as DevDump;
  const hit = new Set(JSON.parse(readFileSync(coveragePath, 'utf8')) as string[]);
  const symbolName = buildSymbolName(dump);

  // "Interesting" rules are those with a non-empty action body.
  // Empty-action rules are either unit rules (no behaviour) or pure
  // structural passes — they don't need a handler of their own, so
  // coverage there would be noise.
  const interesting = dump.rules.filter(
    (r) => !r.noCode && (r.actionC ?? '').trim().length > 0,
  );
  const unhit = interesting.filter(
    (r) => !hit.has(stableKeyForRule(r, symbolName)),
  );

  console.log(`rules with actions: ${interesting.length}`);
  console.log(`hit:                ${interesting.length - unhit.length}`);
  console.log(`unhit:              ${unhit.length}`);

  if (unhit.length > 0) {
    console.log('\n## Unhit');
    for (const r of unhit) console.log(`  ${stableKeyForRule(r, symbolName)}`);
  }

  process.exit(unhit.length > 0 ? 1 : 0);
}

main();
