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
** The rule shape follows upstream parse.y (3.54.0) and the Rust
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
    state.errors.push({ message: "incomplete input" });
  }else{
    state.errors.push({
      message: `near "${yyminor.text}": syntax error`,
      start: yyminor.span.offset,
      length: yyminor.span.length,
    });
  }
}

%stack_overflow {
  state.errors.push({ message: "parser stack overflow" });
}

// The name of the generated procedure that implements the parser is as follows:
%name sqlite3Parser

// TypeScript imports, shared helper types, and constructor helpers
// used by the action bodies below.
//
%include {
import type {
  AlterTableBody, As, Cmd, ColFlags, ColumnConstraint, ColumnDefinition,
  CommonTableExpr, CompoundOperator, CompoundSelect, CreateTableBody,
  DeferSubclause, DistinctNames, Distinctness, Expr, ExplainKind,
  FrameBound, FrameClause, FrameExclude, FrameMode, FromClause,
  FunctionCallOrder, FunctionTail, Id, Indexed, IndexedColumn,
  InitDeferredPred, InsertBody, JoinConstraint, JoinOperator, JoinType,
  LikeOperator, Limit, Literal, Materialized, Name, NamedColumnConstraint,
  NamedTableConstraint, NullsOrder, OneSelect, Operator, Over, PragmaBody,
  QualifiedName, RefAct, RefArg, ResolveType, ResultColumn, Select,
  SelectBody, SelectTable, Set_, SortOrder, SortedColumn, Stmt,
  TabFlags, TableConstraint, TransactionType, TriggerCmd, TriggerEvent,
  TriggerTime, Type, TypeSize, UnaryOperator, Upsert, UpsertDo, UpsertIndex,
  Window, WindowDef, With,
} from "../../../src/ast/nodes.ts";
import type { ParseError, ParseState, Token } from "../../../src/ast/parseState.ts";
import type { FromClauseMut } from "../../../src/ast/parseActions.ts";
import {
  mkName, mkId, mkIdExpr, mkVariableExpr,
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
  addCte, mkUpsertIndex, finalizeCmd,
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
ecmd      ::= cmdx SEMI.
%ifndef SQLITE_OMIT_EXPLAIN
ecmd      ::= explain cmdx SEMI.       {NEVER-REDUCE}
explain   ::= EXPLAIN.              { state.explain = "Explain"; }
explain   ::= EXPLAIN QUERY PLAN.   { state.explain = "QueryPlan"; }
%endif  SQLITE_OMIT_EXPLAIN
cmdx      ::= cmd.           { /* statement is complete; state.stmt has been assigned */ }

///////////////////// Begin and end transactions. ////////////////////////////
//
cmd ::= BEGIN transtype(Y) trans_opt(X). { state.stmt = { kind: "Begin",    tx: Y, name: X }; }
%type trans_opt {Name | undefined}
trans_opt(A) ::= .                  { A = undefined; }
trans_opt(A) ::= TRANSACTION.       { A = undefined; }
trans_opt(A) ::= TRANSACTION nm(X). { A = X; }
%type transtype {TransactionType | undefined}
transtype(A) ::= .              { A = undefined; }
transtype(A) ::= DEFERRED.      { A = "Deferred"; }
transtype(A) ::= IMMEDIATE.     { A = "Immediate"; }
transtype(A) ::= EXCLUSIVE.     { A = "Exclusive"; }
cmd ::= COMMIT|END trans_opt(X).           { state.stmt = { kind: "Commit",   name: X }; }
cmd ::= ROLLBACK trans_opt(X).             { state.stmt = { kind: "Rollback", txName: X, savepointName: undefined }; }

savepoint_opt ::= SAVEPOINT.
savepoint_opt ::= .
cmd ::= SAVEPOINT nm(X).                            { state.stmt = { kind: "Savepoint", name: X }; }
cmd ::= RELEASE savepoint_opt nm(X).                { state.stmt = { kind: "Release",   name: X }; }
cmd ::= ROLLBACK trans_opt(Y) TO savepoint_opt nm(X). {
  state.stmt = { kind: "Rollback", txName: Y, savepointName: X };
}

///////////////////// The CREATE TABLE statement ////////////////////////////
//
cmd ::= createkw temp(T) TABLE ifnotexists(E) fullname(Y) create_table_args(X). {
  state.stmt = { kind: "CreateTable", temporary: T, ifNotExists: E, tblName: Y, body: X };
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
  A = mkColumnsAndConstraints(C, X, F);
}
create_table_args(A) ::= AS select(S). {
  A = { kind: "AsSelect", select: S };
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
    state.errors.push({ message: `unknown table option: ${X.name}` });
    A = 0;
  }
}
table_option(A) ::= nm(X). {
  if( X.name.toLowerCase()==="strict" ){
    A = 0x00010000 /* TabFlags.Strict */;
  }else{
    state.errors.push({ message: `unknown table option: ${X.name}` });
    A = 0;
  }
}
%type columnlist {ColumnDefinition[]}
columnlist(A) ::= columnlist(A) COMMA columnname(X) carglist(Y). {
  const cd = mkColumnDefinition(X.colName, X.colType, Y);
  addColumn(state, A, cd);
}
columnlist(A) ::= columnname(X) carglist(Y). {
  const cd = mkColumnDefinition(X.colName, X.colType, Y);
  A = [];
  addColumn(state, A, cd);
}
%type columnname {{colName: Name, colType: Type | undefined}}
columnname(A) ::= nm(X) typetoken(Y). { A = { colName: X, colType: Y }; }

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
typetoken(A) ::= typename(X).                                   { A = { name: X, size: undefined }; }
typetoken(A) ::= typename(X) LP signed(Y) RP. {
  A = { name: X, size: { kind: "MaxSize", size: Y } };
}
typetoken(A) ::= typename(X) LP signed(Y) COMMA signed(Z) RP. {
  A = { name: X, size: { kind: "TypeSize", size1: Y, size2: Z } };
}
%type typename {string}
typename(A) ::= ids(X).               { A = sqlite3Dequote(X.text) as string; }
typename(A) ::= typename(A) ids(Y).   { A = A + " " + (sqlite3Dequote(Y.text) as string); }
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
  A = { name: state.constraintName, constraint: { kind: "Default", expr: X } };
  state.constraintName = undefined;
}
ccons(A) ::= DEFAULT LP expr(X) RP. {
  A = { name: state.constraintName, constraint: { kind: "Default", expr: mkParenthesized(X) } };
  state.constraintName = undefined;
}
ccons(A) ::= DEFAULT PLUS term(X). {
  A = { name: state.constraintName, constraint: { kind: "Default", expr: mkUnary("Positive", X) } };
  state.constraintName = undefined;
}
ccons(A) ::= DEFAULT MINUS term(X). {
  A = { name: state.constraintName, constraint: { kind: "Default", expr: mkUnary("Negative", X) } };
  state.constraintName = undefined;
}
ccons(A) ::= DEFAULT id(X). {
  A = { name: state.constraintName, constraint: { kind: "Default", expr: mkIdExpr(X) } };
  state.constraintName = undefined;
}

