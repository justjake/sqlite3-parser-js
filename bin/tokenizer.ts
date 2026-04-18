#!/usr/bin/env bun
// Standalone tokenizer CLI.  Useful for poking at lexer edge cases —
// `bin/tokenizer.ts "SELECT 1_2_3"` answers "does this produce QNUMBER
// or ILLEGAL?" without a full parse.
//
// Reads parser.json + keywords.json from --dir (default: ../fixtures
// relative to this file) and prints every token as JSON
// `{type, name, start, length, text}`.  By default trivia (SPACE /
// COMMENT) is skipped; pass --include-trivia to see it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { createTokenizer } from '../src/tokenize.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(here, '..', 'fixtures');

interface CliOptions {
  dir: string;
  includeTrivia: boolean;
  digitSeparator: string | undefined;
  sqlParts: string[];
}

function usage(): string {
  return (
    'usage: bin/tokenizer.ts [--dir <path>] [--include-trivia]\n' +
    '                       [--digit-separator <char>] ["<sql>"]\n' +
    '  --dir               directory containing parser.json + keywords.json\n' +
    '                      (default: ../fixtures relative to this script)\n' +
    '  --include-trivia    emit SPACE / COMMENT tokens (default: skip)\n' +
    '  --digit-separator   single-char separator for numeric literals\n' +
    '                      (default: disabled; pass "_" for sqlite 3.45+)\n' +
    '  <sql>               SQL to tokenize.  If omitted, read from stdin.'
  );
}

function parseCli(argv: string[]): CliOptions {
  const opts: CliOptions = {
    dir: DEFAULT_DIR,
    includeTrivia: false,
    digitSeparator: undefined,
    sqlParts: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--dir') {
      if (i + 1 >= argv.length) throw new Error('missing value after --dir');
      opts.dir = resolve(argv[++i]!);
      continue;
    }
    if (a === '--include-trivia') { opts.includeTrivia = true; continue; }
    if (a === '--digit-separator') {
      if (i + 1 >= argv.length) throw new Error('missing value after --digit-separator');
      opts.digitSeparator = argv[++i]!;
      continue;
    }
    if (a === '-h' || a === '--help') {
      console.log(usage());
      process.exit(0);
    }
    opts.sqlParts.push(a);
  }
  return opts;
}

async function readSql(parts: string[]): Promise<string> {
  if (parts.length > 0) return parts.join(' ');
  if (!process.stdin.isTTY) {
    return (await Bun.stdin.text()).trimEnd();
  }
  console.error(usage());
  process.exit(2);
}

const cli = parseCli(Bun.argv.slice(2));
const sql = await readSql(cli.sqlParts);

const parserDump = JSON.parse(readFileSync(join(cli.dir, 'parser.json'), 'utf8'));
const keywordsDump = JSON.parse(readFileSync(join(cli.dir, 'keywords.json'), 'utf8'));
const tk = createTokenizer(parserDump, keywordsDump, {
  digitSeparator: cli.digitSeparator,
});

const out = [];
for (const tok of tk.tokenize(sql, { skipTrivia: !cli.includeTrivia })) {
  out.push({
    type: tok.type,
    name: tk.tokenName(tok.type),
    start: tok.start,
    length: tok.length,
    text: sql.slice(tok.start, tok.start + tok.length),
  });
}
console.log(JSON.stringify(out, null, 2));
