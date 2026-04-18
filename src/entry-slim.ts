// Same as entry.ts but bakes in the prod (slim) dumps produced by the
// Makefile's *.prod.json targets.  Used for bundle-size measurement
// and the recommended production bundle entrypoint.

import parserDump   from '../generated/3.54.0/parser.prod.json'   with { type: 'json' };
import keywordsDump from '../generated/3.54.0/keywords.prod.json' with { type: 'json' };
import { createParser } from './parser.ts';

export const parser = createParser(parserDump as any, keywordsDump as any);
export { formatCst, walkCst, tokenLeaves } from './parser.ts';
