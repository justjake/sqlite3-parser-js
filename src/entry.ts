// Bundling entry point: bakes the JSON dumps into the bundle at build
// time via Bun's JSON import, exporting a ready-to-use parser plus the
// CST helpers.  Used both for sample bundles and for sizing.
//
// Switch the import paths from `fixtures/` (full dumps) to `dist/`
// (slim dumps produced by scripts/slim-dump.ts) to ship the slim
// version — every field the runtime reads is preserved by the slimmer,
// so no other change is required.

import parserDump   from '../fixtures/parser.json'   with { type: 'json' };
import keywordsDump from '../fixtures/keywords.json' with { type: 'json' };
import { createParser } from './parser.ts';

export const parser = createParser(parserDump as any, keywordsDump as any);
export { formatCst, walkCst, tokenLeaves } from './parser.ts';