// In addition to the type name, we also care about the primary key and
// UNIQUE constraints.
//
ccons(A) ::= NULL onconf(R). {
  A = { name: state.constraintName, constraint: { kind: "NotNull", nullable: true,  conflictClause: R } };
  state.constraintName = undefined;
}
ccons(A) ::= NOT NULL onconf(R). {
  A = { name: state.constraintName, constraint: { kind: "NotNull", nullable: false, conflictClause: R } };
  state.constraintName = undefined;
}
ccons(A) ::= PRIMARY KEY sortorder(Z) onconf(R) autoinc(I). {
  A = {
    name: state.constraintName,
    constraint: { kind: "PrimaryKey", order: Z, conflictClause: R, autoIncrement: I },
  };
  state.constraintName = undefined;
}
ccons(A) ::= UNIQUE onconf(R). {
  A = { name: state.constraintName, constraint: { kind: "Unique", conflictClause: R } };
  state.constraintName = undefined;
}
ccons(A) ::= CHECK LP expr(X) RP. {
  A = { name: state.constraintName, constraint: { kind: "Check", expr: X } };
  state.constraintName = undefined;
}
ccons(A) ::= REFERENCES nm(T) eidlist_opt(TA) refargs(R). {
  A = {
    name: state.constraintName,
    constraint: {
      kind: "ForeignKey",
      clause: { tblName: T, columns: TA, args: R },
      deferClause: undefined,
    },
  };
  state.constraintName = undefined;
}
ccons(A) ::= defer_subclause(D). {
  A = { name: undefined, constraint: { kind: "Defer", clause: D } };
}
ccons(A) ::= COLLATE ids(C). {
  A = { name: state.constraintName, constraint: { kind: "Collate", collationName: mkName(C) } };
  state.constraintName = undefined;
}
ccons(A) ::= GENERATED ALWAYS AS generated(X). {
  A = { name: state.constraintName, constraint: X };
  state.constraintName = undefined;
}
ccons(A) ::= AS generated(X). {
  A = { name: state.constraintName, constraint: X };
  state.constraintName = undefined;
}
%type generated {ColumnConstraint}
generated(X) ::= LP expr(E) RP.           { X = { kind: "Generated", expr: E, typ: undefined }; }
generated(X) ::= LP expr(E) RP ID(TYPE).  { X = { kind: "Generated", expr: E, typ: mkId(TYPE) }; }

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
refarg(A) ::= MATCH nm(X).              { A = { kind: "Match",    name: X };   }
refarg(A) ::= ON INSERT refact(X).      { A = { kind: "OnInsert", action: X }; }
refarg(A) ::= ON DELETE refact(X).      { A = { kind: "OnDelete", action: X }; }
refarg(A) ::= ON UPDATE refact(X).      { A = { kind: "OnUpdate", action: X }; }
%type refact {RefAct}
refact(A) ::= SET NULL.                 { A = "SetNull"; }
refact(A) ::= SET DEFAULT.              { A = "SetDefault"; }
refact(A) ::= CASCADE.                  { A = "Cascade"; }
refact(A) ::= RESTRICT.                 { A = "Restrict"; }
refact(A) ::= NO ACTION.                { A = "NoAction"; }
%type defer_subclause {DeferSubclause}
defer_subclause(A) ::= NOT DEFERRABLE init_deferred_pred_opt(X). {
  A = { deferrable: false, initDeferred: X };
}
defer_subclause(A) ::= DEFERRABLE init_deferred_pred_opt(X). {
  A = { deferrable: true,  initDeferred: X };
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
  A = { name: state.constraintName, constraint: { kind: "PrimaryKey", columns: X, autoIncrement: I, conflictClause: R } };
  state.constraintName = undefined;
}
tcons(A) ::= UNIQUE LP sortlist(X) RP onconf(R). {
  A = { name: state.constraintName, constraint: { kind: "Unique", columns: X, conflictClause: R } };
  state.constraintName = undefined;
}
tcons(A) ::= CHECK LP expr(E) RP onconf(R). {
  A = { name: state.constraintName, constraint: { kind: "Check", expr: E, conflictClause: R } };
  state.constraintName = undefined;
}
tcons(A) ::= FOREIGN KEY LP eidlist(FA) RP
          REFERENCES nm(T) eidlist_opt(TA) refargs(R) defer_subclause_opt(D). {
  A = {
    name: state.constraintName,
    constraint: {
      kind: "ForeignKey",
      columns: FA,
      clause: { tblName: T, columns: TA, args: R },
      deferClause: D,
    },
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
  state.stmt = { kind: "DropTable", ifExists: E, tblName: X };
}
%type ifexists {boolean}
ifexists(A) ::= IF EXISTS.   { A = true;  }
ifexists(A) ::= .            { A = false; }

///////////////////// The CREATE VIEW statement /////////////////////////////
//
%ifndef SQLITE_OMIT_VIEW
cmd ::= createkw temp(T) VIEW ifnotexists(E) fullname(Y) eidlist_opt(C) AS select(S). {
  state.stmt = { kind: "CreateView", temporary: T, ifNotExists: E, viewName: Y, columns: C, select: S };
}
cmd ::= DROP VIEW ifexists(E) fullname(X). {
  state.stmt = { kind: "DropView", ifExists: E, viewName: X };
}
%endif  SQLITE_OMIT_VIEW

//////////////////////// The SELECT statement /////////////////////////////////
//
cmd ::= select(X).  { state.stmt = { kind: "Select", select: X }; }

%type select       {Select}
%type selectnowith {SelectBody}
%type oneselect    {OneSelect}

%ifndef SQLITE_OMIT_CTE
select(A) ::= WITH wqlist(W) selectnowith(X) orderby_opt(Z) limit_opt(L). {
  A = mkSelect({ recursive: false, ctes: W }, X, Z, L);
}
select(A) ::= WITH RECURSIVE wqlist(W) selectnowith(X) orderby_opt(Z) limit_opt(L). {
  A = mkSelect({ recursive: true,  ctes: W }, X, Z, L);
}
%endif /* SQLITE_OMIT_CTE */
select(A) ::= selectnowith(X) orderby_opt(Z) limit_opt(L). {
  A = mkSelect(undefined, X, Z, L);
}

selectnowith(A) ::= oneselect(X). { A = { select: X, compounds: undefined }; }
%ifndef SQLITE_OMIT_COMPOUND_SELECT
selectnowith(A) ::= selectnowith(A) multiselect_op(Y) oneselect(Z). {
  pushCompound(A, { operator: Y, select: Z });
}
%type multiselect_op {CompoundOperator}
multiselect_op(A) ::= UNION.             { A = "Union"; }
multiselect_op(A) ::= UNION ALL.         { A = "UnionAll"; }
multiselect_op(A) ::= EXCEPT.            { A = "Except"; }
multiselect_op(A) ::= INTERSECT.         { A = "Intersect"; }
%endif SQLITE_OMIT_COMPOUND_SELECT

oneselect(A) ::= SELECT distinct(D) selcollist(W) from(X) where_opt(Y)
                 groupby_opt(P) having_opt(Q). {
  A = mkOneSelect(state, D, W, X, Y, P, Q, undefined);
}
%ifndef SQLITE_OMIT_WINDOWFUNC
oneselect(A) ::= SELECT distinct(D) selcollist(W) from(X) where_opt(Y)
                 groupby_opt(P) having_opt(Q) window_clause(R). {
  A = mkOneSelect(state, D, W, X, Y, P, Q, R);
}
%endif

// Single row VALUES clause.
//
%type values {Expr[][]}
oneselect(A) ::= values(X).             { A = { kind: "Values", values: X }; }
values(A) ::= VALUES LP nexprlist(X) RP. { A = [X]; }

// Multiple row VALUES clause.
//
%type mvalues {Expr[][]}
oneselect(A) ::= mvalues(X).                    { A = { kind: "Values", values: X }; }
mvalues(A) ::= values(A) COMMA LP nexprlist(Y) RP.  { valuesPush(state, A, Y); }
mvalues(A) ::= mvalues(A) COMMA LP nexprlist(Y) RP. { valuesPush(state, A, Y); }

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
selcollist(A) ::= sclp(A) expr(X) as(Y).        { A.push({ kind: "Expr", expr: X, alias: Y }); }
selcollist(A) ::= sclp(A) STAR.                 { A.push({ kind: "Star" }); }
selcollist(A) ::= sclp(A) nm(X) DOT STAR.       { A.push({ kind: "TableStar", table: X }); }

// An option "AS <id>" phrase that can follow one of the expressions that
// define the result set, or one of the tables in the FROM clause.
//
%type as {As | undefined}
as(X) ::= AS nm(Y).    { X = { kind: "As",     name: Y }; }
as(X) ::= ids(Y).      { X = { kind: "Elided", name: mkName(Y) }; }
as(X) ::= .            { X = undefined; }

%type seltablist {FromClauseMut}
%type stl_prefix {FromClauseMut}
%type from       {FromClause | undefined}

// A complete FROM clause.
//
from(A) ::= .                      { A = undefined; }
from(A) ::= FROM seltablist(X).    { A = freezeFrom(X); }

// "seltablist" is a "Select Table List" - the content of the FROM clause
// in a SELECT statement.  "stl_prefix" is a prefix of this list.
//
stl_prefix(A) ::= seltablist(A) joinop(Y).    { A.pendingOp = Y; }
stl_prefix(A) ::= .                           { A = emptyFromClause(); }
seltablist(A) ::= stl_prefix(A) fullname(Y) as(Z) indexed_opt(I) on_using(N). {
  fromClausePush(state, A, { kind: "Table", name: Y, alias: Z, indexed: I }, N);
}
seltablist(A) ::= stl_prefix(A) fullname(Y) LP exprlist(E) RP as(Z) on_using(N). {
  fromClausePush(state, A, { kind: "TableCall", name: Y, args: E, alias: Z }, N);
}
%ifndef SQLITE_OMIT_SUBQUERY
seltablist(A) ::= stl_prefix(A) LP select(S) RP as(Z) on_using(N). {
  fromClausePush(state, A, { kind: "Select", select: S, alias: Z }, N);
}
seltablist(A) ::= stl_prefix(A) LP seltablist(F) RP as(Z) on_using(N). {
  fromClausePush(state, A, { kind: "Sub", from: freezeFrom(F), alias: Z }, N);
}
%endif  SQLITE_OMIT_SUBQUERY

%type fullname {QualifiedName}
fullname(A) ::= nm(X).               { A = qnSingle(X); }
fullname(A) ::= nm(X) DOT nm(Y).     { A = qnFull(X, Y); }

%type xfullname {QualifiedName}
xfullname(A) ::= nm(X).                       { A = qnSingle(X); }
xfullname(A) ::= nm(X) DOT nm(Y).             { A = qnFull(X, Y); }
xfullname(A) ::= nm(X) AS nm(Z).              { A = qnAlias(X, Z); }
xfullname(A) ::= nm(X) DOT nm(Y) AS nm(Z).    { A = qnXfull(X, Y, Z); }

%type joinop {JoinOperator}
joinop(X) ::= COMMA.                                { X = { kind: "Comma"                  }; }
joinop(X) ::= JOIN.                                 { X = { kind: "TypedJoin", joinType: undefined }; }
joinop(X) ::= JOIN_KW(A) JOIN.                      { X = joinOperatorFrom(state, A, undefined, undefined); }
joinop(X) ::= JOIN_KW(A) nm(B) JOIN.                { X = joinOperatorFrom(state, A, B, undefined); }
joinop(X) ::= JOIN_KW(A) nm(B) nm(C) JOIN.          { X = joinOperatorFrom(state, A, B, C); }

// There is a parsing ambiguity in an upsert statement that uses a
// SELECT on the RHS of a the INSERT: the ON token may introduce either
// an ON CONFLICT clause or an ON JOIN clause.  The [AND] and [OR]
// precedence marks here cause ON in this context to always belong to
// the JOIN.
//
%type on_using {JoinConstraint | undefined}
on_using(N) ::= ON expr(E).            { N = { kind: "On",    expr: E };    }
on_using(N) ::= USING LP idlist(L) RP. { N = { kind: "Using", columns: L }; }
on_using(N) ::= .                 [OR] { N = undefined; }

// INDEXED BY / NOT INDEXED.
//
%type indexed_opt {Indexed | undefined}
indexed_opt(A) ::= .                  { A = undefined; }
indexed_opt(A) ::= INDEXED BY nm(X).  { A = { kind: "IndexedBy", name: X }; }
indexed_opt(A) ::= NOT INDEXED.       { A = { kind: "NotIndexed" }; }

%type orderby_opt {SortedColumn[] | undefined}
%type sortlist    {SortedColumn[]}

orderby_opt(A) ::= .                          { A = undefined; }
orderby_opt(A) ::= ORDER BY sortlist(X).      { A = X; }
sortlist(A) ::= sortlist(A) COMMA expr(Y) sortorder(Z) nulls(X). {
  A.push({ expr: Y, order: Z, nulls: X });
}
sortlist(A) ::= expr(Y) sortorder(Z) nulls(X). {
  A = [{ expr: Y, order: Z, nulls: X }];
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
limit_opt(A) ::= LIMIT expr(X).                { A = { expr: X, offset: undefined }; }
limit_opt(A) ::= LIMIT expr(X) OFFSET expr(Y). { A = { expr: X, offset: Y    }; }
limit_opt(A) ::= LIMIT expr(X) COMMA expr(Y).  { A = { expr: Y, offset: X    }; }

/////////////////////////// The DELETE statement /////////////////////////////
//
%if SQLITE_ENABLE_UPDATE_DELETE_LIMIT || SQLITE_UDL_CAPABLE_PARSER
cmd ::= with(C) DELETE FROM xfullname(X) indexed_opt(I) where_opt_ret(W)
        orderby_opt(O) limit_opt(L). {
  state.stmt = {
    kind: "Delete",
    with: C, tblName: X, indexed: I,
    whereClause: W.where, returning: W.returning,
    orderBy: O, limit: L,
  };
}
%else
cmd ::= with(C) DELETE FROM xfullname(X) indexed_opt(I) where_opt_ret(W). {
  state.stmt = {
    kind: "Delete",
    with: C, tblName: X, indexed: I,
    whereClause: W.where, returning: W.returning,
    orderBy: undefined, limit: undefined,
  };
}
%endif

%type where_opt     {Expr | undefined}
%type where_opt_ret {{where: Expr | undefined, returning: ResultColumn[] | undefined}}

where_opt(A) ::= .                                       { A = undefined; }
where_opt(A) ::= WHERE expr(X).                          { A = X;    }
where_opt_ret(A) ::= .                                   { A = { where: undefined, returning: undefined }; }
where_opt_ret(A) ::= WHERE expr(X).                      { A = { where: X,    returning: undefined }; }
where_opt_ret(A) ::= RETURNING selcollist(X).            { A = { where: undefined, returning: X    }; }
where_opt_ret(A) ::= WHERE expr(X) RETURNING selcollist(Y).
                                                         { A = { where: X,    returning: Y    }; }

////////////////////////// The UPDATE command ////////////////////////////////
//
%if SQLITE_ENABLE_UPDATE_DELETE_LIMIT || SQLITE_UDL_CAPABLE_PARSER
cmd ::= with(C) UPDATE orconf(R) xfullname(X) indexed_opt(I) SET setlist(Y) from(F)
        where_opt_ret(W) orderby_opt(O) limit_opt(L). {
  state.stmt = {
    kind: "Update",
    with: C, orConflict: R, tblName: X, indexed: I, sets: Y, from: F,
    whereClause: W.where, returning: W.returning, orderBy: O, limit: L,
  };
}
%else
cmd ::= with(C) UPDATE orconf(R) xfullname(X) indexed_opt(I) SET setlist(Y) from(F)
        where_opt_ret(W). {
  state.stmt = {
    kind: "Update",
    with: C, orConflict: R, tblName: X, indexed: I, sets: Y, from: F,
    whereClause: W.where, returning: W.returning, orderBy: undefined, limit: undefined,
  };
}
%endif

%type setlist {Set_[]}
setlist(A) ::= setlist(A) COMMA nm(X) EQ expr(Y).           { A.push({ colNames: [X], expr: Y }); }
setlist(A) ::= setlist(A) COMMA LP idlist(X) RP EQ expr(Y). { A.push({ colNames: X,   expr: Y }); }
setlist(A) ::= nm(X) EQ expr(Y).                            { A = [{ colNames: [X], expr: Y }]; }
setlist(A) ::= LP idlist(X) RP EQ expr(Y).                  { A = [{ colNames: X,   expr: Y }]; }

////////////////////////// The INSERT command /////////////////////////////////
//
cmd ::= with(W) insert_cmd(R) INTO xfullname(X) idlist_opt(F) select(S) upsert(U). {
  state.stmt = {
    kind: "Insert",
    with: W, orConflict: R, tblName: X, columns: F,
    body: { kind: "Select", select: S, upsert: U.upsert },
    returning: U.returning,
  };
}
cmd ::= with(W) insert_cmd(R) INTO xfullname(X) idlist_opt(F) DEFAULT VALUES returning(Y). {
  state.stmt = {
    kind: "Insert",
    with: W, orConflict: R, tblName: X, columns: F,
    body: { kind: "DefaultValues" },
    returning: Y,
  };
}

%type upsert {{upsert: Upsert | undefined, returning: ResultColumn[] | undefined}}

upsert(A) ::= .                               { A = { upsert: undefined, returning: undefined }; }
upsert(A) ::= RETURNING selcollist(X).        { A = { upsert: undefined, returning: X };    }
upsert(A) ::= ON CONFLICT LP sortlist(T) RP where_opt(TW)
              DO UPDATE SET setlist(Z) where_opt(W) upsert(N). {
  const idx = mkUpsertIndex(state, T, TW);
  A = {
    upsert: { index: idx, doClause: { kind: "Set", sets: Z, whereClause: W }, next: N.upsert },
    returning: N.returning,
  };
}
upsert(A) ::= ON CONFLICT LP sortlist(T) RP where_opt(TW) DO NOTHING upsert(N). {
  const idx = mkUpsertIndex(state, T, TW);
  A = {
    upsert: { index: idx, doClause: { kind: "Nothing" }, next: N.upsert },
    returning: N.returning,
  };
}
upsert(A) ::= ON CONFLICT DO NOTHING returning(R). {
  A = { upsert: { index: undefined, doClause: { kind: "Nothing" }, next: undefined }, returning: R };
}
upsert(A) ::= ON CONFLICT DO UPDATE SET setlist(Z) where_opt(W) returning(R). {
  A = {
    upsert: { index: undefined, doClause: { kind: "Set", sets: Z, whereClause: W }, next: undefined },
    returning: R,
  };
}

%type returning {ResultColumn[] | undefined}
returning(A) ::= RETURNING selcollist(X). { A = X;    }
returning(A) ::= .                        { A = undefined; }

%type insert_cmd {ResolveType | undefined}
insert_cmd(A) ::= INSERT orconf(R).   { A = R; }
insert_cmd(A) ::= REPLACE.            { A = "Replace"; }

%type idlist_opt {DistinctNames | undefined}
%type idlist     {Name[]}
idlist_opt(A) ::= .                   { A = undefined; }
idlist_opt(A) ::= LP idlist(X) RP.    { A = X;    }
idlist(A) ::= idlist(A) COMMA nm(Y).  {
  if( A.some(n => n.name===Y.name) ){
    state.errors.push({ message: `column "${Y.name}" specified more than once` });
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
expr(A) ::= LP expr(X) RP.        { A = mkParenthesized(X); }
expr(A) ::= idj(X).               { A = mkIdExpr(X); }
expr(A) ::= nm(X) DOT nm(Y).      { A = { kind: "Qualified",        table: X, column: Y };               }
expr(A) ::= nm(X) DOT nm(Y) DOT nm(Z). {
  A = { kind: "DoublyQualified", schema: X, table: Y, column: Z };
}
term(A) ::= NULL(X).              { A = { kind: "Literal", literal: mkNullLiteral(X)    }; }
term(A) ::= BLOB(X).              { A = { kind: "Literal", literal: mkBlobLiteral(X)    }; }
term(A) ::= STRING(X).            { A = { kind: "Literal", literal: mkStringLiteral(X)  }; }
term(A) ::= FLOAT|INTEGER(X).     { A = { kind: "Literal", literal: mkNumericLiteral(X) }; }
expr(A) ::= VARIABLE(X).          { A = mkVariableExpr(X); }
expr(A) ::= expr(X) COLLATE ids(C). { A = mkCollate(X, C); }
%ifndef SQLITE_OMIT_CAST
expr(A) ::= CAST LP expr(E) AS typetoken(T) RP. { A = mkCast(E, T); }
%endif  SQLITE_OMIT_CAST

expr(A) ::= idj(X) LP distinct(D) exprlist(Y) RP. {
  A = mkFunctionCall(state, X, D, Y, undefined, undefined);
}
expr(A) ::= idj(X) LP distinct(D) exprlist(Y) ORDER BY sortlist(O) RP. {
  A = mkFunctionCall(state, X, D, Y, { kind: "SortList", columns: O }, undefined);
}
expr(A) ::= idj(X) LP STAR RP. { A = mkFunctionCallStar(X, undefined); }

%ifdef SQLITE_ENABLE_ORDERED_SET_AGGREGATES
expr(A) ::= idj(X) LP distinct(D) exprlist(Y) RP WITHIN GROUP LP ORDER BY expr(E) RP. {
  A = mkFunctionCall(state, X, D, Y, { kind: "WithinGroup", expr: E }, undefined);
}
%endif SQLITE_ENABLE_ORDERED_SET_AGGREGATES

%ifndef SQLITE_OMIT_WINDOWFUNC
expr(A) ::= idj(X) LP distinct(D) exprlist(Y) RP filter_over(Z). {
  A = mkFunctionCall(state, X, D, Y, undefined, Z);
}
expr(A) ::= idj(X) LP distinct(D) exprlist(Y) ORDER BY sortlist(O) RP filter_over(Z). {
  A = mkFunctionCall(state, X, D, Y, { kind: "SortList", columns: O }, Z);
}
expr(A) ::= idj(X) LP STAR RP filter_over(Z). { A = mkFunctionCallStar(X, Z); }
%ifdef SQLITE_ENABLE_ORDERED_SET_AGGREGATES
expr(A) ::= idj(X) LP distinct(D) exprlist(Y) RP WITHIN GROUP LP ORDER BY expr(E) RP filter_over(Z). {
  A = mkFunctionCall(state, X, D, Y, { kind: "WithinGroup", expr: E }, Z);
}
%endif SQLITE_ENABLE_ORDERED_SET_AGGREGATES
%endif SQLITE_OMIT_WINDOWFUNC

term(A) ::= CTIME_KW(OP). { A = { kind: "Literal", literal: literalFromCtimeKw(OP) }; }

expr(A) ::= LP nexprlist(X) COMMA expr(Y) RP. {
  A = { kind: "Parenthesized", exprs: [...X, Y] };
}

expr(A) ::= expr(X) AND(OP) expr(Y).    { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y); }
expr(A) ::= expr(X) OR(OP) expr(Y).     { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y); }
expr(A) ::= expr(X) LT|GT|GE|LE(OP) expr(Y).
                                        { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y); }
expr(A) ::= expr(X) EQ|NE(OP) expr(Y).  { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y); }
expr(A) ::= expr(X) BITAND|BITOR|LSHIFT|RSHIFT(OP) expr(Y).
                                        { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y); }
