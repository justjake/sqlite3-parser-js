import type { ParseDiagnostic } from "./diagnostics"

const Sqlite3ParserErrorSymbol = Symbol("Sqlite3ParserError")

/** Base class for semantic errors thrown by this package. */
export class Sqlite3ParserError extends Error {
  static wrap<E extends Error>(error: E): Sqlite3ParserError {
    if (error instanceof Sqlite3ParserError) {
      return error
    }
    return new Sqlite3ParserError(error.stack ?? `${error.name}: ${error.message}`, {
      cause: error,
    }) as Sqlite3ParserError
  }

  readonly [Sqlite3ParserErrorSymbol]: true = true

  /** toJSON provided so all error properties appear in structured logging. */
  toJSON(): object {
    return Object.assign(
      {
        name: this.name,
        message: this.message,
        stack: this.stack,
        cause: this.cause,
      },
      this,
    )
  }
}

/** Error thrown when `parse(sql, { throw: true })` returns one or more diagnostics. */
export class Sqlite3ParserDiagnosticError extends Sqlite3ParserError {
  /** Individual diagnostics that contributed to this error. */
  declare readonly errors: readonly ParseDiagnostic[]

  constructor(diagnostics: readonly ParseDiagnostic[]) {
    let message = ""
    switch (diagnostics.length) {
      case 0:
        message = "No diagnostics provided when constructing error"
        break
      case 1:
        message = diagnostics[0].format()
        break
      default:
        message = `${diagnostics.length} diagnostics:\n${diagnostics.map((d) => d.format()).join("\n")}`
    }
    super(message)
    this.errors = diagnostics
  }
}
