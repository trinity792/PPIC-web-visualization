/**
 * formulas.js — per-cell, Excel-style formulas over an inline table (import
 * overhaul, phase 1).
 *
 * A formula cell's text lives in `table.formulas` ({ "row:col": "=B2*2" },
 * zero-based data row and column), and its computed value is written into
 * `table.rows`, so every reader of the table (profiling, ranking, charts)
 * sees ordinary values and never needs to know a formula was there.
 *
 * Addresses follow the spreadsheet the reader pasted from: row 1 is the
 * header, so the first data row is row 2. A formula can use cells (`B2`,
 * `$B$2`), ranges (`B2:D2`, `C:C`), a header name in brackets for the same
 * row's cell (`[Share]`), numbers, text in quotes, `+ - * / ^ &`,
 * comparisons (`= <> < <= > >=`, and `== !=`), and the functions below.
 * Errors are values, as in a spreadsheet: `#REF!` (a cell that does not
 * exist), `#VALUE!` (arithmetic on text), `#DIV/0!`, `#CYCLE!` (a cell that
 * depends on itself), `#NAME?` (a word that names no column), and `#ERROR!`
 * (a formula that does not parse). A bare word that matches a header (`Jobs`)
 * reads the same row's cell, as `[Jobs]` does.
 *
 * Like derivedColumns.js, this never evaluates JavaScript: a hand-written
 * tokenizer and recursive-descent parser over a whitelisted grammar.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   FORMULA_FUNCTION_NAMES             — the whitelist
 *   columnLetters(index)               — 0 → "A", 26 → "AA"
 *   cellAddress(row, col)              — data row 0, column 0 → "A2"
 *   isFormula(text)                    — whether cell text starts a formula
 *   isFormulaError(value)              — whether a computed value is an error
 *   recalculate(table)                 — the table with every formula's value written in
 *   fillFormula(formula, from, to)     — a formula copied to another cell
 *   retargetFormula(formula, moves)   — references following cut cells
 *   shiftFormulas(table, edit)         — the formulas map after a row or column edit,
 *                                        including a move or sort (a permutation)
 *   renameFormulaColumn(formulas, from, to) — header-name references renamed
 *
 * Data sources:
 *   - lib/tabular/columnTypes.js (reading cell numbers in each column's convention)
 */

import { cellToken, columnParseOptions, parseNumber } from "./columnTypes";

export const FORMULA_FUNCTION_NAMES = Object.freeze([
  "SUM", "AVERAGE", "COUNT", "MEDIAN", "MIN", "MAX", "SHARE",
  "ROUND", "ABS", "IF", "CONCAT", "TRIM", "UPPER", "LOWER",
]);

const ERRORS = Object.freeze({
  REF: "#REF!",
  VALUE: "#VALUE!",
  DIV: "#DIV/0!",
  CYCLE: "#CYCLE!",
  NAME: "#NAME?",
  PARSE: "#ERROR!",
});

/** Whether a computed cell value is one of the formula engine's errors. */
export function isFormulaError(value) {
  return Object.values(ERRORS).includes(value);
}

// Data rows sit one below the header: data row 0 is spreadsheet row 2.
const FIRST_DATA_ROW = 2;

class FormulaError extends Error {}

/** A spreadsheet error carried as a value. */
const error = (code) => ({ error: code });
const isError = (value) => value !== null && typeof value === "object" && "error" in value;

// ── Addresses ────────────────────────────────────────────────────────

export function columnLetters(index) {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function columnIndexOf(letters) {
  return letters.toUpperCase().split("").reduce((total, letter) => total * 26 + (letter.charCodeAt(0) - 64), 0) - 1;
}

export function cellAddress(row, col) {
  return `${columnLetters(col)}${row + FIRST_DATA_ROW}`;
}

export function isFormula(text) {
  return typeof text === "string" && text.trim().startsWith("=") && text.trim().length > 1;
}

// ── Tokens ───────────────────────────────────────────────────────────

const CELL_RE = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]+)/;
const COLUMN_RE = /^(\$?)([A-Za-z]{1,3})(?=\s*:)/;
const OPERATORS = ["<>", "<=", ">=", "==", "!=", "+", "-", "*", "/", "^", "&", "=", "<", ">", "(", ")", ",", ":"];

