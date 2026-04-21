import type { Diagnostic } from "./diagnostics.ts"
import type { Token } from "./tokenize.ts"

/**
 * Build a Diagnostic for an ILLEGAL token that the tokenizer could not
 * classify. No grammar state is consulted.
 */
export function buildIllegalTokenDiagnostic(token: Token): Diagnostic {
  const hints = [{ message: illegalTokenHint(token.text) }]
  const escapedText = JSON.stringify(token.text)
  if (escapedText.slice(1, -1) !== String(token.text)) {
    hints.push({ message: `escaped token text: ${escapedText}` })
  }
  return {
    message: `unrecognized token: "${token.text}"`,
    span: token.span,
    token,
    hints,
  }
}

function illegalTokenHint(text: string): string {
  if (text.startsWith("'")) return "unterminated string literal"
  if (text.startsWith('"') || text.startsWith("`") || text.startsWith("[")) {
    return "unterminated quoted identifier"
  }
  if (/^[0-9.]/.test(text)) return "malformed numeric literal"
  return "the tokenizer could not classify this input"
}
