%include {
/*
** 2001-09-15
**
** The author disclaims copyright to this source code.  In place of
** a legal notice, here is a blessing:
**
**    May you do good and not evil.
**    May you find forgiveness for yourself and forgive others.
**    May you share freely, never taking more than you give.
**
*************************************************************************
** This is the TypeScript-targeted fork of SQLite's Lemon grammar.
**
** The rule shape follows upstream parse.y (3.53.0) and the Rust
** port at https://github.com/gwenn/lemon-rs; action bodies construct
** values from src/ast/nodes.ts instead of SQLite's internal IR.
**
** The actions assume a future Lemon-to-TypeScript code-generator; the
** curly-brace bodies are plain TypeScript (no C macros, no pParse
** plumbing).  Until such a generator exists, this file is the
** specification for how each reduction should materialize in our AST.
*/
}

// Setup for the parser stack
%stack_size        50                        // Initial stack size

// All token codes are small integers with #defines that begin with "TK_"
%token_prefix TK_

// The type of the data attached to each token is Token.  This is also
// the default type for non-terminals.
//
%token_type {Token}
%default_type {Token}

// An extra argument to the constructor for the parser, which is
// available to all actions.
%extra_context {state: ParseState}

// This code runs whenever there is a syntax error
//
%syntax_error {
  if( yymajor===0 /* TK_EOF */ ){
    state.errors.push(mkDiagnostic("incomplete input", yyminor.span));
  }else{
    state.errors.push(mkDiagnostic(`near "${yyminor.text}": syntax error`, yyminor.span));
  }
}

%stack_overflow {
  state.errors.push(mkDiagnostic("parser stack overflow", { offset: 0, length: 0, line: 0, col: 0 }));
}

// The name of the generated procedure that implements the parser is as follows:
%name sqlite3Parser

// TypeScript imports, shared helper types, and constructor helpers
// used by the action bodies below.
//
%include {
import type {
  AlterTableBody, As, ColFlags, ColumnConstraint, ColumnDefinition,
  CommonTableExpr, CompoundOperator, CompoundSelect, CreateTableBody,
  DeferSubclause, DistinctNames, Distinctness, Expr,
  FrameBound, FrameClause, FrameExclude, FrameMode, FromClause,
  FunctionCallOrder, FunctionTail, Id, Indexed, IndexedColumn,
  InitDeferredPred, InsertBody, JoinConstraint, JoinOperator, JoinType,
  LikeOperator, Limit, Literal, Materialized, Name, NamedColumnConstraint,
  NamedTableConstraint, NullsOrder, OneSelect, Operator, Over, PragmaBody,
  QualifiedName, RefAct, RefArg, ResolveType, ResultColumn, Select,
  SelectTable, SetAssignment, SortOrder, SortedColumn, Stmt,
  TabFlags, TableConstraint, TransactionType, TriggerCmd, TriggerEvent,
  TriggerTime, Type, TypeSize, UnaryOperator, Upsert, UpsertDo, UpsertIndex,
  ValuesRow, WhenThen, Window, WindowDef, With,
} from "../../../src/ast/nodes.ts";
import type { Span, Token } from "../../../src/tokenize.ts";
import type { ParseState } from "../../../src/ast/parseState.ts";
import type { FromClauseMut, SelectBody } from "../../../src/ast/parseActions.ts";
import {
  mkName, mkId, mkVariableExpr,
  literalFromCtimeKw, mkNullLiteral, mkStringLiteral, mkBlobLiteral,
  mkNumericLiteral, mkKeywordLiteral,
  likeOperatorFromToken, binaryOperatorFromToken, unaryOperatorFromToken, ptrOperatorFromToken,
  mkParenthesized, mkCollate, mkCast, mkBinary, mkUnary, mkBetween,
  mkInList, mkInSelect, mkInTable, mkSubquery, mkExistsExpr,
  mkNotNullExpr, mkLikeExpr,
  mkFunctionCall, mkFunctionCallStar,
  qnSingle, qnFull, qnAlias, qnXfull,
  joinOperatorFrom, fromClausePush, emptyFromClause, freezeFrom,
  mkSelect, pushCompound, mkOneSelect, valuesPush,
  mkColumnDefinition, addColumn, mkColumnsAndConstraints,
  addCte, mkUpsertIndex, flushCmd,
  spanFromPopped,
  mkDiagnostic, mkDuplicateDiagnostic,
} from "../../../src/ast/parseActions.ts";
import { sqlite3Dequote, sqlite3DequoteNumber } from "../../../src/util.ts";

// `tokens` is a TK_* name → numeric code map injected by
// scripts/emit-ts-parser.ts.  The declaration keeps action bodies
// typecheckable in isolation; the emitter strips it and replaces it
// with the real binding.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const tokens: Record<string, number>;
} // end %include

// Input is a single SQL command
input     ::= cmdlist.
cmdlist   ::= cmdlist ecmd.
cmdlist   ::= ecmd.
ecmd      ::= SEMI.
ecmd      ::= cmdx SEMI.               { flushCmd(state); }
%ifndef SQLITE_OMIT_EXPLAIN
ecmd      ::= explain cmdx SEMI.       { flushCmd(state); }
explain   ::= EXPLAIN.              { state.explain = "Explain"; }
explain   ::= EXPLAIN QUERY PLAN.   { state.explain = "QueryPlan"; }
%endif  SQLITE_OMIT_EXPLAIN
cmdx      ::= cmd.           { /* statement is complete; state.stmt has been assigned */ }

///////////////////// Begin and end transactions. ////////////////////////////
//
cmd ::= BEGIN transtype(Y) trans_opt(X). { state.stmt = { type: "BeginStmt",    tx: Y, name: X, span: nodeSpan() }; }
%type trans_opt {Name | undefined}
trans_opt(A) ::= .                  { A = undefined; }
trans_opt(A) ::= TRANSACTION.       { A = undefined; }
trans_opt(A) ::= TRANSACTION nm(X). { A = X; }
%type transtype {TransactionType | undefined}
transtype(A) ::= .              { A = undefined; }
transtype(A) ::= DEFERRED.      { A = "Deferred"; }
transtype(A) ::= IMMEDIATE.     { A = "Immediate"; }
transtype(A) ::= EXCLUSIVE.     { A = "Exclusive"; }
cmd ::= COMMIT|END trans_opt(X).           { state.stmt = { type: "CommitStmt",   name: X, span: nodeSpan() }; }
cmd ::= ROLLBACK trans_opt(X).             { state.stmt = { type: "RollbackStmt", txName: X, savepointName: undefined, span: nodeSpan() }; }

savepoint_opt ::= SAVEPOINT.
savepoint_opt ::= .
cmd ::= SAVEPOINT nm(X).                            { state.stmt = { type: "SavepointStmt", name: X, span: nodeSpan() }; }
cmd ::= RELEASE savepoint_opt nm(X).                { state.stmt = { type: "ReleaseStmt",   name: X, span: nodeSpan() }; }
cmd ::= ROLLBACK trans_opt(Y) TO savepoint_opt nm(X). {
  state.stmt = { type: "RollbackStmt", txName: Y, savepointName: X, span: nodeSpan() };
}

///////////////////// The CREATE TABLE statement ////////////////////////////
//
cmd ::= createkw temp(T) TABLE ifnotexists(E) fullname(Y) create_table_args(X). {
  state.stmt = { type: "CreateTableStmt", temporary: T, ifNotExists: E, tblName: Y, body: X, span: nodeSpan() };
}
createkw(A) ::= CREATE(A).

%type ifnotexists {boolean}
ifnotexists(A) ::= .                { A = false; }
ifnotexists(A) ::= IF NOT EXISTS.   { A = true;  }
%type temp {boolean}
%ifndef SQLITE_OMIT_TEMPDB
temp(A) ::= TEMP.  { A = true;  }
%endif  SQLITE_OMIT_TEMPDB
temp(A) ::= .      { A = false; }

%type create_table_args {CreateTableBody}
create_table_args(A) ::= LP columnlist(C) conslist_opt(X) RP table_option_set(F). {
  A = mkColumnsAndConstraints(C, X, F, nodeSpan());
}
create_table_args(A) ::= AS select(S). {
  A = { type: "AsSelectCreateTableBody", select: S, span: nodeSpan() };
}
%type table_option_set {TabFlags}
%type table_option     {TabFlags}
table_option_set(A) ::= .                                        { A = 0; }
table_option_set(A) ::= table_option(A).
table_option_set(A) ::= table_option_set(X) COMMA table_option(Y). { A = X | Y; }
table_option(A) ::= WITHOUT nm(X). {
  if( X.name.toLowerCase()==="rowid" ){
    A = 0x00000080 /* TabFlags.WithoutRowid */;
  }else{
    state.errors.push(mkDiagnostic(
      `unknown table option: ${X.name}`,
      X.span,
      { message: "expected WITHOUT ROWID", span: undefined },
    ));
    A = 0;
  }
}
table_option(A) ::= nm(X). {
  if( X.name.toLowerCase()==="strict" ){
    A = 0x00010000 /* TabFlags.Strict */;
  }else{
    state.errors.push(mkDiagnostic(
      `unknown table option: ${X.name}`,
      X.span,
      { message: "expected STRICT or WITHOUT ROWID", span: undefined },
    ));
    A = 0;
  }
}
%type columnlist {ColumnDefinition[]}
columnlist(A) ::= columnlist(A) COMMA columnname(X) carglist(Y). {
  const cd = mkColumnDefinition(X.colName, X.colType, Y, nodeSpan());
  addColumn(state, A, cd);
}
columnlist(A) ::= columnname(X) carglist(Y). {
  const cd = mkColumnDefinition(X.colName, X.colType, Y, nodeSpan());
  A = [];
  addColumn(state, A, cd);
}
%type columnname {{colName: Name, colType: Type | undefined, span: Span}}
columnname(A) ::= nm(X) typetoken(Y). { A = { colName: X, colType: Y, span: nodeSpan() }; }

