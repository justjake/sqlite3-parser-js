// Handlers for SELECT-pipeline rules.
//
// Scope (approximate, by lhsName in parse.y):
//   select, selectnowith, oneselect, values, distinct, selcollist, sclp,
//   as, from, stl_prefix, seltablist, fullname, xfullname, joinop,
//   on_using, indexed_by, indexed_opt, using_opt, orderby_opt,
//   sortlist, nulls, groupby_opt, having_opt, limit_opt, with,
//   wqlist, wqitem, wqas, cte_selectlist, compound_op.
//
// TODO — populate with real handlers.

import type { HandlerRegistry } from "./dispatch.ts"

export const selectHandlers: HandlerRegistry = {}