expr(A) ::= expr(X) PLUS|MINUS(OP) expr(Y).
                                        { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y); }
expr(A) ::= expr(X) STAR|SLASH|REM(OP) expr(Y).
                                        { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y); }
expr(A) ::= expr(X) CONCAT(OP) expr(Y). { A = mkBinary(X, binaryOperatorFromToken(OP.type, tokens), Y); }

%type likeop {{ not: boolean, op: LikeOperator }}
likeop(A) ::= LIKE_KW|MATCH(X).        { A = { not: false, op: likeOperatorFromToken(X, tokens) }; }
likeop(A) ::= NOT LIKE_KW|MATCH(X).    { A = { not: true,  op: likeOperatorFromToken(X, tokens) }; }
expr(A) ::= expr(X) likeop(OP) expr(Y).  [LIKE_KW] {
  A = mkLikeExpr(X, OP.not, OP.op, Y, undefined);
}
expr(A) ::= expr(X) likeop(OP) expr(Y) ESCAPE expr(E).  [LIKE_KW] {
  A = mkLikeExpr(X, OP.not, OP.op, Y, E);
}

expr(A) ::= expr(X) ISNULL|NOTNULL(E).  { A = mkNotNullExpr(X, E.type, tokens); }
expr(A) ::= expr(X) NOT NULL.           { A = { kind: "NotNull", expr: X }; }

