// Shared helpers for the tokenizer test suites.  Loads the JSON dumps
// produced by the patched lemon + mkkeywordhash once, then exposes a
// pre-built default tokenizer plus factories for tokenizers with
// custom options (digit separators, reduced flag sets, ...).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTokenizer } from '../src/tokenize.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'fixtures');

export const parserDump = JSON.parse(
  readFileSync(join(fixtures, 'parser.json')),
);
export const keywordsDump = JSON.parse(
  readFileSync(join(fixtures, 'keywords.json')),
);

/** Default tokenizer: every feature flag enabled, no digit separator. */
export const tk = createTokenizer(parserDump, keywordsDump);

/** Tokenizer with the `_` digit separator (SQLite 3.45+ default). */
export const tkSep = createTokenizer(parserDump, keywordsDump, {
  digitSeparator: '_',
});

/** Build a tokenizer with custom options (flags, digit separator). */
export function makeTokenizer(opts = {}) {
  return createTokenizer(parserDump, keywordsDump, opts);
}

/**
 * Tokenise `sql` and return an array of `{name, text}` pairs, with trivia
 * (SPACE + COMMENT) suppressed by default.  Pass `{skipTrivia: false}` to
 * include them.
 */
export function lex(sql, opts, t = tk) {
  const out = [];
  for (const tok of t.tokenize(sql, opts)) {
    out.push({
      name: t.tokenName(tok.type),
      text: sql.slice(tok.start, tok.start + tok.length),
    });
  }
  return out;
}

/** Shortcut for tests that only care about token names, not their text. */
export function lexNames(sql, opts, t = tk) {
  return lex(sql, opts, t).map((x) => x.name);
}

/**
 * Shortcut for single-token tests: tokenise `sql`, assert there is
 * exactly one token, return that token.  Trivia is skipped.
 */
export function lexOne(sql, t = tk) {
  const toks = lex(sql, undefined, t);
  if (toks.length !== 1) {
    throw new Error(
      `expected exactly one token, got ${toks.length}: ${JSON.stringify(toks)}`,
    );
  }
  return toks[0];
}
