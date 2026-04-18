// Handlers for CREATE TRIGGER (and virtual-table / module DDL that
// lives near it in parse.y).
//
// Scope (approximate, by lhsName in parse.y):
//   trigger_decl, trigger_time, trigger_event, foreach_clause,
//   when_clause, trigger_cmd_list, trigger_cmd, tridxby,
//   raisetype, raise_type,
//   vtabarglist, vtabarg, vtabargtoken, lp, anylist.
//
// TODO — populate with real handlers.

import type { HandlerRegistry } from './dispatch.ts';

export const triggerHandlers: HandlerRegistry = {};