/**
 * Tokens with their text spans, so references can be rewritten in place.
 * A cell token is { type: "cell", col, row, colAbs, rowAbs } with zero-based
 * column and spreadsheet row; a whole-column token { type: "column", col, colAbs }.
 */
function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const ch = source[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = source.indexOf(ch, i + 1);
      if (end < 0) throw new FormulaError("Unterminated text.");
      tokens.push({ type: "string", value: source.slice(i + 1, end), start: i, end: end + 1 });
      i = end + 1;
      continue;
    }
    if (ch === "[") {
      const end = source.indexOf("]", i + 1);
      if (end < 0) throw new FormulaError("Unterminated column name.");
      tokens.push({ type: "name", value: source.slice(i + 1, end).trim(), start: i, end: end + 1 });
      i = end + 1;
      continue;
    }
    if (rest.startsWith("#REF!")) {
      tokens.push({ type: "ref-error", start: i, end: i + 5 });
      i += 5;
      continue;
    }
    if (/[0-9.]/.test(ch) && /^[0-9]*\.?[0-9]+|^[0-9]+/.test(rest)) {
      const match = /^[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/.exec(rest) || /^[0-9]+/.exec(rest);
      tokens.push({ type: "number", value: Number(match[0]), start: i, end: i + match[0].length });
      i += match[0].length;
      continue;
    }
    let match = CELL_RE.exec(rest);
    if (match && !/^[A-Za-z0-9_(]/.test(rest.slice(match[0].length))) {
      tokens.push({
        type: "cell",
        colAbs: Boolean(match[1]),
        col: columnIndexOf(match[2]),
        rowAbs: Boolean(match[3]),
        row: Number(match[4]),
        start: i,
        end: i + match[0].length,
      });
      i += match[0].length;
      continue;
    }
    // The closing column of a whole-column range ("C:C"): letters right after
    // a colon that follows a column.
    const previous = tokens.at(-1);
    const afterColumnColon =
      previous?.type === "op" && previous.value === ":" && tokens.at(-2)?.type === "column";
    match = afterColumnColon
      ? /^(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(])/.exec(rest)
      : COLUMN_RE.exec(rest);
    if (match) {
      tokens.push({ type: "column", colAbs: Boolean(match[1]), col: columnIndexOf(match[2]), start: i, end: i + match[0].length });
      i += match[0].length;
      continue;
    }
    match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (match) {
      tokens.push({ type: "ident", value: match[0], start: i, end: i + match[0].length });
      i += match[0].length;
      continue;
    }
    const op = OPERATORS.find((candidate) => rest.startsWith(candidate));
    if (op) {
      tokens.push({ type: "op", value: op, start: i, end: i + op.length });
      i += op.length;
      continue;
    }
    throw new FormulaError(`Unexpected character "${ch}".`);
  }
  tokens.push({ type: "end", start: source.length, end: source.length });
  return tokens;
}

// ── Parser ───────────────────────────────────────────────────────────