//    expr1 IS expr2       same as    expr1 IS NOT DISTINCT FROM expr2
//    expr1 IS NOT expr2   same as    expr1 IS DISTINCT FROM expr2
//
expr(A) ::= expr(X) IS expr(Y).                 { A = mkBinary(X, "Is", Y); }
expr(A) ::= expr(X) IS NOT expr(Y).             { A = mkBinary(X, "IsNot", Y); }
expr(A) ::= expr(X) IS NOT DISTINCT FROM expr(Y). { A = mkBinary(X, "Is", Y); }
expr(A) ::= expr(X) IS DISTINCT FROM expr(Y).     { A = mkBinary(X, "IsNot", Y); }

expr(A) ::= NOT(B) expr(X).                    { A = mkUnary(unaryOperatorFromToken(B.type, tokens), X); }
expr(A) ::= BITNOT(B) expr(X).                 { A = mkUnary(unaryOperatorFromToken(B.type, tokens), X); }
expr(A) ::= PLUS|MINUS(B) expr(X). [BITNOT]    { A = mkUnary(unaryOperatorFromToken(B.type, tokens), X); }

expr(A) ::= expr(B) PTR(C) expr(D). { A = mkBinary(B, ptrOperatorFromToken(C), D); }

%type between_op {boolean}
between_op(A) ::= BETWEEN.          { A = false; }
between_op(A) ::= NOT BETWEEN.      { A = true;  }
expr(A) ::= expr(B) between_op(N) expr(X) AND expr(Y). [BETWEEN] {
  A = mkBetween(B, N, X, Y);
}