// Declare some tokens early in order to influence their values, to
// improve performance and reduce the executable size.  The goal here is
// to get the "jump" operations in ISNULL through ESCAPE to have numeric
// values that are early enough so that all jump operations are clustered
// at the beginning.  Also, operators like NE and EQ need to be adjacent,
// and all of the comparison operators need to be clustered together.
//
%token ABORT ACTION AFTER ANALYZE ASC ATTACH BEFORE BEGIN BY CASCADE CAST.
%token CONFLICT DATABASE DEFERRED DESC DETACH EACH END EXCLUSIVE EXPLAIN FAIL.
%token OR AND NOT IS MATCH LIKE_KW BETWEEN IN ISNULL NOTNULL NE EQ.
%token GT LE LT GE ESCAPE.

// The following directive causes tokens ABORT, AFTER, ASC, etc. to
// fallback to ID if they will not parse as their original value.
// This obviates the need for the "id" nonterminal.
//
%fallback ID
  ABORT ACTION AFTER ANALYZE ASC ATTACH BEFORE BEGIN BY CASCADE CAST COLUMNKW
  CONFLICT DATABASE DEFERRED DESC DETACH DO
  EACH END EXCLUSIVE EXPLAIN FAIL FOR
  IGNORE IMMEDIATE INITIALLY INSTEAD LIKE_KW MATCH NO PLAN
  QUERY KEY OF OFFSET PRAGMA RAISE RECURSIVE RELEASE REPLACE RESTRICT ROW ROWS
  ROLLBACK SAVEPOINT TEMP TRIGGER VACUUM VIEW VIRTUAL WITH WITHOUT
  NULLS FIRST LAST
%ifdef SQLITE_OMIT_COMPOUND_SELECT
  EXCEPT INTERSECT UNION
%endif SQLITE_OMIT_COMPOUND_SELECT
%ifndef SQLITE_OMIT_WINDOWFUNC
  CURRENT FOLLOWING PARTITION PRECEDING RANGE UNBOUNDED
  EXCLUDE GROUPS OTHERS TIES
%endif SQLITE_OMIT_WINDOWFUNC
%ifdef SQLITE_ENABLE_ORDERED_SET_AGGREGATES
  WITHIN
%endif SQLITE_ENABLE_ORDERED_SET_AGGREGATES
%ifndef SQLITE_OMIT_GENERATED_COLUMNS
  GENERATED ALWAYS
%endif
  MATERIALIZED
  REINDEX RENAME CTIME_KW IF
  .
%wildcard ANY.

// Define operator precedence early so that this is the first occurrence
// of the operator tokens in the grammar.  Keeping the operators together
// causes them to be assigned integer values that are close together,
// which keeps parser tables smaller.
//
%left OR.
%left AND.
%right NOT.
%left IS MATCH LIKE_KW BETWEEN IN ISNULL NOTNULL NE EQ.
%left GT LE LT GE.
%right ESCAPE.
%left BITAND BITOR LSHIFT RSHIFT.
%left PLUS MINUS.
%left STAR SLASH REM.
%left CONCAT PTR.
%left COLLATE.
%right BITNOT.
%nonassoc ON.

// An IDENTIFIER can be a generic identifier, or one of several keywords.
//
%token_class id  ID|INDEXED.
%token_class ids ID|STRING.
%token_class idj ID|INDEXED|JOIN_KW.

// The name of a column or table can be any of the following:
//
%type nm {Name}
nm(A) ::= idj(X).    { A = mkName(X); }
nm(A) ::= STRING(X). { A = mkName(X); }

// A typetoken is really zero or more tokens that form a type name such
// as can be found after the column name in a CREATE TABLE statement.
// Multiple tokens are concatenated to form the value of the typetoken.
//
%type typetoken {Type | undefined}
typetoken(A) ::= .                                              { A = undefined; }
typetoken(A) ::= typename(X).                                   { A = { type: "Type", name: X, size: undefined, span: nodeSpan() }; }
typetoken(A) ::= typename(X) LP signed(Y) RP. {
  A = { type: "Type", name: X, size: { type: "MaxSizeTypeSize", size: Y, span: nodeSpan() }, span: nodeSpan() };
}
typetoken(A) ::= typename(X) LP signed(Y) COMMA signed(Z) RP. {
  A = { type: "Type", name: X, size: { type: "TypeSizeTypeSize", size1: Y, size2: Z, span: nodeSpan() }, span: nodeSpan() };
}
%type typename {string}
typename(A) ::= ids(X).               { A = sqlite3Dequote(X.text); }
typename(A) ::= typename(A) ids(Y).   { A = A + " " + sqlite3Dequote(Y.text); }
%type signed {Expr}
signed(A) ::= plus_num(A).
signed(A) ::= minus_num(A).

// "carglist" is a list of additional constraints that come after the
// column name and column type in a CREATE TABLE statement.
//
%type carglist {NamedColumnConstraint[]}
carglist(A) ::= carglist(A) ccons(X). { if( X ) A.push(X); }
carglist(A) ::= .                     { A = []; }
%type ccons {NamedColumnConstraint | undefined}
ccons(A) ::= CONSTRAINT nm(X). {
  // Stage the constraint name; the NEXT ccons consumes it.  This
  // production does not itself contribute to carglist.
  state.constraintName = X;
  A = undefined;
}
ccons(A) ::= DEFAULT term(X). {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: { type: "DefaultColumnConstraint", expr: X, span: nodeSpan() }, span: nodeSpan() };
  state.constraintName = undefined;
}
ccons(A) ::= DEFAULT LP expr(X) RP. {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: { type: "DefaultColumnConstraint", expr: mkParenthesized(X, nodeSpan()), span: nodeSpan() }, span: nodeSpan() };
  state.constraintName = undefined;
}
ccons(A) ::= DEFAULT PLUS term(X). {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: { type: "DefaultColumnConstraint", expr: mkUnary("Positive", X, nodeSpan()), span: nodeSpan() }, span: nodeSpan() };
  state.constraintName = undefined;
}
ccons(A) ::= DEFAULT MINUS term(X). {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: { type: "DefaultColumnConstraint", expr: mkUnary("Negative", X, nodeSpan()), span: nodeSpan() }, span: nodeSpan() };
  state.constraintName = undefined;
}
ccons(A) ::= DEFAULT id(X). {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: { type: "DefaultColumnConstraint", expr: mkId(X), span: nodeSpan() }, span: nodeSpan() };
  state.constraintName = undefined;
}

// In addition to the type name, we also care about the primary key and
// UNIQUE constraints.
//
ccons(A) ::= NULL onconf(R). {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: { type: "NotNullColumnConstraint", nullable: true,  conflictClause: R, span: nodeSpan() }, span: nodeSpan() };
  state.constraintName = undefined;
}
ccons(A) ::= NOT NULL onconf(R). {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: { type: "NotNullColumnConstraint", nullable: false, conflictClause: R, span: nodeSpan() }, span: nodeSpan() };
  state.constraintName = undefined;
}
ccons(A) ::= PRIMARY KEY sortorder(Z) onconf(R) autoinc(I). {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: { type: "PrimaryKeyColumnConstraint", order: Z, conflictClause: R, autoIncrement: I, span: nodeSpan() }, span: nodeSpan()
  };
  state.constraintName = undefined;
}
ccons(A) ::= UNIQUE onconf(R). {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: { type: "UniqueColumnConstraint", conflictClause: R, span: nodeSpan() }, span: nodeSpan() };
  state.constraintName = undefined;
}
ccons(A) ::= CHECK LP expr(X) RP. {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: { type: "CheckColumnConstraint", expr: X, span: nodeSpan() }, span: nodeSpan() };
  state.constraintName = undefined;
}
ccons(A) ::= REFERENCES nm(T) eidlist_opt(TA) refargs(R). {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: { type: "ForeignKeyColumnConstraint",
      clause: { type: "ForeignKeyClause", tblName: T, columns: TA, args: R, span: nodeSpan() },
      deferClause: undefined, span: nodeSpan()
    }, span: nodeSpan()
  };
  state.constraintName = undefined;
}
ccons(A) ::= defer_subclause(D). {
  A = { type: "NamedColumnConstraint", name: undefined, constraint: { type: "DeferColumnConstraint", clause: D, span: nodeSpan() }, span: nodeSpan() };
}
ccons(A) ::= COLLATE ids(C). {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: { type: "CollateColumnConstraint", collationName: mkName(C), span: nodeSpan() }, span: nodeSpan() };
  state.constraintName = undefined;
}
ccons(A) ::= GENERATED ALWAYS AS generated(X). {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: X, span: nodeSpan() };
  state.constraintName = undefined;
}
ccons(A) ::= AS generated(X). {
  A = { type: "NamedColumnConstraint", name: state.constraintName, constraint: X, span: nodeSpan() };
  state.constraintName = undefined;
}
%type generated {ColumnConstraint}
generated(X) ::= LP expr(E) RP.           { X = { type: "GeneratedColumnConstraint", expr: E, typ: undefined, span: nodeSpan() }; }
generated(X) ::= LP expr(E) RP ID(TYPE).  { X = { type: "GeneratedColumnConstraint", expr: E, typ: mkId(TYPE), span: nodeSpan() }; }

// The optional AUTOINCREMENT keyword
%type autoinc {boolean}
autoinc(X) ::= .          { X = false; }
autoinc(X) ::= AUTOINCR.  { X = true;  }