const COMPARISONS = new Set(["=", "==", "<>", "!=", "<", "<=", ">", ">="]);

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (value) => peek().type === "op" && peek().value === value;
  const expect = (value) => {
    if (!isOp(value)) throw new FormulaError(`Expected "${value}".`);
    pos += 1;
  };

  function comparison() {
    let node = concatenation();
    while (peek().type === "op" && COMPARISONS.has(peek().value)) {
      const op = tokens[pos++].value;
      node = { kind: "binary", op, left: node, right: concatenation() };
    }
    return node;
  }
  function concatenation() {
    let node = additive();
    while (isOp("&")) {
      pos += 1;
      node = { kind: "binary", op: "&", left: node, right: additive() };
    }
    return node;
  }
  function additive() {
    let node = multiplicative();
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].value;
      node = { kind: "binary", op, left: node, right: multiplicative() };
    }
    return node;
  }
  function multiplicative() {
    let node = power();
    while (isOp("*") || isOp("/")) {
      const op = tokens[pos++].value;
      node = { kind: "binary", op, left: node, right: power() };
    }
    return node;
  }
  function power() {
    let node = unary();
    while (isOp("^")) {
      pos += 1;
      node = { kind: "binary", op: "^", left: node, right: unary() };
    }
    return node;
  }
  function unary() {
    if (isOp("-")) {
      pos += 1;
      return { kind: "negate", value: unary() };
    }
    if (isOp("+")) {
      pos += 1;
      return unary();
    }
    return primary();
  }
  function reference() {
    const token = tokens[pos++];
    if (isOp(":")) {
      pos += 1;
      const to = tokens[pos++];
      if (to.type !== token.type || (to.type !== "cell" && to.type !== "column")) {
        throw new FormulaError("A range joins two cells or two columns.");
      }
      return { kind: "range", from: token, to };
    }
    if (token.type === "column") throw new FormulaError("A column needs a range, like C:C.");
    return { kind: "cell", ref: token };
  }
  function primary() {
    const token = peek();
    if (token.type === "number") {
      pos += 1;
      return { kind: "value", value: token.value };
    }
    if (token.type === "string") {
      pos += 1;
      return { kind: "value", value: token.value };
    }
    if (token.type === "ref-error") {
      pos += 1;
      return { kind: "value", value: error(ERRORS.REF) };
    }
    if (token.type === "name") {
      pos += 1;
      return { kind: "name", name: token.value };
    }
    if (token.type === "cell" || token.type === "column") return reference();
    if (isOp("(")) {
      pos += 1;
      const node = comparison();
      expect(")");
      return node;
    }
    if (token.type === "ident") {
      pos += 1;
      const upper = token.value.toUpperCase();
      if (upper === "TRUE" || upper === "FALSE") return { kind: "value", value: upper === "TRUE" };
      // A bare word that is not a call names a column of the same row, as
      // `[Name]` does; an unknown one is #NAME? when evaluated.
      if (!isOp("(")) return { kind: "name", name: token.value, bare: true };
      if (!FORMULA_FUNCTION_NAMES.includes(upper)) throw new FormulaError(`Unknown function "${token.value}".`);
      pos += 1;
      const args = [];
      if (!isOp(")")) {
        args.push(comparison());
        while (isOp(",")) {
          pos += 1;
          args.push(comparison());
        }
      }
      expect(")");
      return { kind: "call", name: upper, args };
    }
    throw new FormulaError("Unexpected end of formula.");
  }

  const ast = comparison();
  if (peek().type !== "end") throw new FormulaError("Unexpected text after the formula.");
  return ast;
}

const parsed = new Map();
/** A formula's syntax tree, or a parse error; cached by text. */
function compile(formula) {
  if (!parsed.has(formula)) {
    try {
      parsed.set(formula, { ast: parse(tokenize(String(formula).trim().replace(/^=/, ""))) });
    } catch (cause) {
      if (!(cause instanceof FormulaError)) throw cause;
      parsed.set(formula, { error: cause.message });
    }
  }
  return parsed.get(formula);
}

// ── Evaluation ───────────────────────────────────────────────────────

function toNumber(value) {
  if (isError(value)) return value;
  if (value === null || value === "") return 0;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const number = parseNumber(String(value));
  return number === null ? error(ERRORS.VALUE) : number;
}

function arithmetic(op, left, right) {
  const a = toNumber(left);
  if (isError(a)) return a;
  const b = toNumber(right);
  if (isError(b)) return b;
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return b === 0 ? error(ERRORS.DIV) : a / b;
    case "^": return a ** b;
    default: return error(ERRORS.VALUE);
  }
}

function compare(op, left, right) {
  if (isError(left)) return left;
  if (isError(right)) return right;
  const a = typeof left === "string" && parseNumber(left) !== null ? parseNumber(left) : left;
  const b = typeof right === "string" && parseNumber(right) !== null ? parseNumber(right) : right;
  switch (op) {
    case "=": case "==": return a === b;
    case "<>": case "!=": return a !== b;
    case "<": return a < b;
    case "<=": return a <= b;
    case ">": return a > b;
    case ">=": return a >= b;
    default: return false;
  }
}

const text = (value) => (value === null ? "" : typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value));

/** The numbers in a list of argument values (ranges flattened), or the first error. */
function numbersIn(values) {
  const numbers = [];
  for (const value of values.flat()) {
    if (isError(value)) return value;
    if (value === null || value === "") continue;
    const number = typeof value === "number" ? value : parseNumber(String(value));
    if (number !== null) numbers.push(number);
  }
  return numbers;
}

