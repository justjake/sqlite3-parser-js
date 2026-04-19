// Handlers for DDL / DML rules (CREATE, ALTER, DROP, INSERT, UPDATE,
// DELETE, ATTACH, DETACH, VACUUM, PRAGMA, REINDEX, ANALYZE).
//
// Scope (approximate, by lhsName in parse.y):
//   create_table, create_table_args, createkw, temp, ifnotexists,
//   table_option_set, table_option, columnlist, columnname, typetoken,
//   typename, signed, scanpt, scantok, ccons, tcons, conslist_opt,
//   tconscomma, defer_subclause, init_deferred_pred_opt,
//   conslist, tcons, onconf, orconf, resolvetype, refargs, refact,
//   refarg, defer_subclause_opt, autoinc, init_deferred_pred_opt,
//   alter_table_, drop_table_, drop_index_, drop_view_, drop_trigger_,
//   insert_cmd, upsert, returning, update_cmd, setlist, where_opt,
//   from_opt, delete_cmd, attach_*, detach_*, reindex_*,
//   vacuum_opt, pragma, pragma_value, etc.
//
// TODO — populate with real handlers.

import type { HandlerRegistry } from "./dispatch.ts"

export const ddlHandlers: HandlerRegistry = {}