// The next group of rules parses the arguments to a REFERENCES clause
// that determine if the referential integrity checking is deferred or
// or immediate and which determine what action to take if a ref-integ
// check fails.
//
%type refargs {RefArg[]}
refargs(A) ::= .                       { A = []; }
refargs(A) ::= refargs(A) refarg(Y).   { A.push(Y); }
%type refarg {RefArg}
refarg(A) ::= MATCH nm(X).              { A = { type: "MatchRefArg",    name: X, span: nodeSpan() };   }
refarg(A) ::= ON INSERT refact(X).      { A = { type: "OnInsertRefArg", action: X, span: nodeSpan() }; }
refarg(A) ::= ON DELETE refact(X).      { A = { type: "OnDeleteRefArg", action: X, span: nodeSpan() }; }
refarg(A) ::= ON UPDATE refact(X).      { A = { type: "OnUpdateRefArg", action: X, span: nodeSpan() }; }
%type refact {RefAct}
refact(A) ::= SET NULL.                 { A = "SetNull"; }
refact(A) ::= SET DEFAULT.              { A = "SetDefault"; }
refact(A) ::= CASCADE.                  { A = "Cascade"; }
refact(A) ::= RESTRICT.                 { A = "Restrict"; }
refact(A) ::= NO ACTION.                { A = "NoAction"; }
%type defer_subclause {DeferSubclause}
defer_subclause(A) ::= NOT DEFERRABLE init_deferred_pred_opt(X). {
  A = { type: "DeferSubclause", deferrable: false, initDeferred: X, span: nodeSpan() };
}
defer_subclause(A) ::= DEFERRABLE init_deferred_pred_opt(X). {
  A = { type: "DeferSubclause", deferrable: true,  initDeferred: X, span: nodeSpan() };
}
%type init_deferred_pred_opt {InitDeferredPred | undefined}
init_deferred_pred_opt(A) ::= .                      { A = undefined; }
init_deferred_pred_opt(A) ::= INITIALLY DEFERRED.    { A = "InitiallyDeferred"; }
init_deferred_pred_opt(A) ::= INITIALLY IMMEDIATE.   { A = "InitiallyImmediate"; }

%type conslist_opt {NamedTableConstraint[] | undefined}
conslist_opt(A) ::= .                          { A = undefined;     }
conslist_opt(A) ::= COMMA conslist(X).         { A = X;        }
%type conslist {NamedTableConstraint[]}
conslist(A) ::= conslist(A) tconscomma tcons(X). { if( X ) A.push(X); }
conslist(A) ::= tcons(X).                        { A = X ? [X] : []; }
tconscomma ::= COMMA.   { state.constraintName = undefined; }
tconscomma ::= .
%type tcons {NamedTableConstraint | undefined}
tcons(A) ::= CONSTRAINT nm(X). {
  // Stage the constraint name for the NEXT tcons; this production does
  // not itself contribute to conslist.
  state.constraintName = X;
  A = undefined;
}
tcons(A) ::= PRIMARY KEY LP sortlist(X) autoinc(I) RP onconf(R). {
  A = { type: "NamedTableConstraint", name: state.constraintName, constraint: { type: "PrimaryKeyTableConstraint", columns: X, autoIncrement: I, conflictClause: R, span: nodeSpan() }, span: nodeSpan() };
  state.constraintName = undefined;
}
tcons(A) ::= UNIQUE LP sortlist(X) RP onconf(R). {
  A = { type: "NamedTableConstraint", name: state.constraintName, constraint: { type: "UniqueTableConstraint", columns: X, conflictClause: R, span: nodeSpan() }, span: nodeSpan() };
  state.constraintName = undefined;
}
tcons(A) ::= CHECK LP expr(E) RP onconf(R). {
  A = { type: "NamedTableConstraint", name: state.constraintName, constraint: { type: "CheckTableConstraint", expr: E, conflictClause: R, span: nodeSpan() }, span: nodeSpan() };
  state.constraintName = undefined;
}
tcons(A) ::= FOREIGN KEY LP eidlist(FA) RP
          REFERENCES nm(T) eidlist_opt(TA) refargs(R) defer_subclause_opt(D). {
  A = { type: "NamedTableConstraint", name: state.constraintName, constraint: { type: "ForeignKeyTableConstraint",
      columns: FA,
      clause: { type: "ForeignKeyClause", tblName: T, columns: TA, args: R, span: nodeSpan() },
      deferClause: D, span: nodeSpan()
    }, span: nodeSpan()
  };
  state.constraintName = undefined;
}
%type defer_subclause_opt {DeferSubclause | undefined}
defer_subclause_opt(A) ::= .                    { A = undefined; }
defer_subclause_opt(A) ::= defer_subclause(X).  { A = X;    }

// The following is a non-standard extension that allows us to declare the
// default behavior when there is a constraint conflict.
//
%type onconf     {ResolveType | undefined}
%type orconf     {ResolveType | undefined}
%type resolvetype {ResolveType}
onconf(A) ::= .                              { A = undefined; }
onconf(A) ::= ON CONFLICT resolvetype(X).    { A = X;    }
orconf(A) ::= .                              { A = undefined; }
orconf(A) ::= OR resolvetype(X).             { A = X;    }
resolvetype(A) ::= raisetype(A).
resolvetype(A) ::= IGNORE.                   { A = "Ignore"; }
resolvetype(A) ::= REPLACE.                  { A = "Replace"; }

////////////////////////// The DROP TABLE /////////////////////////////////////
//
cmd ::= DROP TABLE ifexists(E) fullname(X). {
  state.stmt = { type: "DropTableStmt", ifExists: E, tblName: X, span: nodeSpan() };
}
%type ifexists {boolean}
ifexists(A) ::= IF EXISTS.   { A = true;  }
ifexists(A) ::= .            { A = false; }

///////////////////// The CREATE VIEW statement /////////////////////////////
//
%ifndef SQLITE_OMIT_VIEW
cmd ::= createkw temp(T) VIEW ifnotexists(E) fullname(Y) eidlist_opt(C) AS select(S). {
  state.stmt = { type: "CreateViewStmt", temporary: T, ifNotExists: E, viewName: Y, columns: C, select: S, span: nodeSpan() };
}
cmd ::= DROP VIEW ifexists(E) fullname(X). {
  state.stmt = { type: "DropViewStmt", ifExists: E, viewName: X, span: nodeSpan() };
}
%endif  SQLITE_OMIT_VIEW

//////////////////////// The SELECT statement /////////////////////////////////
//
cmd ::= select(X).  { state.stmt = { type: "SelectStmt", body: X, span: nodeSpan() }; }

%type select       {Select}
%type selectnowith {SelectBody}
%type oneselect    {OneSelect}

%ifndef SQLITE_OMIT_CTE
select(A) ::= WITH wqlist(W) selectnowith(X) orderby_opt(Z) limit_opt(L). {
  A = mkSelect({ type: "With", recursive: false, ctes: W, span: nodeSpan() }, X, Z, L, nodeSpan());
}
select(A) ::= WITH RECURSIVE wqlist(W) selectnowith(X) orderby_opt(Z) limit_opt(L). {
  A = mkSelect({ type: "With", recursive: true,  ctes: W, span: nodeSpan() }, X, Z, L, nodeSpan());
}
%endif /* SQLITE_OMIT_CTE */
select(A) ::= selectnowith(X) orderby_opt(Z) limit_opt(L). {
  A = mkSelect(undefined, X, Z, L, nodeSpan());
}

selectnowith(A) ::= oneselect(X). { A = { select: X, compounds: undefined }; }
%ifndef SQLITE_OMIT_COMPOUND_SELECT
selectnowith(A) ::= selectnowith(A) multiselect_op(Y) oneselect(Z). {
  pushCompound(A, { type: "CompoundSelect", operator: Y, select: Z, span: nodeSpan() });
}
%type multiselect_op {CompoundOperator}
multiselect_op(A) ::= UNION.             { A = "Union"; }
multiselect_op(A) ::= UNION ALL.         { A = "UnionAll"; }
multiselect_op(A) ::= EXCEPT.            { A = "Except"; }
multiselect_op(A) ::= INTERSECT.         { A = "Intersect"; }
%endif SQLITE_OMIT_COMPOUND_SELECT

oneselect(A) ::= SELECT distinct(D) selcollist(W) from(X) where_opt(Y)
                 groupby_opt(P) having_opt(Q). {
  A = mkOneSelect(state, D, W, X, Y, P, Q, undefined, nodeSpan());
}
%ifndef SQLITE_OMIT_WINDOWFUNC
oneselect(A) ::= SELECT distinct(D) selcollist(W) from(X) where_opt(Y)
                 groupby_opt(P) having_opt(Q) window_clause(R). {
  A = mkOneSelect(state, D, W, X, Y, P, Q, R, nodeSpan());
}
%endif

// Single row VALUES clause.
//
%type values {ValuesRow[]}
oneselect(A) ::= values(X).             { A = { type: "SelectValues", values: X, span: nodeSpan() }; }
values(A) ::= VALUES LP nexprlist(X) RP. {
  A = [{ type: "ValuesRow", values: X, span: nodeSpan() }];
}

// Multiple row VALUES clause.
//
%type mvalues {ValuesRow[]}
oneselect(A) ::= mvalues(X).                    { A = { type: "SelectValues", values: X, span: nodeSpan() }; }
mvalues(A) ::= values(A) COMMA LP nexprlist(Y) RP.  { valuesPush(state, A, Y, nodeSpan());}
mvalues(A) ::= mvalues(A) COMMA LP nexprlist(Y) RP. { valuesPush(state, A, Y, nodeSpan());}

// The "distinct" nonterminal is Distinct/All/none.
//
%type distinct {Distinctness | undefined}
distinct(A) ::= DISTINCT.   { A = "Distinct"; }
distinct(A) ::= ALL.        { A = "All"; }
distinct(A) ::= .           { A = undefined;                 }

// selcollist is a list of expressions that are to become the return
// values of the SELECT statement.  The "*" in statements like
// "SELECT * FROM ..." is encoded as a special expression with an
// opcode of TK_ASTERISK.
//
%type selcollist {ResultColumn[]}
%type sclp       {ResultColumn[]}
sclp(A) ::= selcollist(A) COMMA.
sclp(A) ::= .                                   { A = []; }
selcollist(A) ::= sclp(A) expr(X) as(Y).        { A.push({ type: "ExprResultColumn", expr: X, alias: Y, span: nodeSpan() }); }
selcollist(A) ::= sclp(A) STAR.                 { A.push({ type: "StarResultColumn", span: nodeSpan() }); }
selcollist(A) ::= sclp(A) nm(X) DOT STAR.       { A.push({ type: "TableStarResultColumn", table: X, span: nodeSpan() }); }

// An option "AS <id>" phrase that can follow one of the expressions that
// define the result set, or one of the tables in the FROM clause.
//
%type as {As | undefined}
as(X) ::= AS nm(Y).    { X = { type: "AsAs",     name: Y, span: nodeSpan() }; }
as(X) ::= ids(Y).      { X = { type: "ElidedAs", name: mkName(Y), span: nodeSpan() }; }
as(X) ::= .            { X = undefined; }