%ifndef SQLITE_OMIT_SUBQUERY
  %type in_op {boolean}
  in_op(A) ::= IN.       { A = false; }
  in_op(A) ::= NOT IN.   { A = true;  }
  expr(A) ::= expr(X) in_op(N) LP exprlist(Y) RP. [IN] { A = mkInList(X, N, Y); }
  expr(A) ::= LP select(X) RP.                         { A = mkSubquery(X); }
  expr(A) ::= expr(X) in_op(N) LP select(Y) RP.  [IN]  { A = mkInSelect(X, N, Y); }
  expr(A) ::= expr(X) in_op(N) fullname(Y) paren_exprlist(E). [IN] {
    A = mkInTable(X, N, Y, E);
  }
  expr(A) ::= EXISTS LP select(Y) RP.                  { A = mkExistsExpr(Y); }
%endif SQLITE_OMIT_SUBQUERY

/* CASE expressions */
expr(A) ::= CASE case_operand(X) case_exprlist(Y) case_else(Z) END. {
  A = { kind: "Case", base: X, whenThenPairs: Y, elseExpr: Z };
}
%type case_exprlist {{when: Expr, then: Expr}[]}
case_exprlist(A) ::= case_exprlist(A) WHEN expr(Y) THEN expr(Z). {
  A.push({ when: Y, then: Z });
}
case_exprlist(A) ::= WHEN expr(Y) THEN expr(Z). {
  A = [{ when: Y, then: Z }];
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
    kind: "CreateIndex",
    unique: U, ifNotExists: NE, idxName: X, tblName: Y, columns: Z, whereClause: W,
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
  A.push({ colName: Y, collationName: C, order: Z });
}
eidlist(A) ::= nm(Y) collate(C) sortorder(Z). {
  A = [{ colName: Y, collationName: C, order: Z }];
}