function call(name, args) {
  const firstError = args.flat().find(isError);
  switch (name) {
    case "SUM": case "AVERAGE": case "COUNT": case "MEDIAN": case "MIN": case "MAX": {
      const numbers = numbersIn(args);
      if (isError(numbers)) return numbers;
      if (name === "COUNT") return numbers.length;
      if (name === "SUM") return numbers.reduce((total, n) => total + n, 0);
      if (!numbers.length) return name === "AVERAGE" ? error(ERRORS.DIV) : 0;
      if (name === "AVERAGE") return numbers.reduce((total, n) => total + n, 0) / numbers.length;
      if (name === "MIN") return Math.min(...numbers);
      if (name === "MAX") return Math.max(...numbers);
      const sorted = [...numbers].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }
    case "SHARE": {
      const value = toNumber(Array.isArray(args[0]) ? error(ERRORS.VALUE) : args[0]);
      if (isError(value)) return value;
      const total = numbersIn(args.slice(1));
      if (isError(total)) return total;
      const sum = total.reduce((acc, n) => acc + n, 0);
      return sum === 0 ? error(ERRORS.DIV) : (value / sum) * 100;
    }
    case "ROUND": {
      const value = toNumber(args[0]);
      const digits = toNumber(args[1] ?? 0);
      if (isError(value)) return value;
      if (isError(digits)) return digits;
      const factor = 10 ** digits;
      return Math.round(value * factor) / factor;
    }
    case "ABS": {
      const value = toNumber(args[0]);
      return isError(value) ? value : Math.abs(value);
    }
    case "IF": {
      const [condition, whenTrue = true, whenFalse = false] = args;
      if (isError(condition)) return condition;
      return condition ? whenTrue : whenFalse;
    }
    case "CONCAT":
      return firstError || args.flat().map(text).join("");
    case "TRIM":
      return firstError || text(args[0]).trim();
    case "UPPER":
      return firstError || text(args[0]).toUpperCase();
    case "LOWER":
      return firstError || text(args[0]).toLowerCase();
    default:
      return error(ERRORS.PARSE);
  }
}

/** A plain cell's value: a number in its column's convention, text, or null. */
function cellValue(raw, column) {
  if (raw === null || raw === undefined || cellToken(raw)) return null;
  const number = parseNumber(raw, columnParseOptions(column).locale);
  return number === null ? String(raw) : number;
}

/** A computed value as cell text, numbers in the column's own convention. */
function cellText(value, column) {
  if (isError(value)) return value.error;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return ERRORS.VALUE;
    const plain = String(Number(value.toPrecision(12)));
    return columnParseOptions(column).locale === "eu" ? plain.replace(".", ",") : plain;
  }
  return text(value);
}

const key = (row, col) => `${row}:${col}`;

/**
 * The table with every formula cell's value written into `rows`. Formulas
 * are evaluated in dependency order; a cell on a cycle is `#CYCLE!`. A table
 * without formulas is returned as it is.
 */
