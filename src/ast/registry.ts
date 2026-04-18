// Aggregated handler registry.
//
// Per-category modules export a map keyed by stable grammar-shape
// strings (see ./dispatch.ts).  This file merges them into the single
// `registry` object `bindRegistry` consumes.
//
// Order matters only when two files define the same key; that's a bug
// and should be caught by a startup uniqueness check once wired up.

import type { HandlerRegistry } from './dispatch.ts';
import { stmtHandlers } from './stmt.ts';
import { exprHandlers } from './expr.ts';
import { selectHandlers } from './select.ts';
import { ddlHandlers } from './ddl.ts';
import { triggerHandlers } from './trigger.ts';

export const registry: HandlerRegistry = {
  ...stmtHandlers,
  ...exprHandlers,
  ...selectHandlers,
  ...ddlHandlers,
  ...triggerHandlers,
};