%type collate {Name | undefined}
collate(C) ::= .                 { C = undefined; }
collate(C) ::= COLLATE ids(X).   { C = mkName(X); }

///////////////////////////// The DROP INDEX command /////////////////////////
//
cmd ::= DROP INDEX ifexists(E) fullname(X). {
  state.stmt = { kind: "DropIndex", ifExists: E, idxName: X };
}

///////////////////////////// The VACUUM command /////////////////////////////
//
%if !SQLITE_OMIT_VACUUM && !SQLITE_OMIT_ATTACH
%type vinto {Expr | undefined}
cmd ::= VACUUM vinto(Y).                { state.stmt = { kind: "Vacuum", name: undefined, into: Y }; }
cmd ::= VACUUM nm(X) vinto(Y).          { state.stmt = { kind: "Vacuum", name: X,    into: Y }; }
vinto(A) ::= INTO expr(X).              { A = X;    }
vinto(A) ::= .                          { A = undefined; }
%endif

///////////////////////////// The PRAGMA command /////////////////////////////
//
%ifndef SQLITE_OMIT_PRAGMA
cmd ::= PRAGMA fullname(X).                  { state.stmt = { kind: "Pragma", name: X, body: undefined }; }
cmd ::= PRAGMA fullname(X) EQ nmnum(Y).      { state.stmt = { kind: "Pragma", name: X, body: { kind: "Equals", value: Y } }; }
cmd ::= PRAGMA fullname(X) LP nmnum(Y) RP.   { state.stmt = { kind: "Pragma", name: X, body: { kind: "Call",   value: Y } }; }
cmd ::= PRAGMA fullname(X) EQ minus_num(Y).  { state.stmt = { kind: "Pragma", name: X, body: { kind: "Equals", value: Y } }; }
cmd ::= PRAGMA fullname(X) LP minus_num(Y) RP. { state.stmt = { kind: "Pragma", name: X, body: { kind: "Call",   value: Y } }; }

%type nmnum {Expr}
nmnum(A) ::= plus_num(A).
nmnum(A) ::= nm(X).      { A = { kind: "Name", name: X }; }
nmnum(A) ::= ON(X).      { A = { kind: "Literal", literal: mkKeywordLiteral(X) }; }
nmnum(A) ::= DELETE(X).  { A = { kind: "Literal", literal: mkKeywordLiteral(X) }; }
nmnum(A) ::= DEFAULT(X). { A = { kind: "Literal", literal: mkKeywordLiteral(X) }; }
%endif SQLITE_OMIT_PRAGMA
%token_class number INTEGER|FLOAT.
%type plus_num  {Expr}
plus_num(A) ::= PLUS number(X). {
  A = mkUnary("Positive", { kind: "Literal", literal: mkNumericLiteral(X) });
}
plus_num(A) ::= number(X).      { A = { kind: "Literal", literal: mkNumericLiteral(X) }; }
%type minus_num {Expr}
minus_num(A) ::= MINUS number(X). {
  A = mkUnary("Negative", { kind: "Literal", literal: mkNumericLiteral(X) });
}