%type seltablist {FromClauseMut}
%type stl_prefix {FromClauseMut}
%type from       {FromClause | undefined}

// A complete FROM clause.
//
from(A) ::= .                      { A = undefined; }
from(A) ::= FROM seltablist(X).    { A = freezeFrom(X, nodeSpan()); }

// "seltablist" is a "Select Table List" - the content of the FROM clause
// in a SELECT statement.  "stl_prefix" is a prefix of this list.
//
stl_prefix(A) ::= seltablist(A) joinop(Y).    { A.pendingOp = Y; }
stl_prefix(A) ::= .                           { A = emptyFromClause(); }
seltablist(A) ::= stl_prefix(A) fullname(Y) as(Z) indexed_opt(I) on_using(N). {
  fromClausePush(state, A, { type: "TableSelectTable", name: Y, alias: Z, indexed: I, span: nodeSpan() }, N);
}
seltablist(A) ::= stl_prefix(A) fullname(Y) LP exprlist(E) RP as(Z) on_using(N). {
  fromClausePush(state, A, { type: "TableCallSelectTable", name: Y, args: E, alias: Z, span: nodeSpan() }, N);
}
%ifndef SQLITE_OMIT_SUBQUERY
seltablist(A) ::= stl_prefix(A) LP select(S) RP as(Z) on_using(N). {
  fromClausePush(state, A, { type: "SelectSelectTable", select: S, alias: Z, span: nodeSpan() }, N);
}
seltablist(A) ::= stl_prefix(A) LP seltablist(F) RP as(Z) on_using(N). {
  fromClausePush(state, A, { type: "SubSelectTable", from: freezeFrom(F, nodeSpan()), alias: Z, span: nodeSpan() }, N);
}
%endif  SQLITE_OMIT_SUBQUERY

%type fullname {QualifiedName}
fullname(A) ::= nm(X).               { A = qnSingle(X, nodeSpan()); }
fullname(A) ::= nm(X) DOT nm(Y).     { A = qnFull(X, Y, nodeSpan()); }

%type xfullname {QualifiedName}
xfullname(A) ::= nm(X).                       { A = qnSingle(X, nodeSpan()); }
xfullname(A) ::= nm(X) DOT nm(Y).             { A = qnFull(X, Y, nodeSpan()); }
xfullname(A) ::= nm(X) AS nm(Z).              { A = qnAlias(X, Z, nodeSpan()); }
xfullname(A) ::= nm(X) DOT nm(Y) AS nm(Z).    { A = qnXfull(X, Y, Z, nodeSpan()); }

%type joinop {JoinOperator}
joinop(X) ::= COMMA.                                { X = { type: "CommaJoinOperator", span: nodeSpan()                  }; }
joinop(X) ::= JOIN.                                 { X = { type: "TypedJoinJoinOperator", joinType: undefined, span: nodeSpan() }; }
joinop(X) ::= JOIN_KW(A) JOIN.                      { X = joinOperatorFrom(state, A, undefined, undefined, nodeSpan()); }
joinop(X) ::= JOIN_KW(A) nm(B) JOIN.                { X = joinOperatorFrom(state, A, B, undefined, nodeSpan()); }
joinop(X) ::= JOIN_KW(A) nm(B) nm(C) JOIN.          { X = joinOperatorFrom(state, A, B, C, nodeSpan()); }

// There is a parsing ambiguity in an upsert statement that uses a
// SELECT on the RHS of a the INSERT: the ON token may introduce either
// an ON CONFLICT clause or an ON JOIN clause.  The [AND] and [OR]
// precedence marks here cause ON in this context to always belong to
// the JOIN.
//
%type on_using {JoinConstraint | undefined}
on_using(N) ::= ON expr(E).            { N = { type: "OnJoinConstraint",    expr: E, span: nodeSpan() };    }
on_using(N) ::= USING LP idlist(L) RP. { N = { type: "UsingJoinConstraint", columns: L, span: nodeSpan() }; }
on_using(N) ::= .                 [OR] { N = undefined; }

// INDEXED BY / NOT INDEXED.
//
%type indexed_opt {Indexed | undefined}
indexed_opt(A) ::= .                  { A = undefined; }
indexed_opt(A) ::= INDEXED BY nm(X).  { A = { type: "IndexedByIndexed", name: X, span: nodeSpan() }; }
indexed_opt(A) ::= NOT INDEXED.       { A = { type: "NotIndexedIndexed", span: nodeSpan() }; }

%type orderby_opt {SortedColumn[] | undefined}
%type sortlist    {SortedColumn[]}

orderby_opt(A) ::= .                          { A = undefined; }
orderby_opt(A) ::= ORDER BY sortlist(X).      { A = X; }
sortlist(A) ::= sortlist(A) COMMA expr(Y) sortorder(Z) nulls(X). {
  A.push({ type: "SortedColumn", expr: Y, order: Z, nulls: X, span: nodeSpan() });
}
sortlist(A) ::= expr(Y) sortorder(Z) nulls(X). {
  A = [{ type: "SortedColumn", expr: Y, order: Z, nulls: X, span: nodeSpan() }];
}

%type sortorder {SortOrder | undefined}
sortorder(A) ::= ASC.           { A = "Asc"; }
sortorder(A) ::= DESC.          { A = "Desc"; }
sortorder(A) ::= .              { A = undefined;             }

%type nulls {NullsOrder | undefined}
nulls(A) ::= NULLS FIRST.       { A = "First"; }
nulls(A) ::= NULLS LAST.        { A = "Last"; }
nulls(A) ::= .                  { A = undefined;              }

%type groupby_opt {Expr[] | undefined}
groupby_opt(A) ::= .                      { A = undefined; }
groupby_opt(A) ::= GROUP BY nexprlist(X). { A = X;    }

%type having_opt {Expr | undefined}
having_opt(A) ::= .                { A = undefined; }
having_opt(A) ::= HAVING expr(X).  { A = X;    }

%type limit_opt {Limit | undefined}
limit_opt(A) ::= .                             { A = undefined; }
limit_opt(A) ::= LIMIT expr(X).                { A = { type: "Limit", expr: X, offset: undefined, span: nodeSpan() }; }
limit_opt(A) ::= LIMIT expr(X) OFFSET expr(Y). { A = { type: "Limit", expr: X, offset: Y, span: nodeSpan()    }; }
limit_opt(A) ::= LIMIT expr(X) COMMA expr(Y).  { A = { type: "Limit", expr: Y, offset: X, span: nodeSpan()    }; }

/////////////////////////// The DELETE statement /////////////////////////////
//
%if SQLITE_ENABLE_UPDATE_DELETE_LIMIT || SQLITE_UDL_CAPABLE_PARSER
cmd ::= with(C) DELETE FROM xfullname(X) indexed_opt(I) where_opt_ret(W)
        orderby_opt(O) limit_opt(L). {
  state.stmt = {
    type: "DeleteStmt",
    with: C, tblName: X, indexed: I,
    whereClause: W.where, returning: W.returning,
    orderBy: O, limit: L, span: nodeSpan()
  };
}
%else
cmd ::= with(C) DELETE FROM xfullname(X) indexed_opt(I) where_opt_ret(W). {
  state.stmt = {
    type: "DeleteStmt",
    with: C, tblName: X, indexed: I,
    whereClause: W.where, returning: W.returning,
    orderBy: undefined, limit: undefined, span: nodeSpan()
  };
}
%endif

%type where_opt     {Expr | undefined}
%type where_opt_ret {{where: Expr | undefined, returning: ResultColumn[] | undefined, span: Span}}

where_opt(A) ::= .                                       { A = undefined; }
where_opt(A) ::= WHERE expr(X).                          { A = X;    }
where_opt_ret(A) ::= .                                   { A = { where: undefined, returning: undefined, span: nodeSpan() }; }
where_opt_ret(A) ::= WHERE expr(X).                      { A = { where: X,    returning: undefined, span: nodeSpan() }; }
where_opt_ret(A) ::= RETURNING selcollist(X).            { A = { where: undefined, returning: X, span: nodeSpan()    }; }
where_opt_ret(A) ::= WHERE expr(X) RETURNING selcollist(Y).
                                                         { A = { where: X,    returning: Y, span: nodeSpan()    }; }

////////////////////////// The UPDATE command ////////////////////////////////
//
%if SQLITE_ENABLE_UPDATE_DELETE_LIMIT || SQLITE_UDL_CAPABLE_PARSER
cmd ::= with(C) UPDATE orconf(R) xfullname(X) indexed_opt(I) SET setlist(Y) from(F)
        where_opt_ret(W) orderby_opt(O) limit_opt(L). {
  state.stmt = {
    type: "UpdateStmt",
    with: C, orConflict: R, tblName: X, indexed: I, sets: Y, from: F,
    whereClause: W.where, returning: W.returning, orderBy: O, limit: L, span: nodeSpan()
  };
}
%else
cmd ::= with(C) UPDATE orconf(R) xfullname(X) indexed_opt(I) SET setlist(Y) from(F)
        where_opt_ret(W). {
  state.stmt = {
    type: "UpdateStmt",
    with: C, orConflict: R, tblName: X, indexed: I, sets: Y, from: F,
    whereClause: W.where, returning: W.returning, orderBy: undefined, limit: undefined, span: nodeSpan()
  };
}
%endif

%type setlist {SetAssignment[]}
setlist(A) ::= setlist(A) COMMA nm(X) EQ expr(Y).           { A.push({ type: "SetAssignment", colNames: [X], expr: Y, span: nodeSpan() }); }
setlist(A) ::= setlist(A) COMMA LP idlist(X) RP EQ expr(Y). { A.push({ type: "SetAssignment", colNames: X,   expr: Y, span: nodeSpan() }); }
setlist(A) ::= nm(X) EQ expr(Y).                            { A = [{ type: "SetAssignment", colNames: [X], expr: Y, span: nodeSpan() }]; }
setlist(A) ::= LP idlist(X) RP EQ expr(Y).                  { A = [{ type: "SetAssignment", colNames: X,   expr: Y, span: nodeSpan() }]; }

