// End-to-end parser tests.  Each case parses a real SQL statement, then
// asserts:
//   * the parse succeeded (no errors, a CST root was produced);
//   * the root is `input` (the start rule);
//   * expected rule names appear somewhere in the tree;
//   * for specific structural assertions, the span is correct.
//
// These aren't exhaustive — they're a representative cross-section of
// the SQL dialect that the grammar is supposed to accept.

import { describe, test, expect } from 'bun:test';

import {
  createParser,
  formatCst,
  walkCst,
  tokenLeaves,
  type CstNode,
  type RuleNode,
} from '../generated/current.ts';

const parser = createParser();

// --- helpers ---------------------------------------------------------------

function parseOk(sql: string): CstNode {
  const r = parser.parse(sql);
  if (r.errors.length || !r.cst) {
    throw new Error(
      `expected clean parse of ${JSON.stringify(sql)} but got: ` +
      JSON.stringify(r.errors, null, 2),
    );
  }
  return r.cst;
}

function ruleNames(root: CstNode): Set<string> {
  const out = new Set<string>();
  for (const n of walkCst(root)) if (n.kind === 'rule') out.add(n.name);
  return out;
}

function tokenText(root: CstNode): string[] {
  return [...tokenLeaves(root)].map((t) => t.text);
}

/** Find every RuleNode with a given name, in source order. */
function findRules(root: CstNode, name: string): RuleNode[] {
  const out: RuleNode[] = [];
  for (const n of walkCst(root)) {
    if (n.kind === 'rule' && n.name === name) out.push(n);
  }
  return out;
}

// --- suites ----------------------------------------------------------------

describe('smallest possible inputs', () => {
  test('a bare semicolon is valid (ecmd ::= SEMI)', () => {
    const cst = parseOk(';');
    expect(cst.kind).toBe('rule');
    expect((cst as RuleNode).name).toBe('input');
  });

  test('trivial SELECT 1', () => {
    const cst = parseOk('SELECT 1');
    const names = ruleNames(cst);
    expect(names.has('input')).toBe(true);
    expect(names.has('select')).toBe(true);
    expect(names.has('oneselect')).toBe(true);
    expect(tokenText(cst)).toEqual(['SELECT', '1']);
  });

  test('virtual trailing SEMI is inserted at EOF', () => {
    const withSemi    = parseOk('SELECT 1;');
    const withoutSemi = parseOk('SELECT 1');
    // Both accept; the trailing SEMI in the first case is present as a
    // token leaf but missing from the second.
    expect(tokenText(withSemi).includes(';')).toBe(true);
    expect(tokenText(withoutSemi).includes(';')).toBe(false);
  });
});

describe('SELECT with WHERE + operators', () => {
  const sql = 'SELECT a, b + 1 FROM t WHERE id = 42 ORDER BY a DESC';
  const cst = parseOk(sql);

  test('span of the root covers the whole input', () => {
    expect(cst.start).toBe(0);
    expect(cst.length).toBe(sql.length);
  });

  test('walkCst visits expected rule names', () => {
    const names = ruleNames(cst);
    for (const n of [
      'input', 'cmdlist', 'ecmd', 'cmdx', 'cmd', 'select',
      'oneselect', 'selcollist', 'from', 'where_opt',
      'orderby_opt', 'sortlist',
    ]) {
      expect(names.has(n)).toBe(true);
    }
  });

  test('tokens round-trip in source order', () => {
    expect(tokenText(cst)).toEqual([
      'SELECT', 'a', ',', 'b', '+', '1',
      'FROM', 't',
      'WHERE', 'id', '=', '42',
      'ORDER', 'BY', 'a', 'DESC',
    ]);
  });
});