//////////////////////////// The CREATE TRIGGER command /////////////////////
%ifndef SQLITE_OMIT_TRIGGER
cmd ::= createkw temp(T) TRIGGER ifnotexists(NOERR) fullname(B) trigger_time(C) trigger_event(D)
        ON fullname(E) foreach_clause(X) when_clause(G) BEGIN trigger_cmd_list(S) END. {
  state.stmt = {
    kind: "CreateTrigger",
    temporary: T, ifNotExists: NOERR, triggerName: B, time: C, event: D, tblName: E,
    forEachRow: X, whenClause: G, commands: S,
  };
}

%type trigger_time {TriggerTime | undefined}
trigger_time(A) ::= BEFORE.     { A = "Before"; }
trigger_time(A) ::= AFTER.      { A = "After"; }
trigger_time(A) ::= INSTEAD OF. { A = "InsteadOf"; }
trigger_time(A) ::= .           { A = undefined; }

%type trigger_event {TriggerEvent}
trigger_event(A) ::= DELETE.              { A = { kind: "Delete" }; }
trigger_event(A) ::= INSERT.              { A = { kind: "Insert" }; }
trigger_event(A) ::= UPDATE.              { A = { kind: "Update" }; }
trigger_event(A) ::= UPDATE OF idlist(X). { A = { kind: "UpdateOf", columns: X }; }

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
  state.errors.push({
    message: "the INDEXED BY clause is not allowed on UPDATE or DELETE statements within triggers",
  });
}
tridxby ::= NOT INDEXED. {
  state.errors.push({
    message: "the NOT INDEXED clause is not allowed on UPDATE or DELETE statements within triggers",
  });
}

%type trigger_cmd {TriggerCmd}
// UPDATE
trigger_cmd(A) ::= UPDATE orconf(R) xfullname(X) tridxby SET setlist(Y) from(F) where_opt(Z). {
  A = { kind: "Update", orConflict: R, tblName: X, sets: Y, from: F, whereClause: Z };
}
// INSERT
trigger_cmd(A) ::= insert_cmd(R) INTO xfullname(X) idlist_opt(F) select(S) upsert(U). {
  if( U.returning ){
    state.errors.push({ message: "cannot use RETURNING in a trigger" });
  }
  A = {
    kind: "Insert",
    orConflict: R, tblName: X, colNames: F, select: S, upsert: U.upsert,
  };
}
// DELETE
trigger_cmd(A) ::= DELETE FROM xfullname(X) tridxby where_opt(Y). {
  A = { kind: "Delete", tblName: X, whereClause: Y };
}
// SELECT
trigger_cmd(A) ::= select(X). { A = { kind: "Select", select: X }; }

// The special RAISE expression that may occur in trigger programs
expr(A) ::= RAISE LP IGNORE RP. {
  A = { kind: "Raise", resolve: "Ignore", message: undefined };
}
expr(A) ::= RAISE LP raisetype(T) COMMA expr(Z) RP. {
  A = { kind: "Raise", resolve: T, message: Z };
}
%endif  !SQLITE_OMIT_TRIGGER

%type raisetype {ResolveType}
raisetype(A) ::= ROLLBACK.  { A = "Rollback"; }
raisetype(A) ::= ABORT.     { A = "Abort"; }
raisetype(A) ::= FAIL.      { A = "Fail"; }

////////////////////////  DROP TRIGGER statement //////////////////////////////
%ifndef SQLITE_OMIT_TRIGGER
cmd ::= DROP TRIGGER ifexists(NOERR) fullname(X). {
  state.stmt = { kind: "DropTrigger", ifExists: NOERR, triggerName: X };
}
%endif  !SQLITE_OMIT_TRIGGER

//////////////////////// ATTACH DATABASE file AS name /////////////////////////
%ifndef SQLITE_OMIT_ATTACH
cmd ::= ATTACH database_kw_opt expr(F) AS expr(D) key_opt(K). {
  state.stmt = { kind: "Attach", expr: F, dbName: D, key: K };
}
cmd ::= DETACH database_kw_opt expr(D). {
  state.stmt = { kind: "Detach", expr: D };
}

%type key_opt {Expr | undefined}
key_opt(A) ::= .                     { A = undefined; }
key_opt(A) ::= KEY expr(X).          { A = X;    }

database_kw_opt ::= DATABASE.
database_kw_opt ::= .
%endif SQLITE_OMIT_ATTACH

////////////////////////// REINDEX collation //////////////////////////////////
%ifndef SQLITE_OMIT_REINDEX
cmd ::= REINDEX.                { state.stmt = { kind: "Reindex", objName: undefined }; }
cmd ::= REINDEX fullname(X).    { state.stmt = { kind: "Reindex", objName: X    }; }
%endif  SQLITE_OMIT_REINDEX

/////////////////////////////////// ANALYZE ///////////////////////////////////
%ifndef SQLITE_OMIT_ANALYZE
cmd ::= ANALYZE.                { state.stmt = { kind: "Analyze", objName: undefined }; }
cmd ::= ANALYZE fullname(X).    { state.stmt = { kind: "Analyze", objName: X    }; }
%endif