////////////////////////// The INSERT command /////////////////////////////////
//
cmd ::= with(W) insert_cmd(R) INTO xfullname(X) idlist_opt(F) select(S) upsert(U). {
  state.stmt = {
    type: "InsertStmt",
    with: W, orConflict: R, tblName: X, columns: F,
    body: { type: "SelectInsertBody", select: S, upsert: U.upsert, span: nodeSpan() },
    returning: U.returning, span: nodeSpan()
  };
}
cmd ::= with(W) insert_cmd(R) INTO xfullname(X) idlist_opt(F) DEFAULT VALUES returning(Y). {
  state.stmt = {
    type: "InsertStmt",
    with: W, orConflict: R, tblName: X, columns: F,
    body: { type: "DefaultValuesInsertBody", span: nodeSpan() },
    returning: Y.columns, span: nodeSpan()
  };
}

%type upsert {{upsert: Upsert | undefined, returning: ResultColumn[] | undefined, returningSpan: Span | undefined, span: Span}}

upsert(A) ::= .                               { A = { upsert: undefined, returning: undefined, returningSpan: undefined, span: nodeSpan() }; }
upsert(A) ::= RETURNING selcollist(X).        { A = { upsert: undefined, returning: X, returningSpan: nodeSpan(), span: nodeSpan() }; }
upsert(A) ::= ON CONFLICT LP sortlist(T) RP where_opt(TW)
              DO UPDATE SET setlist(Z) where_opt(W) upsert(N). {
  const idx = mkUpsertIndex(state, T, TW, nodeSpan());
  A = {
    upsert: { type: "Upsert", index: idx, doClause: { type: "SetUpsertDo", sets: Z, whereClause: W, span: nodeSpan() }, next: N.upsert, span: nodeSpan() },
    returning: N.returning, returningSpan: N.returningSpan, span: nodeSpan()
  };
}
upsert(A) ::= ON CONFLICT LP sortlist(T) RP where_opt(TW) DO NOTHING upsert(N). {
  const idx = mkUpsertIndex(state, T, TW, nodeSpan());
  A = {
    upsert: { type: "Upsert", index: idx, doClause: { type: "NothingUpsertDo", span: nodeSpan() }, next: N.upsert, span: nodeSpan() },
    returning: N.returning, returningSpan: N.returningSpan, span: nodeSpan()
  };
}
upsert(A) ::= ON CONFLICT DO NOTHING returning(R). {
  A = { upsert: { type: "Upsert", index: undefined, doClause: { type: "NothingUpsertDo", span: nodeSpan() }, next: undefined, span: nodeSpan() }, returning: R.columns, returningSpan: R.span, span: nodeSpan() };
}
upsert(A) ::= ON CONFLICT DO UPDATE SET setlist(Z) where_opt(W) returning(R). {
  A = {
    upsert: { type: "Upsert", index: undefined, doClause: { type: "SetUpsertDo", sets: Z, whereClause: W, span: nodeSpan() }, next: undefined, span: nodeSpan() },
    returning: R.columns, returningSpan: R.span, span: nodeSpan()
  };
}

%type returning {{columns: ResultColumn[] | undefined, span: Span | undefined}}
returning(A) ::= RETURNING selcollist(X). { A = { columns: X, span: nodeSpan() }; }
returning(A) ::= .                        { A = { columns: undefined, span: undefined }; }

%type insert_cmd {ResolveType | undefined}
insert_cmd(A) ::= INSERT orconf(R).   { A = R; }
insert_cmd(A) ::= REPLACE.            { A = "Replace"; }

%type idlist_opt {DistinctNames | undefined}
%type idlist     {Name[]}
idlist_opt(A) ::= .                   { A = undefined; }
idlist_opt(A) ::= LP idlist(X) RP.    { A = X;    }
idlist(A) ::= idlist(A) COMMA nm(Y).  {
  const duplicateOf = A.find(n => n.name===Y.name);
  if( duplicateOf ){
    state.errors.push(mkDuplicateDiagnostic(
      `column "${Y.name}" specified more than once`,
      Y.span,
      duplicateOf.span,
    ));
  }else{
    A.push(Y);
  }
}
idlist(A) ::= nm(Y).                  { A = [Y]; }

/////////////////////////// Expression Processing /////////////////////////////
//
%type expr {Expr}
%type term {Expr}

expr(A) ::= term(A).
expr(A) ::= LP expr(X) RP.        { A = mkParenthesized(X, nodeSpan()); }
expr(A) ::= idj(X).               { A = mkId(X); }
expr(A) ::= nm(X) DOT nm(Y).      { A = { type: "QualifiedExpr", schema: undefined, table: X, column: Y, span: nodeSpan() }; }
expr(A) ::= nm(X) DOT nm(Y) DOT nm(Z). {
  A = { type: "QualifiedExpr", schema: X, table: Y, column: Z, span: nodeSpan() };
}
term(A) ::= NULL(X).              { A = mkNullLiteral(X); }
term(A) ::= BLOB(X).              { A = mkBlobLiteral(X); }
term(A) ::= STRING(X).            { A = mkStringLiteral(X); }
term(A) ::= FLOAT|INTEGER(X).     { A = mkNumericLiteral(X); }
expr(A) ::= VARIABLE(X).          { A = mkVariableExpr(X); }
expr(A) ::= expr(X) COLLATE ids(C). { A = mkCollate(X, C, nodeSpan()); }
%ifndef SQLITE_OMIT_CAST
expr(A) ::= CAST LP expr(E) AS typetoken(T) RP. { A = mkCast(E, T, nodeSpan()); }
%endif  SQLITE_OMIT_CAST

expr(A) ::= idj(X) LP distinct(D) exprlist(Y) RP. {
  A = mkFunctionCall(state, X, D, Y, undefined, undefined, nodeSpan());
}
expr(A) ::= idj(X) LP distinct(D) exprlist(Y) ORDER BY sortlist(O) RP. {
  A = mkFunctionCall(state, X, D, Y, { type: "SortListFunctionCallOrder", columns: O, span: nodeSpan() }, undefined, nodeSpan());
}
expr(A) ::= idj(X) LP STAR RP. { A = mkFunctionCallStar(X, undefined, nodeSpan()); }

%ifdef SQLITE_ENABLE_ORDERED_SET_AGGREGATES
expr(A) ::= idj(X) LP distinct(D) exprlist(Y) RP WITHIN GROUP LP ORDER BY expr(E) RP. {
  A = mkFunctionCall(state, X, D, Y, { type: "WithinGroupFunctionCallOrder", expr: E, span: nodeSpan() }, undefined, nodeSpan());
}
%endif SQLITE_ENABLE_ORDERED_SET_AGGREGATES

%ifndef SQLITE_OMIT_WINDOWFUNC
expr(A) ::= idj(X) LP distinct(D) exprlist(Y) RP filter_over(Z). {
  A = mkFunctionCall(state, X, D, Y, undefined, Z, nodeSpan());
}
expr(A) ::= idj(X) LP distinct(D) exprlist(Y) ORDER BY sortlist(O) RP filter_over(Z). {
  A = mkFunctionCall(state, X, D, Y, { type: "SortListFunctionCallOrder", columns: O, span: nodeSpan() }, Z, nodeSpan());
}
expr(A) ::= idj(X) LP STAR RP filter_over(Z). { A = mkFunctionCallStar(X, Z, nodeSpan()); }
%ifdef SQLITE_ENABLE_ORDERED_SET_AGGREGATES
expr(A) ::= idj(X) LP distinct(D) exprlist(Y) RP WITHIN GROUP LP ORDER BY expr(E) RP filter_over(Z). {
  A = mkFunctionCall(state, X, D, Y, { type: "WithinGroupFunctionCallOrder", expr: E, span: nodeSpan() }, Z, nodeSpan());
}
%endif SQLITE_ENABLE_ORDERED_SET_AGGREGATES
%endif SQLITE_OMIT_WINDOWFUNC

term(A) ::= CTIME_KW(OP). { A = literalFromCtimeKw(OP); }

expr(A) ::= LP nexprlist(X) COMMA expr(Y) RP. {
  A = { type: "ParenthesizedExpr", exprs: [...X, Y], span: nodeSpan() };
}

expr(A) ::= expr(X) AND(OP) expr(Y).    { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y, nodeSpan()); }
expr(A) ::= expr(X) OR(OP) expr(Y).     { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y, nodeSpan()); }
expr(A) ::= expr(X) LT|GT|GE|LE(OP) expr(Y).
                                        { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y, nodeSpan()); }
expr(A) ::= expr(X) EQ|NE(OP) expr(Y).  { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y, nodeSpan()); }
expr(A) ::= expr(X) BITAND|BITOR|LSHIFT|RSHIFT(OP) expr(Y).
                                        { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y, nodeSpan()); }
expr(A) ::= expr(X) PLUS|MINUS(OP) expr(Y).
                                        { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y, nodeSpan()); }
expr(A) ::= expr(X) STAR|SLASH|REM(OP) expr(Y).
                                        { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y, nodeSpan()); }
expr(A) ::= expr(X) CONCAT(OP) expr(Y). { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y, nodeSpan()); }

%type likeop {{ not: boolean, op: LikeOperator, span: Span }}
likeop(A) ::= LIKE_KW|MATCH(X).        { A = { not: false, op: likeOperatorFromToken(X, tokens), span: nodeSpan() }; }
likeop(A) ::= NOT LIKE_KW|MATCH(X).    { A = { not: true,  op: likeOperatorFromToken(X, tokens), span: nodeSpan() }; }
expr(A) ::= expr(X) likeop(OP) expr(Y).  [LIKE_KW] {
  A = mkLikeExpr(X, OP.not, OP.op, Y, undefined, nodeSpan());
}
expr(A) ::= expr(X) likeop(OP) expr(Y) ESCAPE expr(E).  [LIKE_KW] {
  A = mkLikeExpr(X, OP.not, OP.op, Y, E, nodeSpan());
}

expr(A) ::= expr(X) ISNULL|NOTNULL(E).  { A = mkNotNullExpr(X, E.type, tokens, nodeSpan()); }
expr(A) ::= expr(X) NOT NULL.           { A = { type: "NotNullExpr", expr: X, span: nodeSpan() }; }