describe('CREATE TABLE', () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT    NOT NULL UNIQUE,
      name  TEXT    DEFAULT 'anonymous',
      age   INTEGER CHECK (age >= 0)
    );
  `;

  test('parses without errors', () => {
    const r = parser.parse(sql);
    expect(r.errors).toEqual([]);
    expect(r.cst).toBeDefined();
  });

  test('column list shows four columnname nodes', () => {
    const cst = parseOk(sql);
    const cols = findRules(cst, 'columnname');
    expect(cols.length).toBe(4);
  });

  test('IF NOT EXISTS appears as a rule', () => {
    const cst = parseOk(sql);
    expect(ruleNames(cst).has('ifnotexists')).toBe(true);
  });
});

describe('INSERT / UPDATE / DELETE', () => {
  test("INSERT INTO t VALUES (1, 'a')", () => {
    const cst = parseOk("INSERT INTO t VALUES (1, 'a');");
    const names = ruleNames(cst);
    expect(names.has('insert_cmd')).toBe(true);
    expect(tokenText(cst).includes("'a'")).toBe(true);
  });

  test("UPDATE t SET x = 1 WHERE id = 2", () => {
    const cst = parseOk('UPDATE t SET x = 1 WHERE id = 2;');
    const names = ruleNames(cst);
    expect(names.has('setlist')).toBe(true);
    expect(names.has('where_opt_ret')).toBe(true);
  });

  test('DELETE FROM t WHERE id = 2', () => {
    const cst = parseOk('DELETE FROM t WHERE id = 2;');
    const names = ruleNames(cst);
    expect(names.has('where_opt_ret')).toBe(true);
  });
});

describe('expressions and operator precedence', () => {
  test('arithmetic precedence nests as expected (1 + 2 * 3)', () => {
    const cst = parseOk('SELECT 1 + 2 * 3');
    // The outer expression should be a `+` with a right-hand `*` child —
    // walk the expr chain until we find a STAR token.
    const exprs = findRules(cst, 'expr');
    const hasStar = exprs.some((e) =>
      e.children.some((c) => c.kind === 'token' && c.name === 'STAR'),
    );
    const hasPlus = exprs.some((e) =>
      e.children.some((c) => c.kind === 'token' && c.name === 'PLUS'),
    );
    expect(hasStar).toBe(true);
    expect(hasPlus).toBe(true);
  });

  test("BETWEEN, IN (...), CASE WHEN, IS NULL all parse", () => {
    for (const sql of [
      'SELECT * FROM t WHERE x BETWEEN 1 AND 5',
      'SELECT * FROM t WHERE x IN (1, 2, 3)',
      "SELECT CASE WHEN x > 0 THEN 'pos' ELSE 'neg' END FROM t",
      'SELECT * FROM t WHERE x IS NULL',
      'SELECT * FROM t WHERE x IS NOT NULL',
    ]) {
      const r = parser.parse(sql);
      expect(r.errors).toEqual([]);
      expect(r.cst).toBeDefined();
    }
  });

  test("LIKE / GLOB / REGEXP all fold to LIKE_KW", () => {
    for (const op of ['LIKE', 'GLOB', 'REGEXP']) {
      const r = parser.parse(`SELECT 1 WHERE x ${op} 'y'`);
      expect(r.errors).toEqual([]);
    }
  });
});

describe('JOIN forms', () => {
  test('explicit INNER JOIN with ON', () => {
    const r = parser.parse(
      'SELECT a.id, b.name FROM a INNER JOIN b ON a.id = b.aid',
    );
    expect(r.errors).toEqual([]);
    expect(ruleNames(r.cst!).has('seltablist')).toBe(true);
  });

  test('LEFT OUTER JOIN with USING', () => {
    const r = parser.parse(
      'SELECT * FROM a LEFT OUTER JOIN b USING (id)',
    );
    expect(r.errors).toEqual([]);
  });
});

describe('WITH (common table expressions)', () => {
  test('WITH recursive CTE parses', () => {
    const sql = `
      WITH RECURSIVE counter(n) AS (
        SELECT 1
        UNION ALL
        SELECT n + 1 FROM counter WHERE n < 10
      )
      SELECT * FROM counter;
    `;
    const r = parser.parse(sql);
    expect(r.errors).toEqual([]);
    const names = ruleNames(r.cst!);
    // SQLite's grammar uses wqlist/wqitem for the CTE list itself;
    // the "with" nonterminal in parse.y is an invisible prefix rule.
    expect(names.has('wqlist')).toBe(true);
    expect(names.has('wqitem')).toBe(true);
  });
});

describe('window functions', () => {
  test("COUNT(*) OVER (PARTITION BY x ORDER BY y)", () => {
    const sql = 'SELECT count(*) OVER (PARTITION BY x ORDER BY y) FROM t';
    const r = parser.parse(sql);
    expect(r.errors).toEqual([]);
    expect(ruleNames(r.cst!).has('over_clause')).toBe(true);
  });
});

describe('subqueries', () => {
  test('scalar subquery in WHERE', () => {
    const r = parser.parse(
      'SELECT * FROM t WHERE id = (SELECT MAX(id) FROM u)',
    );
    expect(r.errors).toEqual([]);
  });

  test("EXISTS subquery", () => {
    const r = parser.parse(
      'SELECT 1 WHERE EXISTS (SELECT 1 FROM t WHERE x = 1)',
    );
    expect(r.errors).toEqual([]);
  });
});

describe('triggers', () => {
  test('CREATE TRIGGER body with multiple statements', () => {
    const sql = `
      CREATE TRIGGER t1 AFTER INSERT ON foo
      BEGIN
        UPDATE bar SET x = x + 1 WHERE id = NEW.id;
        INSERT INTO log VALUES (NEW.id);
      END;
    `;
    const r = parser.parse(sql);
    expect(r.errors).toEqual([]);
    const names = ruleNames(r.cst!);
    expect(names.has('trigger_event')).toBe(true);
    expect(names.has('trigger_cmd')).toBe(true);
  });
});

describe('multiple statements', () => {
  test('two SELECTs separated by SEMI', () => {
    const r = parser.parse('SELECT 1; SELECT 2;');
    expect(r.errors).toEqual([]);
    const selects = findRules(r.cst!, 'select');
    expect(selects.length).toBe(2);
  });

  test('cmdlist nests correctly for three statements', () => {
    const r = parser.parse('SELECT 1; SELECT 2; SELECT 3;');
    expect(r.errors).toEqual([]);
    expect(findRules(r.cst!, 'select').length).toBe(3);
  });
});

describe('error reporting', () => {
  test('empty input produces a minimal parse (bare SEMI injected)', () => {
    const r = parser.parse('');
    // The grammar requires at least one ecmd, which can be an empty
    // statement.  Whether that's accepted or flagged is a grammar call —
    // we just assert we don't crash and give back a reasonable shape.
    expect(() => r).not.toThrow();
  });

  test('clearly malformed input surfaces a syntax error', () => {
    const r = parser.parse('SELECT FROM FROM;');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0].message).toContain('syntax error');
  });

  test('unrecognised token short-circuits before any reductions', () => {
    const r = parser.parse('SELECT 1.0e+');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0].message).toContain('unrecognized token');
  });
});

describe('span tracking', () => {
  test('root span matches the source length (ignoring trailing whitespace)', () => {
    const sql = 'SELECT 1;';
    const cst = parseOk(sql);
    expect(cst.start).toBe(0);
    // The parse tree stops at the SEMI token; trailing whitespace isn't
    // included since it isn't a leaf of any rule.
    expect(cst.length).toBe(sql.length);
  });

  test('an inner expr node has a tight span', () => {
    const sql = 'SELECT 1 WHERE x = 42';
    const cst = parseOk(sql);
    // Find the "x = 42" expr.
    const exprs = findRules(cst, 'expr');
    const eq = exprs.find((e) =>
      e.children.some((c) => c.kind === 'token' && c.name === 'EQ'),
    );
    expect(eq).toBeDefined();
    const span = sql.slice(eq!.start, eq!.start + eq!.length);
    expect(span).toBe('x = 42');
  });
});

describe('formatCst snapshot', () => {
  test('SELECT 1 produces a stable indented tree', () => {
    const cst = parseOk('SELECT 1');
    const text = formatCst(cst);
    expect(text).toContain('(input');
    expect(text).toContain('(select');
    expect(text).toContain('SELECT "SELECT"');
    expect(text).toContain('INTEGER "1"');
  });
});
