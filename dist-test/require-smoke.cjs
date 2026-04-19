"use strict"

const pkg = require("sqlite3-parser")
const { cst, errors } = pkg.parse("SELECT 1")
const mod = pkg.withOptions({ digitSeparator: "_" })
const tokenNames = Array.from(mod.tokenize("SELECT 1_000"), (token) => mod.tokenName(token.type))

process.stdout.write(
  JSON.stringify({
    errors: errors.length,
    cst: cst && cst.name,
    version: pkg.SQLITE_VERSION,
    withOptions: typeof pkg.withOptions === "function",
    createEngine: typeof pkg.createEngine === "function",
    legacy: {
      createParser: "createParser" in pkg,
      createTokenizer: "createTokenizer" in pkg,
      sqliteLib: "SQLITE_LIB" in pkg,
    },
    tokenNames,
  }),
)