//    expr1 IS expr2       same as    expr1 IS NOT DISTINCT FROM expr2
//    expr1 IS NOT expr2   same as    expr1 IS DISTINCT FROM expr2
//
expr(A) ::= expr(X) IS expr(Y).                 { A = mkBinary(X, "Is", Y, nodeSpan()); }
expr(A) ::= expr(X) IS NOT expr(Y).             { A = mkBinary(X, "IsNot", Y, nodeSpan()); }
expr(A) ::= expr(X) IS NOT DISTINCT FROM expr(Y). { A = mkBinary(X, "Is", Y, nodeSpan()); }
expr(A) ::= expr(X) IS DISTINCT FROM expr(Y).     { A = mkBinary(X, "IsNot", Y, nodeSpan()); }

expr(A) ::= NOT(B) expr(X).                    { A = mkUnary(unaryOperatorFromToken(B.type, tokens), X, nodeSpan()); }
expr(A) ::= BITNOT(B) expr(X).                 { A = mkUnary(unaryOperatorFromToken(B.type, tokens), X, nodeSpan()); }
expr(A) ::= PLUS|MINUS(B) expr(X). [BITNOT]    { A = mkUnary(unaryOperatorFromToken(B.type, tokens), X, nodeSpan()); }

expr(A) ::= expr(B) PTR(C) expr(D). { A = mkBinary(B, ptrOperatorFromToken(C), D, nodeSpan()); }

%type between_op {boolean}
between_op(A) ::= BETWEEN.          { A = false; }
between_op(A) ::= NOT BETWEEN.      { A = true;  }
expr(A) ::= expr(B) between_op(N) expr(X) AND expr(Y). [BETWEEN] {
  A = mkBetween(B, N, X, Y, nodeSpan());
}

%ifndef SQLITE_OMIT_SUBQUERY
  %type in_op {boolean}
  in_op(A) ::= IN.       { A = false; }
  in_op(A) ::= NOT IN.   { A = true;  }
  expr(A) ::= expr(X) in_op(N) LP exprlist(Y) RP. [IN] { A = mkInList(X, N, Y, nodeSpan()); }
  expr(A) ::= LP select(X) RP.                         { A = mkSubquery(X, nodeSpan()); }
  expr(A) ::= expr(X) in_op(N) LP select(Y) RP.  [IN]  { A = mkInSelect(X, N, Y, nodeSpan()); }
  expr(A) ::= expr(X) in_op(N) fullname(Y) paren_exprlist(E). [IN] {
    A = mkInTable(X, N, Y, E, nodeSpan());
  }
  expr(A) ::= EXISTS LP select(Y) RP.                  { A = mkExistsExpr(Y, nodeSpan()); }
%endif SQLITE_OMIT_SUBQUERY

/* CASE expressions */
expr(A) ::= CASE case_operand(X) case_exprlist(Y) case_else(Z) END. {
  A = { type: "CaseExpr", base: X, whenThenPairs: Y, elseExpr: Z, span: nodeSpan() };
}
%type case_exprlist {WhenThen[]}
case_exprlist(A) ::= case_exprlist(A) WHEN expr(Y) THEN expr(Z). {
  A.push({ type: "WhenThen", when: Y, then: Z, span: nodeSpan() });
}
case_exprlist(A) ::= WHEN expr(Y) THEN expr(Z). {
  A = [{ type: "WhenThen", when: Y, then: Z, span: nodeSpan() }];
}
%type case_else {Expr | undefined}
case_else(A) ::= ELSE expr(X).         { A = X;    }
case_else(A) ::= .                     { A = undefined; }
%type case_operand {Expr | undefined}
case_operand(A) ::= expr(X).            { A = X;    }
case_operand(A) ::= .                   { A = undefined; }

%type exprlist  {Expr[] | undefined}
%type nexprlist {Expr[]}

exprlist(A)  ::= nexprlist(X).                  { A = X;    }
exprlist(A)  ::= .                              { A = undefined; }
nexprlist(A) ::= nexprlist(A) COMMA expr(Y).    { A.push(Y); }
nexprlist(A) ::= expr(Y).                       { A = [Y];   }

%ifndef SQLITE_OMIT_SUBQUERY
/* A paren_exprlist is an optional expression list contained inside of
** parenthesis */
%type paren_exprlist {Expr[] | undefined}
paren_exprlist(A) ::= .                   { A = undefined; }
paren_exprlist(A) ::= LP exprlist(X) RP.  { A = X;    }
%endif SQLITE_OMIT_SUBQUERY

///////////////////////////// The CREATE INDEX command ///////////////////////
//
cmd ::= createkw uniqueflag(U) INDEX ifnotexists(NE) fullname(X)
        ON nm(Y) LP sortlist(Z) RP where_opt(W). {
  state.stmt = {
    type: "CreateIndexStmt",
    unique: U, ifNotExists: NE, idxName: X, tblName: Y, columns: Z, whereClause: W, span: nodeSpan()
  };
}

%type uniqueflag {boolean}
uniqueflag(A) ::= UNIQUE.   { A = true;  }
uniqueflag(A) ::= .         { A = false; }

// The eidlist non-terminal (Expression Id List) is a list of columns
// used to define CHECK/PK/UNIQUE constraints, VIEW column lists, and
// CTE column lists.
//
%type eidlist     {IndexedColumn[]}
%type eidlist_opt {IndexedColumn[] | undefined}

eidlist_opt(A) ::= .                                          { A = undefined; }
eidlist_opt(A) ::= LP eidlist(X) RP.                          { A = X;    }
eidlist(A) ::= eidlist(A) COMMA nm(Y) collate(C) sortorder(Z). {
  A.push({ type: "IndexedColumn", colName: Y, collationName: C, order: Z, span: nodeSpan() });
}
eidlist(A) ::= nm(Y) collate(C) sortorder(Z). {
  A = [{ type: "IndexedColumn", colName: Y, collationName: C, order: Z, span: nodeSpan() }];
}

%type collate {Name | undefined}
collate(C) ::= .                 { C = undefined; }
collate(C) ::= COLLATE ids(X).   { C = mkName(X); }

///////////////////////////// The DROP INDEX command /////////////////////////
//
cmd ::= DROP INDEX ifexists(E) fullname(X). {
  state.stmt = { type: "DropIndexStmt", ifExists: E, idxName: X, span: nodeSpan() };
}

///////////////////////////// The VACUUM command /////////////////////////////
//
%if !SQLITE_OMIT_VACUUM && !SQLITE_OMIT_ATTACH
%type vinto {Expr | undefined}
cmd ::= VACUUM vinto(Y).                { state.stmt = { type: "VacuumStmt", name: undefined, into: Y, span: nodeSpan() }; }
cmd ::= VACUUM nm(X) vinto(Y).          { state.stmt = { type: "VacuumStmt", name: X,    into: Y, span: nodeSpan() }; }
vinto(A) ::= INTO expr(X).              { A = X;    }
vinto(A) ::= .                          { A = undefined; }
%endif

///////////////////////////// The PRAGMA command /////////////////////////////
//
%ifndef SQLITE_OMIT_PRAGMA
cmd ::= PRAGMA fullname(X).                  { state.stmt = { type: "PragmaStmt", name: X, body: undefined, span: nodeSpan() }; }
cmd ::= PRAGMA fullname(X) EQ nmnum(Y).      { state.stmt = { type: "PragmaStmt", name: X, body: { type: "EqualsPragmaBody", value: Y, span: nodeSpan() }, span: nodeSpan() }; }
cmd ::= PRAGMA fullname(X) LP nmnum(Y) RP.   { state.stmt = { type: "PragmaStmt", name: X, body: { type: "CallPragmaBody",   value: Y, span: nodeSpan() }, span: nodeSpan() }; }
cmd ::= PRAGMA fullname(X) EQ minus_num(Y).  { state.stmt = { type: "PragmaStmt", name: X, body: { type: "EqualsPragmaBody", value: Y, span: nodeSpan() }, span: nodeSpan() }; }
cmd ::= PRAGMA fullname(X) LP minus_num(Y) RP. { state.stmt = { type: "PragmaStmt", name: X, body: { type: "CallPragmaBody",   value: Y, span: nodeSpan() }, span: nodeSpan() }; }

%type nmnum {Expr}
nmnum(A) ::= plus_num(A).
nmnum(A) ::= nm(X).      { A = { type: "NameExpr", name: X, span: nodeSpan() }; }
nmnum(A) ::= ON(X).      { A = mkKeywordLiteral(X); }
nmnum(A) ::= DELETE(X).  { A = mkKeywordLiteral(X); }
nmnum(A) ::= DEFAULT(X). { A = mkKeywordLiteral(X); }
%endif SQLITE_OMIT_PRAGMA
%token_class number INTEGER|FLOAT.
%type plus_num  {Expr}
plus_num(A) ::= PLUS number(X). {
  A = mkUnary("Positive", mkNumericLiteral(X), nodeSpan());
}
plus_num(A) ::= number(X).      { A = mkNumericLiteral(X); }
%type minus_num {Expr}
minus_num(A) ::= MINUS number(X). {
  A = mkUnary("Negative", mkNumericLiteral(X), nodeSpan());
}

//////////////////////////// The CREATE TRIGGER command /////////////////////
%ifndef SQLITE_OMIT_TRIGGER
cmd ::= createkw temp(T) TRIGGER ifnotexists(NOERR) fullname(B) trigger_time(C) trigger_event(D)
        ON fullname(E) foreach_clause(X) when_clause(G) BEGIN trigger_cmd_list(S) END. {
  state.stmt = {
    type: "CreateTriggerStmt",
    temporary: T, ifNotExists: NOERR, triggerName: B, time: C, event: D, tblName: E,
    forEachRow: X, whenClause: G, commands: S, span: nodeSpan()
  };
}

%type trigger_time {TriggerTime | undefined}
trigger_time(A) ::= BEFORE.     { A = "Before"; }
trigger_time(A) ::= AFTER.      { A = "After"; }
trigger_time(A) ::= INSTEAD OF. { A = "InsteadOf"; }
trigger_time(A) ::= .           { A = undefined; }

