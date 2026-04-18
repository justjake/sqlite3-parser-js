#!/usr/bin/env bun
// Poke-at-a-failing-SQL CLI for the parser.  Not a production interface —
// designed so a developer can type `bin/parser.ts "SELECT …"` and see the
// CST (or the enhanced error diagnostic) without writing a throwaway
// script.
//
// Reads parser.json + keywords.json from --dir (default: ../generated
// relative to this file), parses the SQL, and prints the result as JSON
// (or pipes through formatCst for --pretty).  Exits non-zero on parse
// errors and writes each enhanced diagnostic to stderr in a readable
// multi-line format.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { createParser, formatCst, type ParseError } from '../src/parser.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(here, '..', 'generated');

interface CliOptions {
  dir: string;
  pretty: boolean;
  sqlParts: string[];
}

function usage(): string {
  return (
    'usage: bin/parser.ts [--dir <path>] [--pretty] ["<sql>"]\n' +
    '  --dir    directory containing parser.json + keywords.json\n' +
    '           (default: ../generated relative to this script)\n' +
    '  --pretty print the CST with formatCst() instead of JSON\n' +
    '  <sql>    SQL to parse.  If omitted, read from stdin.'
  );
}

function parseCli(argv: string[]): CliOptions {
  const opts: CliOptions = {
    dir: DEFAULT_DIR,
    pretty: false,
    sqlParts: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--dir') {
      if (i + 1 >= argv.length) throw new Error('missing value after --dir');
      opts.dir = resolve(argv[++i]!);
      continue;
    }
    if (a === '--pretty') { opts.pretty = true; continue; }
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

function formatError(e: ParseError): string {
  const lines: string[] = [];
  lines.push(e.canonical ?? e.message);
  if (e.line != null && e.col != null) {
    const range = e.range ? ` range [${e.range[0]}, ${e.range[1]}]` : '';
    lines.push(`  at line ${e.line}, col ${e.col}${range}`);
  }
  if (e.hint) lines.push(`  hint: ${e.hint}`);
  if (e.expected && e.expected.length > 0) {
    const list = e.expected.slice(0, 8).join(', ');
    const more = e.expected.length > 8 ? ', ...' : '';
    lines.push(`  expected: ${list}${more}`);
  }
  return lines.join('\n');
}

const cli = parseCli(Bun.argv.slice(2));
const sql = await readSql(cli.sqlParts);

const parserDump = JSON.parse(readFileSync(join(cli.dir, 'parser.json'), 'utf8'));
const keywordsDump = JSON.parse(readFileSync(join(cli.dir, 'keywords.json'), 'utf8'));
const parser = createParser(parserDump, keywordsDump);
const result = parser.parse(sql);

for (const err of result.errors) {
  console.error(formatError(err));
}

if (result.cst) {
  if (cli.pretty) {
    console.log(formatCst(result.cst));
  } else {
    console.log(JSON.stringify(result.cst, null, 2));
  }
}

process.exit(result.errors.length > 0 ? 1 : 0);
