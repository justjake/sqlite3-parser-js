claude code branches:

- original implementation session: ed4477e7-1ec4-4c03-970c-e2161ce713da

---

src/lempar.ts (372 LOC) — pure LALR(1) dispatch, 1:1 port of tool/lempar.c:

- 9 inline references to specific lempar.c:NNN lines (shift/reduce/accept branches, yy_find_shift_action,
  yy_find_reduce_action, yy_reduce, the Parse() loop, SHIFTREDUCE state rewrite)
- Generic over V — the engine stores one V per stack entry and never inspects it
- Zero mentions of tokens-as-source-text, CST, unit rules, multi-terminals, ILLEGAL, or anything
  SQL-specific. The only hit grep finds for CST/trivia/ILLEGAL/SEMI is a comment that says "if you want to
  inject a synthetic SEMI before EOF, do it in your caller."
- Exports: createEngine(dump) → { run(tokens, onReduce) }, plus the dump types (ParserDefs, ParserConstants,
  ParserTables, ParserRule, ParserRhsPos, ParserSymbol) and the small generic API (LalrInput<V>, LalrPopped<V>,
  LalrReduce<V>, LalrError<V>, LalrResult<V>)

src/parser.ts (389 LOC) — CST emitter, every divergence from C lives here:

- Imports from engine: createEngine, the dump/generic types
- CST types (TokenNode, RuleNode, CstNode, ParseError, ParseResult)
- CST DIVERGENCE #1 — unitWrapper map + synthesizeWrappers (explicitly labeled)
- CST DIVERGENCE #2 — rhsMatches for multi-terminal RHS positions (explicitly labeled)
- buildRuleNode — the engine's onReduce callback: the only function in the whole system that cares about CST
  shape
- Tokenizer wiring, virtual-SEMI/EOF injection at EOF, ILLEGAL-token handling, user-facing error messages
- formatCst, walkCst, tokenLeaves helpers

Maintenance implications going forward:

- If SQLite's tool/lempar.c changes (rare), the diff should target src/engine.ts. The line references at
  each faithful port point make it easy to spot where the C code moved.
- If the CST shape needs to change (add trivia preservation, alternate error-recovery, different node
  metadata), it's all in src/parser.ts — no LALR knowledge needed.
- A future validation-only driver (e.g. "is this valid SQL? yes/no, no tree") can call engine.run directly
  with a no-op reducer that returns null. ~20 lines of glue, no engine changes.