%type trigger_event {TriggerEvent}
trigger_event(A) ::= DELETE.              { A = { type: "DeleteTriggerEvent", span: nodeSpan() }; }
trigger_event(A) ::= INSERT.              { A = { type: "InsertTriggerEvent", span: nodeSpan() }; }
trigger_event(A) ::= UPDATE.              { A = { type: "UpdateTriggerEvent", span: nodeSpan() }; }
trigger_event(A) ::= UPDATE OF idlist(X). { A = { type: "UpdateOfTriggerEvent", columns: X, span: nodeSpan() }; }

%type foreach_clause {boolean}
foreach_clause(A) ::= .             { A = false; }
foreach_clause(A) ::= FOR EACH ROW. { A = true;  }

%type when_clause {Expr | undefined}
when_clause(A) ::= .             { A = undefined; }
when_clause(A) ::= WHEN expr(X). { A = X;    }

%type trigger_cmd_list {TriggerCmd[]}
trigger_cmd_list(A) ::= trigger_cmd_list(A) trigger_cmd(X) SEMI. { A.push(X); }
trigger_cmd_list(A) ::= trigger_cmd(X) SEMI.                     { A = [X];  }

// Disallow the INDEX BY and NOT INDEXED clauses on UPDATE and DELETE
// statements within triggers.  We make a specific error message for this
// since it is an exception to the default grammar rules.
//
tridxby ::= .
tridxby ::= INDEXED BY nm. {
  state.errors.push(mkDiagnostic(
    "the INDEXED BY clause is not allowed on UPDATE or DELETE statements within triggers",
    nodeSpan(),
  ));
}
tridxby ::= NOT INDEXED. {
  state.errors.push(mkDiagnostic(
    "the NOT INDEXED clause is not allowed on UPDATE or DELETE statements within triggers",
    nodeSpan(),
  ));
}

%type trigger_cmd {TriggerCmd}
// UPDATE
trigger_cmd(A) ::= UPDATE orconf(R) xfullname(X) tridxby SET setlist(Y) from(F) where_opt(Z). {
  A = { type: "UpdateTriggerCmd", orConflict: R, tblName: X, sets: Y, from: F, whereClause: Z, span: nodeSpan() };
}
// INSERT
trigger_cmd(A) ::= insert_cmd(R) INTO xfullname(X) idlist_opt(F) select(S) upsert(U). {
  if( U.returning ){
    state.errors.push(mkDiagnostic(
      "cannot use RETURNING in a trigger",
      U.returningSpan ?? nodeSpan(),
    ));
  }
  A = {
    type: "InsertTriggerCmd",
    orConflict: R, tblName: X, colNames: F, select: S, upsert: U.upsert, span: nodeSpan()
  };
}
// DELETE
trigger_cmd(A) ::= DELETE FROM xfullname(X) tridxby where_opt(Y). {
  A = { type: "DeleteTriggerCmd", tblName: X, whereClause: Y, span: nodeSpan() };
}
// SELECT
trigger_cmd(A) ::= select(X). { A = { type: "SelectTriggerCmd", select: X, span: nodeSpan() }; }

// The special RAISE expression that may occur in trigger programs
expr(A) ::= RAISE LP IGNORE RP. {
  A = { type: "RaiseExpr", resolve: "Ignore", message: undefined, span: nodeSpan() };
}
expr(A) ::= RAISE LP raisetype(T) COMMA expr(Z) RP. {
  A = { type: "RaiseExpr", resolve: T, message: Z, span: nodeSpan() };
}
%endif  !SQLITE_OMIT_TRIGGER

%type raisetype {ResolveType}
raisetype(A) ::= ROLLBACK.  { A = "Rollback"; }
raisetype(A) ::= ABORT.     { A = "Abort"; }
raisetype(A) ::= FAIL.      { A = "Fail"; }

////////////////////////  DROP TRIGGER statement //////////////////////////////
%ifndef SQLITE_OMIT_TRIGGER
cmd ::= DROP TRIGGER ifexists(NOERR) fullname(X). {
  state.stmt = { type: "DropTriggerStmt", ifExists: NOERR, triggerName: X, span: nodeSpan() };
}
%endif  !SQLITE_OMIT_TRIGGER

//////////////////////// ATTACH DATABASE file AS name /////////////////////////
%ifndef SQLITE_OMIT_ATTACH
cmd ::= ATTACH database_kw_opt expr(F) AS expr(D) key_opt(K). {
  state.stmt = { type: "AttachStmt", expr: F, dbName: D, key: K, span: nodeSpan() };
}
cmd ::= DETACH database_kw_opt expr(D). {
  state.stmt = { type: "DetachStmt", expr: D, span: nodeSpan() };
}

%type key_opt {Expr | undefined}
key_opt(A) ::= .                     { A = undefined; }
key_opt(A) ::= KEY expr(X).          { A = X;    }

database_kw_opt ::= DATABASE.
database_kw_opt ::= .
%endif SQLITE_OMIT_ATTACH

////////////////////////// REINDEX collation //////////////////////////////////
%ifndef SQLITE_OMIT_REINDEX
cmd ::= REINDEX.                { state.stmt = { type: "ReindexStmt", objName: undefined, span: nodeSpan() }; }
cmd ::= REINDEX fullname(X).    { state.stmt = { type: "ReindexStmt", objName: X, span: nodeSpan()    }; }
%endif  SQLITE_OMIT_REINDEX

/////////////////////////////////// ANALYZE ///////////////////////////////////
%ifndef SQLITE_OMIT_ANALYZE
cmd ::= ANALYZE.                { state.stmt = { type: "AnalyzeStmt", objName: undefined, span: nodeSpan() }; }
cmd ::= ANALYZE fullname(X).    { state.stmt = { type: "AnalyzeStmt", objName: X, span: nodeSpan()    }; }
%endif

//////////////////////// ALTER TABLE table ... ////////////////////////////////
%ifndef SQLITE_OMIT_ALTERTABLE
%ifndef SQLITE_OMIT_VIRTUALTABLE
cmd ::= ALTER TABLE fullname(X) RENAME TO nm(Z). {
  state.stmt = { type: "AlterTableStmt", tblName: X, body: { type: "RenameToAlterTableBody", name: Z, span: nodeSpan() }, span: nodeSpan() };
}
cmd ::= ALTER TABLE fullname(X) ADD kwcolumn_opt nm(Y) typetoken(Z) carglist(C). {
  const cd = mkColumnDefinition(Y, Z, C, nodeSpan());
  state.stmt = { type: "AlterTableStmt", tblName: X, body: { type: "AddColumnAlterTableBody", column: cd, span: nodeSpan() }, span: nodeSpan() };
}
cmd ::= ALTER TABLE fullname(X) DROP kwcolumn_opt nm(Y). {
  state.stmt = { type: "AlterTableStmt", tblName: X, body: { type: "DropColumnAlterTableBody", column: Y, span: nodeSpan() }, span: nodeSpan() };
}
cmd ::= ALTER TABLE fullname(X) RENAME kwcolumn_opt nm(Y) TO nm(Z). {
  state.stmt = { type: "AlterTableStmt", tblName: X, body: { type: "RenameColumnAlterTableBody", old: Y, new: Z, span: nodeSpan() }, span: nodeSpan() };
}
cmd ::= ALTER TABLE fullname(X) DROP CONSTRAINT nm(Y). {
  state.stmt = { type: "AlterTableStmt", tblName: X, body: { type: "DropConstraintAlterTableBody", name: Y, span: nodeSpan() }, span: nodeSpan() };
}
cmd ::= ALTER TABLE fullname(X) ALTER kwcolumn_opt nm(Y) DROP NOT NULL. {
  state.stmt = { type: "AlterTableStmt", tblName: X, body: { type: "DropColumnNotNullAlterTableBody", column: Y, span: nodeSpan() }, span: nodeSpan() };
}
cmd ::= ALTER TABLE fullname(X) ALTER kwcolumn_opt nm(Y) SET NOT NULL onconf(R). {
  state.stmt = { type: "AlterTableStmt", tblName: X, body: { type: "SetColumnNotNullAlterTableBody", column: Y, onConflict: R, span: nodeSpan() }, span: nodeSpan() };
}
cmd ::= ALTER TABLE fullname(X) ADD CONSTRAINT nm(Z) CHECK LP expr(E) RP onconf(R). {
  const constraint: TableConstraint = { type: "CheckTableConstraint", expr: E, conflictClause: R, span: nodeSpan() };
  state.stmt = {
    type: "AlterTableStmt", tblName: X,
    body: { type: "AddConstraintAlterTableBody", constraint: { type: "NamedTableConstraint", name: Z, constraint, span: nodeSpan() }, span: nodeSpan() }, span: nodeSpan()
  };
}
cmd ::= ALTER TABLE fullname(X) ADD CHECK LP expr(E) RP onconf(R). {
  const constraint: TableConstraint = { type: "CheckTableConstraint", expr: E, conflictClause: R, span: nodeSpan() };
  state.stmt = {
    type: "AlterTableStmt", tblName: X,
    body: { type: "AddConstraintAlterTableBody", constraint: { type: "NamedTableConstraint", name: undefined, constraint, span: nodeSpan() }, span: nodeSpan() }, span: nodeSpan()
  };
}

kwcolumn_opt ::= .
kwcolumn_opt ::= COLUMNKW.
%endif SQLITE_OMIT_VIRTUALTABLE
%endif SQLITE_OMIT_ALTERTABLE

