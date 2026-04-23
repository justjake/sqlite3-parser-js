// Non-generated test for grammar rules that can't be reached through
// the default `parseOrThrow`-based sqllogictest driver:
//
//   * tridxby (#306 / #307) — INDEXED BY / NOT INDEXED inside a
//     trigger body's UPDATE/DELETE.  The reducer fires, but the
//     action body emits a semantic diagnostic, so `parseOrThrow`
//     throws and the SLT test fails.  Using `parse()` directly lets
//     the reduction count as covered without failing on the expected
//     diagnostic.
//
//   * term ::= QNUMBER (#386) — requires the `digitSeparator` option
//     on the parser, which the default-bound `parse()` doesn't enable.
//
// Each case here exists specifically to move a rule-coverage needle
// the fixture corpus can't.

import { expect, test } from "bun:test"

import { parse, withOptions } from "../../generated/current.ts"

test("#306 tridxby ::= INDEXED BY nm fires in trigger body reducer", () => {
  const result = parse(
    "CREATE TRIGGER tr_idx BEFORE INSERT ON t1 BEGIN DELETE FROM t1 INDEXED BY ix WHERE a = 1; END",
  )
  expect(result.status).toBe("error")
  if (result.status !== "error") throw new Error("expected error")
  expect(result.errors[0]!.message).toContain("INDEXED BY clause is not allowed")
})

test("#307 tridxby ::= NOT INDEXED fires in trigger body reducer", () => {
  const result = parse(
    "CREATE TRIGGER tr_notidx BEFORE INSERT ON t1 BEGIN DELETE FROM t1 NOT INDEXED WHERE a = 1; END",
  )
  expect(result.status).toBe("error")
  if (result.status !== "error") throw new Error("expected error")
  expect(result.errors[0]!.message).toContain("NOT INDEXED clause is not allowed")
})

test("#386 term ::= QNUMBER fires when digitSeparator is enabled", () => {
  const { parseOrThrow } = withOptions({ digitSeparator: "_" })
  // Numeric literal with digit separators is emitted as QNUMBER by
  // the tokenizer, which reduces through term ::= QNUMBER.
  const { root } = parseOrThrow("SELECT 1_000_000")
  expect(root.type).toBe("CmdList")
})
