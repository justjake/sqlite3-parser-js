"use strict"
;(async () => {
  const pkg = await import("sqlite3-parser")
  const traversePkg = await import("sqlite3-parser/traverse")
  const result = pkg.parse("SELECT 1")
  const mod = pkg.withOptions({ digitSeparator: "_" })
  const tokenNames = Array.from(mod.tokenize("SELECT 1_000"), (token) => mod.tokenName(token.type))
  const traverseKinds = []

  if (result.status !== "ok") {
    throw new Error(`expected ok parse result, got ${result.status}`)
  }

  traversePkg.traverse(result.root, {
    enter(node) {
      traverseKinds.push(node.type)
    },
  })

  process.stdout.write(
    JSON.stringify({
      status: result.status,
      astKind: result.root.type,
      version: pkg.SQLITE_VERSION,
      withOptions: typeof pkg.withOptions === "function",
      createEngine: typeof pkg.createEngine === "function",
      legacy: {
        createParser: "createParser" in pkg,
        createTokenizer: "createTokenizer" in pkg,
        sqliteLib: "SQLITE_LIB" in pkg,
      },
      tokenNames,
      traverseKinds,
    }),
  )
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