//////////////////////// CREATE VIRTUAL TABLE ... /////////////////////////////
%ifndef SQLITE_OMIT_VIRTUALTABLE
cmd ::= create_vtab(X).                    { state.stmt = X; }
cmd ::= create_vtab(X) LP vtabarglist RP.  {
  if( state.vtabArgCurrent.length>0 ){
    state.vtabArgs.push(state.vtabArgCurrent);
    state.vtabArgCurrent = "";
  }
  if( X.type==="CreateVirtualTableStmt" ){
    state.stmt = { ...X, args: state.vtabArgs.slice(), span: nodeSpan() };
  }else{
    state.stmt = X;
  }
  state.vtabArgs = [];
}
%type create_vtab {Stmt}
create_vtab(A) ::= createkw VIRTUAL TABLE ifnotexists(E) fullname(X) USING nm(Z). {
  A = { type: "CreateVirtualTableStmt", ifNotExists: E, tblName: X, moduleName: Z, args: undefined, span: nodeSpan() };
}
vtabarglist ::= vtabarg.
vtabarglist ::= vtabarglist COMMA vtabarg.
vtabarg ::= .                       {
  if( state.vtabArgCurrent.length>0 ) state.vtabArgs.push(state.vtabArgCurrent);
  state.vtabArgCurrent = "";
}
vtabarg ::= vtabarg vtabargtoken.
vtabargtoken ::= ANY(X).            { state.vtabArgCurrent += X.text; }
vtabargtoken ::= lp anylist RP(X).  { state.vtabArgCurrent += X.text; }
lp ::= LP(X).                       { state.vtabArgCurrent += X.text; }
anylist ::= .
anylist ::= anylist LP anylist RP.
anylist ::= anylist ANY.
%endif  SQLITE_OMIT_VIRTUALTABLE

//////////////////////// COMMON TABLE EXPRESSIONS ////////////////////////////
%type with   {With | undefined}
%type wqlist {CommonTableExpr[]}
%type wqitem {CommonTableExpr}

with(A) ::= .                           { A = undefined; }
%ifndef SQLITE_OMIT_CTE
with(A) ::= WITH wqlist(W).             { A = { type: "With", recursive: false, ctes: W, span: nodeSpan() }; }
with(A) ::= WITH RECURSIVE wqlist(W).   { A = { type: "With", recursive: true,  ctes: W, span: nodeSpan() }; }

%type wqas {Materialized}
wqas(A)   ::= AS.                  { A = "Any"; }
wqas(A)   ::= AS MATERIALIZED.     { A = "Yes"; }
wqas(A)   ::= AS NOT MATERIALIZED. { A = "No"; }
wqitem(A) ::= nm(X) eidlist_opt(Y) wqas(M) LP select(Z) RP. {
  A = { type: "CommonTableExpr", tblName: X, columns: Y, materialized: M, select: Z, span: nodeSpan() };
}
wqlist(A) ::= wqitem(X).                  { A = [X]; }
wqlist(A) ::= wqlist(A) COMMA wqitem(X).  { addCte(state, A, X); }
%endif  SQLITE_OMIT_CTE

//////////////////////// WINDOW FUNCTION EXPRESSIONS /////////////////////////
// These must be at the end of this file. Specifically, the rules that
// introduce tokens WINDOW, OVER and FILTER must appear last. This causes
// the integer values assigned to these tokens to be larger than all other
// tokens that may be output by the tokenizer except TK_SPACE, TK_COMMENT,
// and TK_ILLEGAL.
//
%ifndef SQLITE_OMIT_WINDOWFUNC
%type windowdefn_list {WindowDef[]}
windowdefn_list(A) ::= windowdefn(Z).                         { A = [Z]; }
windowdefn_list(A) ::= windowdefn_list(A) COMMA windowdefn(Z). { A.push(Z); }

%type windowdefn {WindowDef}
windowdefn(A) ::= nm(X) AS LP window(Y) RP. { A = { type: "WindowDef", name: X, window: Y, span: nodeSpan() }; }

%type window {Window}

%type frame_opt     {FrameClause | undefined}
%type filter_clause {Expr}
%type over_clause   {Over}
%type filter_over   {FunctionTail}
%type range_or_rows {FrameMode}
%type frame_bound   {FrameBound}
%type frame_bound_s {FrameBound}
%type frame_bound_e {FrameBound}

window(A) ::= PARTITION BY nexprlist(X) orderby_opt(Y) frame_opt(Z). {
  A = { type: "Window", base: undefined, partitionBy: X,    orderBy: Y,    frameClause: Z, span: nodeSpan() };
}
window(A) ::= nm(W) PARTITION BY nexprlist(X) orderby_opt(Y) frame_opt(Z). {
  A = { type: "Window", base: W,    partitionBy: X,    orderBy: Y,    frameClause: Z, span: nodeSpan() };
}
window(A) ::= ORDER BY sortlist(Y) frame_opt(Z). {
  A = { type: "Window", base: undefined, partitionBy: undefined, orderBy: Y,    frameClause: Z, span: nodeSpan() };
}
window(A) ::= nm(W) ORDER BY sortlist(Y) frame_opt(Z). {
  A = { type: "Window", base: W,    partitionBy: undefined, orderBy: Y,    frameClause: Z, span: nodeSpan() };
}
window(A) ::= frame_opt(Z). {
  A = { type: "Window", base: undefined, partitionBy: undefined, orderBy: undefined, frameClause: Z, span: nodeSpan() };
}
window(A) ::= nm(W) frame_opt(Z). {
  A = { type: "Window", base: W,    partitionBy: undefined, orderBy: undefined, frameClause: Z, span: nodeSpan() };
}

frame_opt(A) ::= .                             { A = undefined; }
frame_opt(A) ::= range_or_rows(X) frame_bound_s(Y) frame_exclude_opt(Z). {
  A = { type: "FrameClause", mode: X, start: Y, end: undefined, exclude: Z, span: nodeSpan() };
}
frame_opt(A) ::= range_or_rows(X) BETWEEN frame_bound_s(Y) AND frame_bound_e(Z) frame_exclude_opt(W). {
  A = { type: "FrameClause", mode: X, start: Y, end: Z,    exclude: W, span: nodeSpan() };
}

range_or_rows(A) ::= RANGE.   { A = "Range"; }
range_or_rows(A) ::= ROWS.    { A = "Rows"; }
range_or_rows(A) ::= GROUPS.  { A = "Groups"; }

frame_bound_s(A) ::= frame_bound(X).       { A = X; }
frame_bound_s(A) ::= UNBOUNDED PRECEDING.  { A = { type: "UnboundedPrecedingFrameBound", span: nodeSpan() }; }
frame_bound_e(A) ::= frame_bound(X).       { A = X; }
frame_bound_e(A) ::= UNBOUNDED FOLLOWING.  { A = { type: "UnboundedFollowingFrameBound", span: nodeSpan() }; }

frame_bound(A) ::= expr(X) PRECEDING.     { A = { type: "PrecedingFrameBound",  expr: X, span: nodeSpan() }; }
frame_bound(A) ::= CURRENT ROW.           { A = { type: "CurrentRowFrameBound", span: nodeSpan() }; }
frame_bound(A) ::= expr(X) FOLLOWING.     { A = { type: "FollowingFrameBound",  expr: X, span: nodeSpan() }; }

%type frame_exclude_opt {FrameExclude | undefined}
frame_exclude_opt(A) ::= .                         { A = undefined; }
frame_exclude_opt(A) ::= EXCLUDE frame_exclude(X). { A = X;    }

%type frame_exclude {FrameExclude}
frame_exclude(A) ::= NO OTHERS.   { A = "NoOthers"; }
frame_exclude(A) ::= CURRENT ROW. { A = "CurrentRow"; }
frame_exclude(A) ::= GROUP.       { A = "Group"; }
frame_exclude(A) ::= TIES.        { A = "Ties"; }

%type window_clause {WindowDef[]}
window_clause(A) ::= WINDOW windowdefn_list(B). { A = B; }

filter_over(A) ::= filter_clause(F) over_clause(O). { A = { type: "FunctionTail", filterClause: F,    overClause: O, span: nodeSpan()    }; }
filter_over(A) ::= over_clause(O).                  { A = { type: "FunctionTail", filterClause: undefined, overClause: O, span: nodeSpan()    }; }
filter_over(A) ::= filter_clause(F).                { A = { type: "FunctionTail", filterClause: F,    overClause: undefined, span: nodeSpan() }; }

over_clause(A) ::= OVER LP window(Z) RP.  { A = { type: "WindowOver", window: Z, span: nodeSpan() }; }
over_clause(A) ::= OVER nm(Z).            { A = { type: "NameOver",   name:   Z, span: nodeSpan() }; }

filter_clause(A) ::= FILTER LP WHERE expr(X) RP.  { A = X; }
%endif /* SQLITE_OMIT_WINDOWFUNC */

/*
** Synthesized token codes that do not correspond to any terminal in
** the grammar; they exist only so the generated token map includes
** them for code-generation purposes.
*/
%token
  COLUMN          /* Reference to a table column */
  AGG_FUNCTION    /* An aggregate function */
  AGG_COLUMN      /* An aggregated column */
  TRUEFALSE       /* True or false keyword */
  ISNOT           /* Combination of IS and NOT */
  FUNCTION        /* A function invocation */
  UPLUS           /* Unary plus */
  UMINUS          /* Unary minus */
  TRUTH           /* IS TRUE or IS FALSE or IS NOT TRUE or IS NOT FALSE */
  REGISTER        /* Reference to a VDBE register */
  VECTOR          /* Vector */
  SELECT_COLUMN   /* Choose a single column from a multi-column SELECT */
  IF_NULL_ROW     /* the if-undefined-row operator */
  ASTERISK        /* The "*" in count(*) and similar */
  SPAN            /* The span operator */
  ERROR           /* An expression containing an error */
.

term(A) ::= QNUMBER(X). {
  // Digit-separator literal.  `sqlite3DequoteNumber` strips the
  // separator run (`_` by default) and validates that every separator
  // sits between two digits (or hex digits for `0x…`); mismatched
  // placement surfaces as a parse error.
  const dq = sqlite3DequoteNumber(X.text, { digitSeparator: state.digitSeparator });
  if( dq.error ){
    state.errors.push(mkDiagnostic(
      dq.error,
      X.span,
      {
        message: "digit separators must sit between two digits (e.g. 1_000, 0xDE_AD)",
        span: undefined,
      },
    ));
  }
  A = { type: "NumericLiteral", value: dq.text, span: X.span };
}

/*
** The TK_SPACE, TK_COMMENT, and TK_ILLEGAL tokens must be the last three
** tokens.  The parser depends on this.  Those tokens are not used in any
** grammar rule.  They are only used by the tokenizer.  Declare them last
** so that they are guaranteed to be the last three.
*/
%token SPACE COMMENT ILLEGAL.
