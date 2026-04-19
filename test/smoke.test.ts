// High-level smoke tests covering every lexical feature at least once.
// The more exhaustive SQLite-ported suites live under test/sqlite/*.

import { describe, test, expect } from "bun:test"
import { tk, tkSep, makeTokenizer, lex, lexNames, keywordDefs } from "./helpers.ts"
import type { MaskFlag } from "../src/tokenize.ts"

describe("createTokenizer setup", () => {
  test("common terminal codes resolve from the parser defs", () => {
    expect(typeof tk.tokens.ID).toBe("number")
    expect(typeof tk.tokens.INTEGER).toBe("number")
    expect(tk.tokens.ID).not.toBe(tk.tokens.INTEGER)
  })

  test("loads the full keyword set (all flags enabled)", () => {
    expect(tk._keywordCount).toBe(148)
  })
})

describe("basic SQL", () => {
  test("SELECT 1", () => {
    expect(lex("SELECT 1")).toEqual([
      { name: "SELECT", text: "SELECT" },
      { name: "INTEGER", text: "1" },
    ])
  })

  test("case-insensitive keywords", () => {
    expect(lex("select Where From")).toEqual([
      { name: "SELECT", text: "select" },
      { name: "WHERE", text: "Where" },
      { name: "FROM", text: "From" },
    ])
  })

  test("mixed identifier and keyword", () => {
    expect(lex("SELECT name FROM users WHERE id = 42")).toEqual([
      { name: "SELECT", text: "SELECT" },
      { name: "ID", text: "name" },
      { name: "FROM", text: "FROM" },
      { name: "ID", text: "users" },
      { name: "WHERE", text: "WHERE" },
      { name: "ID", text: "id" },
      { name: "EQ", text: "=" },
      { name: "INTEGER", text: "42" },
    ])
  })
})

describe("numbers", () => {
  test("integers", () => {
    expect(lexNames("0 1 42 1234567890")).toEqual(["INTEGER", "INTEGER", "INTEGER", "INTEGER"])
  })

  test("floats (trailing dot, leading dot, exponents)", () => {
    expect(lex("3.14 .5 1e10 1.5e-3 2E+8")).toEqual([
      { name: "FLOAT", text: "3.14" },
      { name: "FLOAT", text: ".5" },
      { name: "FLOAT", text: "1e10" },
      { name: "FLOAT", text: "1.5e-3" },
      { name: "FLOAT", text: "2E+8" },
    ])
  })

  test("hex integers", () => {
    expect(lex("0x1A 0xff 0XBADF00D")).toEqual([
      { name: "INTEGER", text: "0x1A" },
      { name: "INTEGER", text: "0xff" },
      { name: "INTEGER", text: "0XBADF00D" },
    ])
  })

  test("digit-followed-by-identifier is ILLEGAL", () => {
    expect(lex("123foo")).toEqual([{ name: "ILLEGAL", text: "123foo" }])
  })
})

describe("strings and quoted identifiers", () => {
  test("'single quoted' is a STRING", () => {
    expect(lex("'hello'")).toEqual([{ name: "STRING", text: "'hello'" }])
  })

  test("escaped quote inside string", () => {
    expect(lex("'it''s ok'")).toEqual([{ name: "STRING", text: "'it''s ok'" }])
  })

  test('"double quoted" and `backtick` are IDs', () => {
    expect(lex('"col one" `col two`')).toEqual([
      { name: "ID", text: '"col one"' },
      { name: "ID", text: "`col two`" },
    ])
  })

  test("[bracketed] identifier", () => {
    expect(lex("[my col]")).toEqual([{ name: "ID", text: "[my col]" }])
  })

  test("unterminated string is ILLEGAL", () => {
    expect(lex("'oops")).toEqual([{ name: "ILLEGAL", text: "'oops" }])
  })
})

describe("comments and whitespace", () => {
  test("-- line comment is skipped by default", () => {
    expect(lex("SELECT 1 -- a comment\n")).toEqual([
      { name: "SELECT", text: "SELECT" },
      { name: "INTEGER", text: "1" },
    ])
  })

  test("trivia kept when skipTrivia:false", () => {
    expect(lexNames("SELECT -- c\n1", { skipTrivia: false })).toEqual([
      "SELECT",
      "SPACE",
      "COMMENT",
      "SPACE",
      "INTEGER",
    ])
  })

  test("/* block comment */", () => {
    expect(lexNames("/* hi */ SELECT", { skipTrivia: false })).toEqual([
      "COMMENT",
      "SPACE",
      "SELECT",
    ])
  })

  test("unterminated /* block comment is still COMMENT (consumed to EOI)", () => {
    expect(lexNames("/* never closes", { skipTrivia: false })).toEqual(["COMMENT"])
  })
})

