// Public API for the AST layer.
//
// This module is version-agnostic — it deals in shapes, not a specific
// SQLite defs.  Today it is internal scaffolding; the published version
// wrappers do not expose AST conversion yet.

export type { AstNode, AstError, AstResult, BaseAstNode, UnknownAstNode } from "./types.ts"

export {
  stableKeyForRule,
  buildSymbolName,
  verifyHandlers,
  cstToAst,
  createAstBuilder,
} from "./dispatch.ts"

export type {
  AstContext,
  ConvertOptions,
  Handler,
  HandlerMap,
  StableKey,
  SymbolName,
  VerifyHandlersResult,
} from "./dispatch.ts"

export { handlers } from "./handlers.ts"
