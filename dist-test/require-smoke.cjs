"use strict";

const pkg = require("sqlite3-parser");
const { cst, errors } = pkg.parse("SELECT 1");

process.stdout.write(JSON.stringify({
  errors: errors.length,
  cst: cst && cst.name,
  lib: pkg.SQLITE_LIB,
  version: pkg.SQLITE_VERSION,
}));
