// Handlers for top-level statement rules.
//
// Scope (approximate, by lhsName in parse.y):
//   cmdlist, ecmd, cmdx, cmd (BEGIN/COMMIT/END/ROLLBACK/SAVEPOINT/RELEASE),
//   explain, transtype, trans_opt.
//
// TODO — populate with real handlers.  Each entry's key is the stable
// shape string from `stableKeyForRule(rule)` (see ./dispatch.ts).

import type { HandlerRegistry } from './dispatch.ts';

export const stmtHandlers: HandlerRegistry = {};