export function recalculate(table) {
  const formulas = table?.formulas || {};
  const keys = Object.keys(formulas);
  if (!keys.length) return table;

  const columns = table.columns || [];
  const rows = (table.rows || []).map((row) => [...row]);
  const nameIndex = new Map(columns.map((column, index) => [column.name, index]));
  const values = new Map();
  const visiting = new Set();

  function valueAt(row, col) {
    // Spreadsheet row 1 is the header: its cells are the column names.
    if (row === -1) return col >= 0 && col < columns.length ? columns[col].name : error(ERRORS.REF);
    if (row < 0 || col < 0 || row >= rows.length || col >= columns.length) return error(ERRORS.REF);
    const formulaKey = key(row, col);
    if (formulas[formulaKey] === undefined) return cellValue(rows[row][col], columns[col]);
    if (values.has(formulaKey)) return values.get(formulaKey);
    if (visiting.has(formulaKey)) return error(ERRORS.CYCLE);
    visiting.add(formulaKey);
    const compiled = compile(formulas[formulaKey]);
    const result = compiled.error ? error(ERRORS.PARSE) : evaluate(compiled.ast, row);
    visiting.delete(formulaKey);
    values.set(formulaKey, result);
    return result;
  }

  function rangeValues(node) {
    const { from, to } = node;
    const cols = [Math.min(from.col, to.col), Math.max(from.col, to.col)];
    const spreadsheetRows = from.type === "column"
      ? [FIRST_DATA_ROW, rows.length + FIRST_DATA_ROW - 1]
      : [Math.min(from.row, to.row), Math.max(from.row, to.row)];
    const out = [];
    for (let r = spreadsheetRows[0]; r <= spreadsheetRows[1]; r += 1) {
      for (let c = cols[0]; c <= cols[1]; c += 1) out.push(valueAt(r - FIRST_DATA_ROW, c));
    }
    return out;
  }

  function evaluate(node, row) {
    switch (node.kind) {
      case "value":
        return node.value;
      case "cell":
        return valueAt(node.ref.row - FIRST_DATA_ROW, node.ref.col);
      case "name":
        if (nameIndex.has(node.name)) return valueAt(row, nameIndex.get(node.name));
        return error(node.bare ? ERRORS.NAME : ERRORS.REF);
      case "range":
        return rangeValues(node);
      case "negate": {
        const value = toNumber(evaluate(node.value, row));
        return isError(value) ? value : -value;
      }
      case "binary": {
        const left = evaluate(node.left, row);
        const right = evaluate(node.right, row);
        if (Array.isArray(left) || Array.isArray(right)) return error(ERRORS.VALUE);
        if (node.op === "&") return isError(left) ? left : isError(right) ? right : text(left) + text(right);
        if (COMPARISONS.has(node.op)) return compare(node.op, left, right);
        return arithmetic(node.op, left, right);
      }
      case "call":
        return call(node.name, node.args.map((arg) => evaluate(arg, row)));
      default:
        return error(ERRORS.PARSE);
    }
  }

  for (const formulaKey of keys) {
    const [row, col] = formulaKey.split(":").map(Number);
    if (row >= rows.length || col >= columns.length) continue;
    rows[row][col] = cellText(valueAt(row, col), columns[col]);
  }
  return { ...table, rows };
}

// ── Rewriting references ─────────────────────────────────────────────

/**
 * A range's two ends with the top-left first, as an edit that moves them
 * apart (a sort, a move) can swap them. Each coordinate keeps its `$`.
 */
function ordered(from, to) {
  if (!from || !to) return [from, to];
  const a = { ...from };
  const b = { ...to };
  if (a.col > b.col) {
    [a.col, b.col] = [b.col, a.col];
    [a.colAbs, b.colAbs] = [b.colAbs, a.colAbs];
  }
  if (a.type === "cell" && b.type === "cell" && a.row > b.row) {
    [a.row, b.row] = [b.row, a.row];
    [a.rowAbs, b.rowAbs] = [b.rowAbs, a.rowAbs];
  }
  return [a, b];
}

/**
 * A formula with each cell and column reference passed through `map`, which
 * returns the new reference, or null when the reference no longer exists
 * (written `#REF!`). A whole range with a lost end becomes `#REF!`.
 * Header-name references pass through `mapName` when given.
 */
function rewrite(formula, map, mapName) {
  const source = String(formula);
  const offset = source.indexOf("=") + 1;
  let tokens;
  try {
    tokens = tokenize(source.slice(offset));
  } catch {
    return formula;
  }
  const write = (ref) => {
    if (!ref) return "#REF!";
    const col = `${ref.colAbs ? "$" : ""}${columnLetters(ref.col)}`;
    return ref.type === "column" ? col : `${col}${ref.rowAbs ? "$" : ""}${ref.row}`;
  };
  let out = source.slice(0, offset);
  let cursor = 0;
  const body = source.slice(offset);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "cell" || token.type === "column") {
      out += body.slice(cursor, token.start);
      const isRange = tokens[index + 1]?.type === "op" && tokens[index + 1].value === ":";
      if (isRange) {
        const to = tokens[index + 2];
        const [from, end] = ordered(map(token), map(to));
        out += from && end ? `${write(from)}:${write(end)}` : "#REF!";
        cursor = to.end;
        index += 2;
      } else {
        out += write(map(token));
        cursor = token.end;
      }
    } else if (token.type === "name" && mapName) {
      out += body.slice(cursor, token.start) + `[${mapName(token.value)}]`;
      cursor = token.end;
    }
  }
  return out + body.slice(cursor);
}

/**
 * A formula copied from one cell to another, as a fill does: relative parts
 * of each reference move by the distance between the cells, `$` parts stay.
 * A reference moved off the sheet becomes `#REF!`.
 */
