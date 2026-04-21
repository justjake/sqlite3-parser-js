#!/usr/bin/env -S bun run
// scripts/md-to-test.ts — emit a bun:test file from a Markdown doc's
// fenced code blocks so that each ```ts / ```js block is executed as a
// test.  Two things are verified per block:
//
//   1. Lines with an assertion marker after a `console.{log,error}(…)`
//      call are turned into assertions on the most recent line written
//      to the relevant stream (stdout for `log`, stderr for `error`):
//
//        console.log(x) // -> 42
//        console.log(s) // -> "hello"   // quoted → JSON-parsed
//        console.error(e.message) // -v
//        // line one
//        // line two                    // `-v` consumes the following
//        //                             // `//` comment block as the
//        //                             // expected multi-line value
//
//   2. The full captured { stdout, stderr, threw? } is snapshotted so
//      any unmarked console output — or the absence of it — is also
//      pinned down.
//
// Usage:
//
//   bun scripts/md-to-test.ts README.md > test/readme.generated.test.ts
//
// The output is self-contained (imports everything it needs from the
// local package path).  CI can enforce freshness by regenerating and
// running `git diff --exit-code`.

import { readFileSync } from "node:fs"

import { CliUsageError, rootRelativePath, runScript } from "./utils.ts"

const RUNNABLE_LANGS = new Set(["ts", "typescript", "js", "javascript"])

interface Block {
  lang: string
  /** 1-based line number of the first code line inside the fence. */
  startLine: number
  code: string
}

function extractCodeBlocks(md: string): Block[] {
  const blocks: Block[] = []
  const lines = md.split("\n")
  let i = 0
  while (i < lines.length) {
    const fence = lines[i]!.match(/^```(\w+)\s*$/)
    if (!fence) {
      i++
      continue
    }
    const lang = fence[1]!
    const startLine = i + 2
    i++
    const code: string[] = []
    while (i < lines.length && !lines[i]!.startsWith("```")) {
      code.push(lines[i]!)
      i++
    }
    blocks.push({ lang, startLine, code: code.join("\n") })
    i++
  }
  return blocks
}

// Matches a standalone console.{log,error}(...) statement with either
// an `// -> <expected>` single-line marker or an `// -v` multi-line
// marker (where the expected value is the following `// …` block).
// The call must be the whole line (indent + call + optional `;` +
// marker) — we don't try to untangle multi-statement lines.
const SINGLE_MARKER_RE =
  /^(?<indent>\s*)(?<call>console\.(?<method>log|error)\(.*\))\s*;?\s*\/\/\s*->\s*(?<expected>.*)$/
const MULTI_MARKER_RE =
  /^(?<indent>\s*)(?<call>console\.(?<method>log|error)\(.*\))\s*;?\s*\/\/\s*-v\s*$/
/** A continuation line after `// -v`: any `// …` comment, including
 *  the blank-comment `//` that represents an empty output line. */
const CONTINUATION_RE = /^\s*\/\/(?: (?<content>.*))?$/

/** Interpret the raw text after `// -> `.  If the text parses as
 *  JSON, use the parsed value formatted the same way `console.log`
 *  would format it at runtime (strings are emitted verbatim; other
 *  values go through `Bun.inspect`, matching our capture helper).
 *  This lets markers written naturally — `// -> 2`, `// -> "foo"`,
 *  `// -> ["t"]` — match the captured console output directly.
 *  When the value doesn't parse as JSON (e.g. `// -> SelectStmt`),
 *  fall back to the raw trimmed text — that covers the common case
 *  of bare identifiers. */
function parseSingleExpected(raw: string): string {
  const trimmed = raw.trim()
  try {
    const parsed = JSON.parse(trimmed) as unknown
    return typeof parsed === "string" ? parsed : Bun.inspect(parsed)
  } catch {
    return trimmed
  }
}

/** Strip `import … from "sqlite3-parser…"` lines.  Imports are hoisted
 *  to the top of the generated file. */
