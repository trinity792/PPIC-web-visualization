/**
 * derivedColumns.js — safe formula evaluation for user-defined columns:
 * arithmetic, conditional logic, and text transforms over existing columns.
 * No eval/Function — a hand-rolled tokenizer + recursive-descent parser over
 * a whitelisted grammar.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Grammar: column references (a bare identifier matching a column name, or
 * `[Column Name]` bracket syntax for names containing spaces/punctuation),
 * numeric and single/double-quoted string literals, `+ - * / ( )`,
 * comparisons (`== != < <= > >=`), and the whitelisted function calls below.
 * An identifier that is not a known column name and not immediately followed
 * by `(` — or a call name not in the whitelist — fails to resolve as an
 * "unknown identifier" parse error; there is no other identifier-resolution
 * path, so `window`, `Function`, etc. can never resolve to anything.
 *
 * Exports:
 *   FORMULA_FUNCTIONS        — the whitelist: round, abs, min, max, trim,
 *                              upper, lower, concat, if
 *   compileFormula(text, columns) — { evaluate(row), referencedColumns } or
 *                              { error: { code:"FORMULA_PARSE_ERROR", message,
 *                              position } } (never throws on user input)
 *   addDerivedColumn(table, name, formula) — new table (immutably), with
 *                              per-row failures graded MALFORMED, never thrown
 *
 * Data sources:
 *   - none (pure functions)
 */

import { inferColumnType, parseNumber } from "./columnTypes";

export const FORMULA_FUNCTIONS = Object.freeze([
  "round",
  "abs",
  "min",
  "max",
  "trim",
  "upper",
  "lower",
  "concat",
  "if",
]);

const COMPARISON_OPS = new Set(["==", "!=", "<", "<=", ">", ">="]);
const TWO_CHAR_OPS = ["<=", ">=", "==", "!="];
const ONE_CHAR_OPS = new Set(["+", "-", "*", "/", "(", ")", ",", "<", ">"]);

class FormulaError extends Error {
  constructor(message, position) {
    super(message);
    this.position = position;
  }
}

/** Tokenize formula text into { type, value, position, bracketed? } tokens. */
function tokenize(text) {
  const tokens = [];
  const source = String(text ?? "");
  const n = source.length;
  let i = 0;

  while (i < n) {
    const ch = source[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i += 1;
      let value = "";
      while (i < n && source[i] !== quote) {
        value += source[i];
        i += 1;
      }
      if (i >= n) throw new FormulaError("Unterminated string literal.", start);
      i += 1; // closing quote
      tokens.push({ type: "STRING", value, position: start });
      continue;
    }

    if (ch === "[") {
      const start = i;
      i += 1;
      let value = "";
      while (i < n && source[i] !== "]") {
        value += source[i];
        i += 1;
      }
      if (i >= n) {
        throw new FormulaError("Unterminated column reference (missing ']').", start);
      }
      i += 1; // closing bracket
      tokens.push({ type: "IDENT", value: value.trim(), position: start, bracketed: true });
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] || ""))) {
      const start = i;
      let value = "";
      while (i < n && /[0-9.]/.test(source[i])) {
        value += source[i];
        i += 1;
      }
      tokens.push({ type: "NUMBER", value: Number(value), position: start });
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      let value = "";
      while (i < n && /[A-Za-z0-9_]/.test(source[i])) {
        value += source[i];
        i += 1;
      }
      tokens.push({ type: "IDENT", value, position: start, bracketed: false });
      continue;
    }

    const two = source.slice(i, i + 2);
    if (TWO_CHAR_OPS.includes(two)) {
      tokens.push({ type: "OP", value: two, position: i });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPS.has(ch)) {
      tokens.push({ type: "OP", value: ch, position: i });
      i += 1;
      continue;
    }

    throw new FormulaError(`Unexpected character "${ch}".`, i);
  }

  tokens.push({ type: "EOF", value: null, position: n });
  return tokens;
}

/** Recursive-descent parser over the tokenized formula. */
class Parser {
  constructor(tokens, columnNames) {
    this.tokens = tokens;
    this.pos = 0;
    this.columnNames = new Set(columnNames);
    this.referenced = new Set();
  }

  peek() {
    return this.tokens[this.pos];
  }

  next() {
    return this.tokens[this.pos++];
  }

