// AST handlers keyed by stable grammar shape.
//
// Keep this flat until there is enough real handler code to justify
// splitting it by category.  The stable keys come from
// `stableKeyForRule()` in ./dispatch.ts, e.g.
// `"cmd::BEGIN transtype trans_opt"`.  Keys are typo-checked against
// the current version's generated `ActionStableKey` union.

import type { HandlerMap } from "./dispatch.ts"

export const handlers: HandlerMap = {}
