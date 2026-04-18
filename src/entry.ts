// Bundling entry point: bakes the JSON dumps into the bundle at build
// time via Bun's JSON import, exporting a ready-to-use parser plus the
// CST helpers.  Used both for sample bundles and for sizing.
//
// This file imports the *.dev.json variants (full dumps, with rule
// action C source and symbol metadata preserved).  See entry-slim.ts
// for the production import path that imports *.prod.json — every
// field the runtime reads is preserved by the slimmer, so switching
// between them requires no other changes.

import parserDump   from '../generated/3.54.0/parser.dev.json'   with { type: 'json' };
import keywordsDump from '../generated/3.54.0/keywords.dev.json' with { type: 'json' };
import { createParser } from './parser.ts';

export const parser = createParser(parserDump as any, keywordsDump as any);
export { formatCst, walkCst, tokenLeaves } from './parser.ts';
