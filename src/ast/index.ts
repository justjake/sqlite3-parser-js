// Public API for the AST layer.
//
// This module is version-agnostic — it deals in shapes, not a specific
// SQLite dump.  The per-version module (`generated/<ver>/index.ts`)
// binds this API to a concrete dump and exposes a one-call
// `parseToAst(sql)` on top.

export type {
  AstNode,
  AstError,
  AstResult,
  BaseAstNode,
  UnknownAstNode,
} from './types.ts';

export {
  stableKeyForRule,
  buildSymbolName,
  bindRegistry,
  cstToAst,
  createAstBuilder,
} from './dispatch.ts';

export type {
  AstContext,
  BoundDispatcher,
  ConvertOptions,
  Handler,
  HandlerRegistry,
  StableKey,
  SymbolName,
} from './dispatch.ts';

export { registry } from './registry.ts';
