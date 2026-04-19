import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';

test('main entrypoint parses SQL', async () => {
  const pkg = await import('sqlite3-parser');
  const { cst, errors } = pkg.parse('SELECT 1');

  assert.equal(errors.length, 0);
  assert.equal(cst?.name, 'input');
  assert.equal(pkg.SQLITE_LIB, 'sqlite');
  assert.match(pkg.SQLITE_VERSION, /^\d+\.\d+\.\d+$/);
});

test('versioned subpath import works', async () => {
  const main = await import('sqlite3-parser');
  const pinned = await import(`sqlite3-parser/sqlite-${main.SQLITE_VERSION}`);
  const { cst, errors } = pinned.parse('SELECT 1');

  assert.equal(errors.length, 0);
  assert.equal(cst?.name, 'input');
  assert.equal(pinned.SQLITE_VERSION, main.SQLITE_VERSION);
});

test('main entrypoint can be required from commonjs', () => {
  const output = execFileSync(
    process.execPath,
    [join(process.cwd(), 'require-smoke.cjs')],
    { encoding: 'utf8' },
  );
  const result = JSON.parse(output);

  assert.equal(result.errors, 0);
  assert.equal(result.cst, 'input');
  assert.equal(result.lib, 'sqlite');
  assert.match(result.version, /^\d+\.\d+\.\d+$/);
});

test('tokenizer smoke works', async () => {
  const pkg = await import('sqlite3-parser');
  const tokenizer = pkg.createTokenizer({ digitSeparator: '_' });
  const tokens = Array.from(tokenizer.tokenize('SELECT 1_000'));

  assert.deepEqual(
    tokens.map((token) => pkg.tokenName(token.type)),
    ['SELECT', 'QNUMBER'],
  );
});

test('parser CLI runs under node', () => {
  const cli = join(
    process.cwd(),
    'node_modules',
    'sqlite3-parser',
    'dist',
    'bin',
    'sqlite3-parser.js',
  );
  const output = execFileSync(process.execPath, [cli, 'SELECT 1'], {
    encoding: 'utf8',
  });

  assert.match(output, /"name": "input"/);
});

test('tokenizer CLI runs under node', () => {
  const cli = join(
    process.cwd(),
    'node_modules',
    'sqlite3-parser',
    'dist',
    'bin',
    'sqlite3-tokenizer.js',
  );
  const output = execFileSync(process.execPath, [cli, 'SELECT 1'], {
    encoding: 'utf8',
  });
  const lines = output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));

  assert.deepEqual(
    lines.map((line) => line.name),
    ['SELECT', 'INTEGER'],
  );
});