function stripPackageImports(code: string): string {
  return code.replace(/^\s*import\b[^;\n]*from\s+["']sqlite3-parser(?:\/\w+)?["']\s*;?\s*$/gm, "")
}

/** `export type`/`export interface` at top-level of a code block don't
 *  survive being wrapped in a function body — drop the `export` so the
 *  declaration remains valid (and erased at runtime by the transpiler). */
function dropTopLevelExports(code: string): string {
  return code.replace(/^(\s*)export\s+(type|interface)\s+/gm, "$1$2 ")
}

function emitAssertion(
  out: string[],
  indent: string,
  call: string,
  method: string,
  expected: string,
): void {
  const stream = method === "log" ? "stdout" : "stderr"
  out.push(`${indent}${call}`)
  out.push(`${indent}expect(__captured.${stream}.at(-1)).toBe(${JSON.stringify(expected)})`)
}

function transformBlock(code: string): string {
  const lines = dropTopLevelExports(stripPackageImports(code)).split("\n")
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    const multi = MULTI_MARKER_RE.exec(line)
    if (multi?.groups) {
      const { indent, call, method } = multi.groups as Record<string, string>
      const expectedLines: string[] = []
      while (i + 1 < lines.length) {
        const cont = CONTINUATION_RE.exec(lines[i + 1]!)
        if (!cont) break
        expectedLines.push(cont.groups?.content ?? "")
        i++
      }
      emitAssertion(out, indent, call, method, expectedLines.join("\n"))
      continue
    }

    const single = SINGLE_MARKER_RE.exec(line)
    if (single?.groups) {
      const { indent, call, method, expected } = single.groups as Record<string, string>
      emitAssertion(out, indent, call, method, parseSingleExpected(expected))
      continue
    }

    out.push(line)
  }
  return out.join("\n")
}

function indent(code: string, prefix: string): string {
  return code
    .split("\n")
    .map((line) => (line.length > 0 ? prefix + line : line))
    .join("\n")
}

function emitTestFile(sourcePath: string, blocks: Block[]): string {
  const relSource = rootRelativePath(sourcePath)
  const header = `// GENERATED by scripts/md-to-test.ts — do not edit.
// Source: ${relSource}
// Regenerate: bun scripts/md-to-test.ts ${relSource} > test/readme.generated.test.ts

import { describe, expect, test } from "bun:test"

import {
  parse,
  parseStmt,
  parseOrThrow,
  parseStmtOrThrow,
  Sqlite3ParserDiagnosticError,
  Sqlite3ParserError,
  traverse,
  VisitorKeys,
} from "../generated/current.ts"
import type { Span, Token } from "../generated/current.ts"

interface Capture {
  stdout: string[]
  stderr: string[]
}

function captureConsole(): { captured: Capture; restore: () => void } {
  const captured: Capture = { stdout: [], stderr: [] }
  const origLog = console.log
  const origErr = console.error
  const render = (args: unknown[]): string =>
    args.map((a) => (typeof a === "string" ? a : Bun.inspect(a))).join(" ")
  console.log = (...args: unknown[]) => {
    captured.stdout.push(render(args))
  }
  console.error = (...args: unknown[]) => {
    captured.stderr.push(render(args))
  }
  return {
    captured,
    restore() {
      console.log = origLog
      console.error = origErr
    },
  }
}

interface ThrownSummary {
  name: string
  message: string
}

function summarizeThrown(value: unknown): ThrownSummary {
  if (value instanceof Error) {
    return { name: value.constructor.name, message: value.message }
  }
  return { name: "unknown", message: String(value) }
}

/** True if the error came from a failed \`expect(...)\` call — we
 *  want those to fail the enclosing test loudly, not be folded into
 *  the block's captured-throw snapshot. */
function isAssertionError(value: unknown): boolean {
  if (!(value instanceof Error)) return false
  return value.message.startsWith("expect(received)")
}
`

  const tests = blocks.map((block) => {
    const transformed = transformBlock(block.code)
    const body = indent(transformed, "      ")
    const title = `README.md:${block.startLine} (${block.lang})`
    return `  test(${JSON.stringify(title)}, () => {
    const { captured: __captured, restore: __restore } = captureConsole()
    let __threw: unknown
    try {
${body}
    } catch (e) {
      if (isAssertionError(e)) throw e
      __threw = e
    } finally {
      __restore()
    }
    expect({
      stdout: __captured.stdout,
      stderr: __captured.stderr,
      threw: __threw === undefined ? undefined : summarizeThrown(__threw),
    }).toMatchSnapshot()
  })`
  })

  return `${header}
describe(${JSON.stringify(`${relSource} code blocks`)}, () => {
${tests.join("\n\n")}
})
`
}

await runScript(
  import.meta.main,
  { usage: "usage: bun scripts/md-to-test.ts <markdown-file> > <test-file>" },
  ({ positionals }) => {
    const [source] = positionals
    if (!source) throw new CliUsageError("missing path to the markdown file")

    const md = readFileSync(source, "utf8")
    const blocks = extractCodeBlocks(md).filter((b) => RUNNABLE_LANGS.has(b.lang))
    if (blocks.length === 0) {
      throw new CliUsageError(`${source}: no runnable fenced code blocks found`)
    }

    process.stdout.write(emitTestFile(source, blocks))
  },
)