export function fillFormula(formula, from, to) {
  const rows = to.row - from.row;
  const cols = to.col - from.col;
  return rewrite(formula, (ref) => {
    const next = {
      ...ref,
      col: ref.colAbs ? ref.col : ref.col + cols,
      ...(ref.type === "cell" ? { row: ref.rowAbs ? ref.row : ref.row + rows } : {}),
    };
    if (next.col < 0 || (next.type === "cell" && next.row < 1)) return null;
    return next;
  });
}

/**
 * Retarget references after a cut. `moves` maps "gridRow:column" source
 * addresses to {row, col} destinations. Anchored references follow the moved
 * cells too; unrelated references and quoted text stay as written.
 */
export function retargetFormula(formula, moves) {
  return rewrite(formula, (ref) => {
    if (ref.type !== "cell") return ref;
    const target = moves.get(`${ref.row - 1}:${ref.col}`);
    return target ? { ...ref, row: target.row + 1, col: target.col } : ref;
  });
}

/**
 * The formulas map after rows or columns are reordered (a move or a sort):
 * `order[newIndex] = oldIndex`. Each formula moves to its new cell and every
 * reference follows the cell it points at; a range takes its ends' new
 * places, so ends that move apart widen it, as in a spreadsheet. Positions
 * outside `order` stay where they are.
 */
function permuteFormulas(formulas, { type, order }) {
  const newIndexOf = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  const place = (index) => (newIndexOf.has(index) ? newIndexOf.get(index) : index);
  const byRow = type === "permuteRows";
  const next = {};
  for (const [formulaKey, formula] of Object.entries(formulas)) {
    const [row, col] = formulaKey.split(":").map(Number);
    const cellKey = byRow ? key(place(row), col) : key(row, place(col));
    next[cellKey] = rewrite(formula, (ref) => {
      if (!byRow) return { ...ref, col: place(ref.col) };
      if (ref.type === "column" || ref.row < FIRST_DATA_ROW) return ref;
      return { ...ref, row: place(ref.row - FIRST_DATA_ROW) + FIRST_DATA_ROW };
    });
  }
  return next;
}

/**
 * The formulas map after a structural edit: { type: "insertRow" | "deleteRow"
 * | "insertColumn" | "deleteColumn", at }, or { type: "permuteRows" |
 * "permuteColumns", order } for a move or sort (see `permuteFormulas`).
 * Formulas move with their cells, references move with the cells they point
 * at (anchored or not, as in a spreadsheet), a reference to a deleted cell
 * becomes `#REF!`, and a formula whose own cell is deleted is dropped.
 */
export function shiftFormulas(table, edit) {
  const formulas = table?.formulas || {};
  if (edit.type === "permuteRows" || edit.type === "permuteColumns") return permuteFormulas(formulas, edit);
  const { type, at } = edit;
  const isRow = type === "insertRow" || type === "deleteRow";
  const inserting = type === "insertRow" || type === "insertColumn";
  // Positions as zero-based data rows and columns.
  const move = (position) => {
    if (position < at) return position;
    if (inserting) return position + 1;
    return position === at ? null : position - 1;
  };
  const next = {};
  for (const [formulaKey, formula] of Object.entries(formulas)) {
    const [row, col] = formulaKey.split(":").map(Number);
    const newRow = isRow ? move(row) : row;
    const newCol = isRow ? col : move(col);
    if (newRow === null || newCol === null) continue;
    next[key(newRow, newCol)] = rewrite(formula, (ref) => {
      if (isRow) {
        if (ref.type === "column") return ref;
        const dataRow = ref.row - FIRST_DATA_ROW;
        if (dataRow < 0) return ref;
        const moved = move(dataRow);
        return moved === null ? null : { ...ref, row: moved + FIRST_DATA_ROW };
      }
      const moved = move(ref.col);
      return moved === null ? null : { ...ref, col: moved };
    });
  }
  return next;
}

/** Formulas with every `[from]` header-name reference renamed to `[to]`. */
export function renameFormulaColumn(formulas = {}, from, to) {
  return Object.fromEntries(
    Object.entries(formulas).map(([formulaKey, formula]) => [
      formulaKey,
      rewrite(formula, (ref) => ref, (name) => (name === from ? to : name)),
    ]),
  );
}
