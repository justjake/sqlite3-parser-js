// Handlers for expression-grammar rules.
//
// Scope (approximate, by lhsName in parse.y):
//   expr, term, exprlist, nexprlist, case_operand, case_exprlist,
//   case_else, between_op, in_op, likeop, collate, vinto, raisetype,
//   filter_over, over_clause, over_opt, window, windowdefn_list,
//   windowdefn, frame_opt, frame_bound, frame_bound_s, frame_bound_e,
//   frame_exclude_opt, frame_exclude.
//
// This is the heaviest handler file — expressions drive the bulk of the
// grammar.
//
// TODO — populate with real handlers.

import type { HandlerRegistry } from './dispatch.ts';

export const exprHandlers: HandlerRegistry = {};
