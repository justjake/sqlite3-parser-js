#!/usr/bin/env -S bun run
// scripts/diff-ast.ts
//
// Diff two parser.dev.json dumps by grammar-shape stable key.  Used
// during SQLite version upgrades to see exactly what changed in the
// grammar, so we know which AST handlers (src/ast/*.ts) might need
// attention.
//
// Usage:
//   bun scripts/diff-ast.ts OLD.json NEW.json
//
// Exit codes:
//   0 — no added / removed rules, no action-body changes
//   1 — any of the above — callers can use this for CI gating
//   2 — bad arguments
//
// What we report:
//   * Added stable keys      — rules new in NEW.  Need a handler.
//   * Removed stable keys    — rules dropped from OLD.  Handlers are dead.
//   * Action-changed keys    — same key, different `actionC`.  Our AST
//                              may not care (we don't transpile action
//                              code), but worth a skim.

import { readFileSync } from 'node:fs';
import { buildSymbolName, stableKeyForRule } from '../src/ast/dispatch.ts';
import type { DumpRule, LemonDump } from '../src/lempar.ts';

// Narrow dev-dump shape.  We read `rules[]` (plus the dev-only fields
// `actionC` / `noCode`) and the top-level `symbols[]` table used to
// resolve stable keys.
interface DevRule extends DumpRule {
  readonly actionC: string | null;
  readonly noCode: boolean;
}
interface DevDump {
  readonly rules: readonly DevRule[];
  readonly symbols: LemonDump['symbols'];
}

function readDump(path: string): DevDump {
  return JSON.parse(readFileSync(path, 'utf8')) as DevDump;
}

function main(): void {
  const [oldPath, newPath] = process.argv.slice(2);
  if (!oldPath || !newPath) {
    console.error('usage: bun scripts/diff-ast.ts OLD.json NEW.json');
    process.exit(2);
  }

  const oldDump = readDump(oldPath);
  const newDump = readDump(newPath);

  const byKey = (d: DevDump) => {
    const symbolName = buildSymbolName(d);
    return new Map(
      d.rules.map((r) => [stableKeyForRule(r, symbolName), r] as const),
    );
  };

  const oldByKey = byKey(oldDump);
  const newByKey = byKey(newDump);

  const added: string[] = [];
  const removed: string[] = [];
  const actionChanged: string[] = [];

  for (const k of newByKey.keys()) if (!oldByKey.has(k)) added.push(k);
  for (const k of oldByKey.keys()) if (!newByKey.has(k)) removed.push(k);

  for (const [k, oldRule] of oldByKey) {
    const newRule = newByKey.get(k);
    if (!newRule) continue;
    if ((oldRule.actionC ?? '') !== (newRule.actionC ?? '')) {
      actionChanged.push(k);
    }
  }

  const print = (heading: string, keys: string[]) => {
    if (keys.length === 0) return;
    console.log(`\n## ${heading} (${keys.length})`);
    for (const k of keys.sort()) console.log(`  ${k}`);
  };

  print('Added (need a handler)', added);
  print('Removed (handler is dead)', removed);
  print('Action body changed (shape identical)', actionChanged);

  if (
    added.length === 0 &&
    removed.length === 0 &&
    actionChanged.length === 0
  ) {
    console.log('No grammar-shape or action-body changes.');
  }

  process.exit(added.length || removed.length || actionChanged.length ? 1 : 0);
}

main();
