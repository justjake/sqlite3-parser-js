import type { ParserTables } from "./index.ts"
import type { ParseState } from "../../src/ast/parseState.ts"
import type { LalrReduce, ParserConstants, ParserSymbolNames } from "../../src/lempar.ts"

export const constants: ParserConstants = undefined as any
export const tables: ParserTables = undefined as any
export const symbols: ParserSymbolNames = undefined as any
export const reduce: LalrReduce<ParseState, unknown> = undefined as any
export const createState = undefined as any
