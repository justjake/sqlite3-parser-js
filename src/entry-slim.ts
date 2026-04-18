// Same as entry.ts but bakes in the slim dumps produced by
// scripts/slim-dump.ts.  Used purely for bundle-size measurement.

import parserDump   from '../dist/parser.slim.json'   with { type: 'json' };
import keywordsDump from '../dist/keywords.slim.json' with { type: 'json' };
import { createParser } from './parser.ts';

export const parser = createParser(parserDump as any, keywordsDump as any);
export { formatCst, walkCst, tokenLeaves } from './parser.ts';