//////////////////////// ALTER TABLE table ... ////////////////////////////////
%ifndef SQLITE_OMIT_ALTERTABLE
%ifndef SQLITE_OMIT_VIRTUALTABLE
cmd ::= ALTER TABLE fullname(X) RENAME TO nm(Z). {
  state.stmt = { kind: "AlterTable", tblName: X, body: { kind: "RenameTo", name: Z } };
}
cmd ::= ALTER TABLE fullname(X) ADD kwcolumn_opt nm(Y) typetoken(Z) carglist(C). {
  const cd = mkColumnDefinition(Y, Z, C);
  state.stmt = { kind: "AlterTable", tblName: X, body: { kind: "AddColumn", column: cd } };
}
cmd ::= ALTER TABLE fullname(X) DROP kwcolumn_opt nm(Y). {
  state.stmt = { kind: "AlterTable", tblName: X, body: { kind: "DropColumn", column: Y } };
}
cmd ::= ALTER TABLE fullname(X) RENAME kwcolumn_opt nm(Y) TO nm(Z). {
  state.stmt = { kind: "AlterTable", tblName: X, body: { kind: "RenameColumn", old: Y, new: Z } };
}
cmd ::= ALTER TABLE fullname(X) DROP CONSTRAINT nm(Y). {
  state.stmt = { kind: "AlterTable", tblName: X, body: { kind: "DropConstraint", name: Y } };
}
cmd ::= ALTER TABLE fullname(X) ALTER kwcolumn_opt nm(Y) DROP NOT NULL. {
  state.stmt = { kind: "AlterTable", tblName: X, body: { kind: "DropColumnNotNull", column: Y } };
}
cmd ::= ALTER TABLE fullname(X) ALTER kwcolumn_opt nm(Y) SET NOT NULL onconf(R). {
  state.stmt = { kind: "AlterTable", tblName: X, body: { kind: "SetColumnNotNull", column: Y, onConflict: R } };
}
cmd ::= ALTER TABLE fullname(X) ADD CONSTRAINT nm(Z) CHECK LP expr(E) RP onconf(R). {
  const constraint: TableConstraint = { kind: "Check", expr: E, conflictClause: R };
  state.stmt = {
    kind: "AlterTable", tblName: X,
    body: { kind: "AddConstraint", constraint: { name: Z, constraint } },
  };
}
cmd ::= ALTER TABLE fullname(X) ADD CHECK LP expr(E) RP onconf(R). {
  const constraint: TableConstraint = { kind: "Check", expr: E, conflictClause: R };
  state.stmt = {
    kind: "AlterTable", tblName: X,
    body: { kind: "AddConstraint", constraint: { name: undefined, constraint } },
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
  if( X.kind==="CreateVirtualTable" ){
    state.stmt = { ...X, args: state.vtabArgs.slice() };
  }else{
    state.stmt = X;
  }
  state.vtabArgs = [];
}
%type create_vtab {Stmt}
create_vtab(A) ::= createkw VIRTUAL TABLE ifnotexists(E) fullname(X) USING nm(Z). {
  A = { kind: "CreateVirtualTable", ifNotExists: E, tblName: X, moduleName: Z, args: undefined };
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
with(A) ::= WITH wqlist(W).             { A = { recursive: false, ctes: W }; }
with(A) ::= WITH RECURSIVE wqlist(W).   { A = { recursive: true,  ctes: W }; }

%type wqas {Materialized}
wqas(A)   ::= AS.                  { A = "Any"; }
wqas(A)   ::= AS MATERIALIZED.     { A = "Yes"; }
wqas(A)   ::= AS NOT MATERIALIZED. { A = "No"; }
wqitem(A) ::= nm(X) eidlist_opt(Y) wqas(M) LP select(Z) RP. {
  A = { tblName: X, columns: Y, materialized: M, select: Z };
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
windowdefn(A) ::= nm(X) AS LP window(Y) RP. { A = { name: X, window: Y }; }

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
  A = { base: undefined, partitionBy: X,    orderBy: Y,    frameClause: Z };
}
window(A) ::= nm(W) PARTITION BY nexprlist(X) orderby_opt(Y) frame_opt(Z). {
  A = { base: W,    partitionBy: X,    orderBy: Y,    frameClause: Z };
}
window(A) ::= ORDER BY sortlist(Y) frame_opt(Z). {
  A = { base: undefined, partitionBy: undefined, orderBy: Y,    frameClause: Z };
}
window(A) ::= nm(W) ORDER BY sortlist(Y) frame_opt(Z). {
  A = { base: W,    partitionBy: undefined, orderBy: Y,    frameClause: Z };
}
window(A) ::= frame_opt(Z). {
  A = { base: undefined, partitionBy: undefined, orderBy: undefined, frameClause: Z };
}
window(A) ::= nm(W) frame_opt(Z). {
  A = { base: W,    partitionBy: undefined, orderBy: undefined, frameClause: Z };
}

frame_opt(A) ::= .                             { A = undefined; }
frame_opt(A) ::= range_or_rows(X) frame_bound_s(Y) frame_exclude_opt(Z). {
  A = { mode: X, start: Y, end: undefined, exclude: Z };
}
frame_opt(A) ::= range_or_rows(X) BETWEEN frame_bound_s(Y) AND frame_bound_e(Z) frame_exclude_opt(W). {
  A = { mode: X, start: Y, end: Z,    exclude: W };
}

range_or_rows(A) ::= RANGE.   { A = "Range"; }
range_or_rows(A) ::= ROWS.    { A = "Rows"; }
range_or_rows(A) ::= GROUPS.  { A = "Groups"; }

frame_bound_s(A) ::= frame_bound(X).       { A = X; }
frame_bound_s(A) ::= UNBOUNDED PRECEDING.  { A = { kind: "UnboundedPreceding" }; }
frame_bound_e(A) ::= frame_bound(X).       { A = X; }
frame_bound_e(A) ::= UNBOUNDED FOLLOWING.  { A = { kind: "UnboundedFollowing" }; }

frame_bound(A) ::= expr(X) PRECEDING.     { A = { kind: "Preceding",  expr: X }; }
frame_bound(A) ::= CURRENT ROW.           { A = { kind: "CurrentRow" }; }
frame_bound(A) ::= expr(X) FOLLOWING.     { A = { kind: "Following",  expr: X }; }

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

filter_over(A) ::= filter_clause(F) over_clause(O). { A = { filterClause: F,    overClause: O    }; }
filter_over(A) ::= over_clause(O).                  { A = { filterClause: undefined, overClause: O    }; }
filter_over(A) ::= filter_clause(F).                { A = { filterClause: F,    overClause: undefined }; }

over_clause(A) ::= OVER LP window(Z) RP.  { A = { kind: "Window", window: Z }; }
over_clause(A) ::= OVER nm(Z).            { A = { kind: "Name",   name:   Z }; }

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
    state.errors.push({
      message: dq.error,
      start: X.span.offset,
      length: X.span.length,
    });
  }
  A = { kind: "Literal", literal: { kind: "Numeric", value: dq.text, span: X.span } };
}

/*
** The TK_SPACE, TK_COMMENT, and TK_ILLEGAL tokens must be the last three
** tokens.  The parser depends on this.  Those tokens are not used in any
** grammar rule.  They are only used by the tokenizer.  Declare them last
** so that they are guaranteed to be the last three.
*/
%token SPACE COMMENT ILLEGAL.