describe("operators", () => {
  test("arithmetic", () => {
    expect(lexNames("1+2-3*4/5%6")).toEqual([
      "INTEGER",
      "PLUS",
      "INTEGER",
      "MINUS",
      "INTEGER",
      "STAR",
      "INTEGER",
      "SLASH",
      "INTEGER",
      "REM",
      "INTEGER",
    ])
  })

  test("comparison: = == != <> < <= > >=", () => {
    expect(lexNames("= == != <> < <= > >=")).toEqual([
      "EQ",
      "EQ",
      "NE",
      "NE",
      "LT",
      "LE",
      "GT",
      "GE",
    ])
  })

  test("shifts << and >>", () => {
    expect(lexNames("<< >>")).toEqual(["LSHIFT", "RSHIFT"])
  })

  test("bitwise & | ~", () => {
    expect(lexNames("& | ~")).toEqual(["BITAND", "BITOR", "BITNOT"])
  })

  test("concat ||", () => {
    expect(lexNames("'a'||'b'")).toEqual(["STRING", "CONCAT", "STRING"])
  })

  test("JSON -> and ->>", () => {
    expect(lex("data->'k'  data->>'k'")).toEqual([
      { name: "ID", text: "data" },
      { name: "PTR", text: "->" },
      { name: "STRING", text: "'k'" },
      { name: "ID", text: "data" },
      { name: "PTR", text: "->>" },
      { name: "STRING", text: "'k'" },
    ])
  })

  test("grouping and punctuation", () => {
    expect(lexNames("(a, b);")).toEqual(["LP", "ID", "COMMA", "ID", "RP", "SEMI"])
  })
})

describe("variables", () => {
  test("positional ?", () => {
    expect(lexNames("?")).toEqual(["VARIABLE"])
  })
  test("positional ?123", () => {
    expect(lex("?123")).toEqual([{ name: "VARIABLE", text: "?123" }])
  })
  test("named $foo, @foo, :foo, #foo", () => {
    expect(lex("$x @y :z #w").map((t) => t.text)).toEqual(["$x", "@y", ":z", "#w"])
  })
})

describe("blob literals", () => {
  test("x'48656C6C6F' is a BLOB", () => {
    expect(lex("x'48656C6C6F'")).toEqual([{ name: "BLOB", text: "x'48656C6C6F'" }])
  })
  test("X'AB' (uppercase X) is a BLOB", () => {
    expect(lex("X'AB'")).toEqual([{ name: "BLOB", text: "X'AB'" }])
  })
  test("odd hex digit count is ILLEGAL", () => {
    expect(lex("x'ABC'")[0].name).toBe("ILLEGAL")
  })
})

describe("keyword aliases", () => {
  test("GLOB / LIKE / REGEXP all collapse to LIKE_KW", () => {
    expect(lexNames("LIKE GLOB REGEXP")).toEqual(["LIKE_KW", "LIKE_KW", "LIKE_KW"])
  })
  test("CROSS/FULL/INNER/LEFT/NATURAL/OUTER/RIGHT collapse to JOIN_KW", () => {
    expect(lexNames("CROSS FULL INNER LEFT NATURAL OUTER RIGHT")).toEqual([
      "JOIN_KW",
      "JOIN_KW",
      "JOIN_KW",
      "JOIN_KW",
      "JOIN_KW",
      "JOIN_KW",
      "JOIN_KW",
    ])
  })
  test("CURRENT_DATE/_TIME/_TIMESTAMP collapse to CTIME_KW", () => {
    expect(lexNames("CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP")).toEqual([
      "CTIME_KW",
      "CTIME_KW",
      "CTIME_KW",
    ])
  })
})

describe("non-ASCII identifiers", () => {
  test("unicode chars are valid ID continuation", () => {
    const toks = lex("café SELECT")
    expect(toks[0]).toEqual({ name: "ID", text: "café" })
    expect(toks[1].name).toBe("SELECT")
  })
})

describe("flag filtering", () => {
  test("disables WINDOWFUNC keywords when flag dropped", () => {
    const flags = (Object.keys(keywordDefs.meta.maskFlags) as MaskFlag[]).filter(
      (f) => f !== "WINDOWFUNC",
    )
    const tkNoWindow = makeTokenizer({ flags })
    expect(lexNames("FILTER OVER PARTITION", undefined, tkNoWindow)).toEqual(["ID", "ID", "ID"])
  })
})