  expectOp(value) {
    const token = this.peek();
    if (token.type !== "OP" || token.value !== value) {
      throw new FormulaError(
        `Expected "${value}" but found "${token.value ?? token.type}".`,
        token.position,
      );
    }
    return this.next();
  }

  expectEnd() {
    if (this.peek().type !== "EOF") {
      throw new FormulaError(`Unexpected "${this.peek().value}".`, this.peek().position);
    }
  }

  parseExpression() {
    return this.parseComparison();
  }

  parseComparison() {
    let node = this.parseAdditive();
    while (this.peek().type === "OP" && COMPARISON_OPS.has(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseAdditive();
      node = { kind: "binary", op, left: node, right };
    }
    return node;
  }

  parseAdditive() {
    let node = this.parseMultiplicative();
    while (this.peek().type === "OP" && ["+", "-"].includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseMultiplicative();
      node = { kind: "binary", op, left: node, right };
    }
    return node;
  }

  parseMultiplicative() {
    let node = this.parseUnary();
    while (this.peek().type === "OP" && ["*", "/"].includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseUnary();
      node = { kind: "binary", op, left: node, right };
    }
    return node;
  }

  parseUnary() {
    if (this.peek().type === "OP" && this.peek().value === "-") {
      this.next();
      return { kind: "negate", value: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.peek();

    if (token.type === "NUMBER") {
      this.next();
      return { kind: "number", value: token.value };
    }
    if (token.type === "STRING") {
      this.next();
      return { kind: "string", value: token.value };
    }
    if (token.type === "OP" && token.value === "(") {
      this.next();
      const node = this.parseExpression();
      this.expectOp(")");
      return node;
    }
    if (token.type === "IDENT") {
      this.next();
      const name = token.value;
      const isCall =
        !token.bracketed && this.peek().type === "OP" && this.peek().value === "(";
      if (isCall) {
        if (!FORMULA_FUNCTIONS.includes(name)) {
          throw new FormulaError(`Unknown function "${name}".`, token.position);
        }
        this.next(); // consume "("
        const args = [];
        if (!(this.peek().type === "OP" && this.peek().value === ")")) {
          args.push(this.parseExpression());
          while (this.peek().type === "OP" && this.peek().value === ",") {
            this.next();
            args.push(this.parseExpression());
          }
        }
        this.expectOp(")");
        return { kind: "call", name, args };
      }
      if (!this.columnNames.has(name)) {
        throw new FormulaError(`Unknown identifier "${name}".`, token.position);
      }
      this.referenced.add(name);
      return { kind: "column", name };
    }

    throw new FormulaError(
      `Unexpected token "${token.value ?? token.type}".`,
      token.position,
    );
  }
}

function toNumberOrNull(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return parseNumber(String(value));
}

function evaluateBinary(op, left, right) {
  if (COMPARISON_OPS.has(op)) {
    if (left == null || right == null) return false;
    switch (op) {
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case "<":
        return left < right;
      case "<=":
        return left <= right;
      case ">":
        return left > right;
      case ">=":
        return left >= right;
      default:
        return false;
    }
  }

  const a = toNumberOrNull(left);
  const b = toNumberOrNull(right);
  if (a === null || b === null) {
    throw new Error("Arithmetic on a non-numeric value.");
  }
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      // Division by zero → null, never Infinity/NaN.
      return b === 0 ? null : a / b;
    default:
      throw new Error(`Unknown operator "${op}".`);
  }
}

function evaluateCall(name, args) {
  switch (name) {
    case "round": {
      const [value, digits] = args;
      const number = toNumberOrNull(value);
      if (number === null) return null;
      const factor = 10 ** Number(toNumberOrNull(digits) ?? 0);
      return Math.round(number * factor) / factor;
    }
    case "abs": {
      const number = toNumberOrNull(args[0]);
      return number === null ? null : Math.abs(number);
    }
    case "min": {
      const numbers = args.map(toNumberOrNull);
      return numbers.some((n) => n === null) ? null : Math.min(...numbers);
    }
    case "max": {
      const numbers = args.map(toNumberOrNull);
      return numbers.some((n) => n === null) ? null : Math.max(...numbers);
    }
    case "trim":
      return args[0] == null ? "" : String(args[0]).trim();
    case "upper":
      return args[0] == null ? "" : String(args[0]).toUpperCase();
    case "lower":
      return args[0] == null ? "" : String(args[0]).toLowerCase();
    case "concat":
      return args.map((value) => (value == null ? "" : String(value))).join("");
    case "if": {
      const [condition, whenTrue, whenFalse] = args;
      return condition ? whenTrue : whenFalse;
    }
    default:
      // Unreachable: compile-time parsing already rejects unknown names.
      throw new Error(`Unknown function "${name}".`);
  }
}

function evaluateNode(node, row) {
  switch (node.kind) {
    case "number":
      return node.value;
    case "string":
      return node.value;
    case "column": {
      const raw = row?.[node.name];
      if (raw == null || raw === "") return null;
      const asNumber = parseNumber(String(raw));
      return asNumber !== null ? asNumber : raw;
    }
    case "negate": {
      const value = toNumberOrNull(evaluateNode(node.value, row));
      return value === null ? null : -value;
    }
    case "binary":
      return evaluateBinary(node.op, evaluateNode(node.left, row), evaluateNode(node.right, row));
    case "call":
      return evaluateCall(
        node.name,
        node.args.map((arg) => evaluateNode(arg, row)),
      );
    default:
      throw new Error(`Unknown AST node "${node.kind}".`);
  }
}

/**
 * Compile a formula against a list of columns (an array of names, or
 * `{ name }`-shaped column descriptors — either is accepted). Returns
 * `{ evaluate(row), referencedColumns }` on success, where `row` is a plain
 * object keyed by column name; on a bad formula, returns
 * `{ error: { code:"FORMULA_PARSE_ERROR", message, position } }` — this
 * function never throws on user input.
 */
export function compileFormula(text, columns = []) {
  const columnNames = columns.map((column) => (typeof column === "string" ? column : column?.name));
  try {
    const tokens = tokenize(text);
    const parser = new Parser(tokens, columnNames);
    const ast = parser.parseExpression();
    parser.expectEnd();
    return {
      evaluate: (row) => evaluateNode(ast, row),
      referencedColumns: [...parser.referenced],
    };
  } catch (cause) {
    if (cause instanceof FormulaError) {
      return {
        error: { code: "FORMULA_PARSE_ERROR", message: cause.message, position: cause.position },
      };
    }
    throw cause;
  }
}

/**
 * Add a derived column to a table immutably, returning the new table
 * (never the original table object, on success). Assumes `formula` already
 * compiles — callers should check `compileFormula` first to show
 * FORMULA_PARSE_ERROR inline under the formula input; if it doesn't compile
 * anyway, this is a defensive no-op that returns `table` unchanged. Each
 * row's formula runs in its own try/catch — a runtime failure (e.g. `trim()`
 * on a value that isn't a column) marks that row's cell null and records a
 * `table.issues` entry so tableChecker.gradeTable grades it MALFORMED; other
 * rows are unaffected. Never throws.
 *
 * @returns {Object} the next table (or the original table on a compile failure)
 */
export function addDerivedColumn(table, name, formula) {
  const compiled = compileFormula(formula, table?.columns || []);
  if (compiled.error) {
    return table;
  }

  const columns = table.columns || [];
  const rows = table.rows || [];
  const newColumnIndex = columns.length;
  const failures = [];
  const rawValues = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const record = {};
    columns.forEach((column, columnIndex) => {
      record[column.name] = rows[rowIndex][columnIndex];
    });
    try {
      const result = compiled.evaluate(record);
      rawValues.push(result === null || result === undefined ? "" : String(result));
    } catch {
      failures.push(rowIndex);
      rawValues.push("");
    }
  }

  const successfulValues = rawValues.filter((_, index) => !failures.includes(index));
  const inferredType = inferColumnType(successfulValues).type;

  const nextRows = rows.map((row, rowIndex) => [...row, rawValues[rowIndex]]);
  const nextIssues = [
    ...(table.issues || []),
    ...failures.map((rowIndex) => ({
      row: rowIndex,
      column: newColumnIndex,
      code: "FORMULA_ROW_FAILED",
      message: `The formula for "${name}" could not be evaluated for this row.`,
    })),
  ];

  return {
    ...table,
    columns: [...columns, { name, type: inferredType, formula }],
    rows: nextRows,
    issues: nextIssues,
  };
}
