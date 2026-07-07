/**
 * parseTable.js — turn pasted text or an uploaded file into the editor's
 * inline-table shape { columns:[{name,type}], rows, issues }.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module. Heavy parsers (papaparse, ExcelJS) are loaded via
 * dynamic import so they never enter the main bundle.
 *
 * Inline-table row shape (documented once, here, as the single source of
 * truth — tableChecker.js, derivedColumns.js, and toSeries.js all agree with
 * it): `rows` is an array of arrays of raw CELL STRINGS, one array per data
 * row, index-aligned to `columns` (the "raw grid" option from the plan, not
 * row objects) — this is what `chartSpec.js`'s own inline-shape validation
 * already assumes (`row.length !== columnCount`), so this module keeps that
 * contract rather than introducing a second shape. The header row is NOT
 * included in `rows` — it is consumed into `columns[].name` at parse time;
 * `InputTableEditor`'s "header row toggle" re-derives column names from the
 * first data row (and vice versa) rather than the table carrying a separate
 * "is this row a header" flag.
 *
 * Exports:
 *   parsePaste(text)             — clipboard TSV/CSV sniffing (Excel/Sheets
 *                                  paste is TSV) → inline table
 *   parseFile(file)              — CSV/TSV/TXT via papaparse (worker mode for
 *                                  >1 MB); XLSX via ExcelJS; extension+MIME
 *                                  dispatch, named errors. Legacy XLS/ODS/DBF
 *                                  are rejected with a named UNSUPPORTED_FORMAT
 *                                  error naming the deferral (v1 scope)
 *   detectHeaderRow(rows)        — heuristic + user-overridable header flag
 *   MAX_FILE_BYTES               — hard cap (named error beyond)
 *
 * Both `parsePaste` and `parseFile` return `{ value, errors }` (never throw
 * on user input) — `value` is `null` on failure, and `errors` is an array of
 * standard findings (`{ ok:false, level:"error", code, message }`), matching
 * how `chartSpec.parseSpec` surfaces errors elsewhere in the editor.
 *
 * Data sources:
 *   - user clipboard / user-selected local files only; nothing is fetched
 *     and nothing is uploaded to any server
 */

import { inferColumnType } from "./columnTypes";

/** Hard cap on an uploaded file's size (Part 8's default: 20 MB). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

// Papaparse worker mode past this size (Part 8: "Papaparse worker mode for
// files > 1 MB").
const WORKER_THRESHOLD_BYTES = 1_000_000;

const LEGACY_EXTENSIONS = new Set(["xls", "ods", "dbf"]);
const DELIMITED_EXTENSIONS = new Set(["csv", "tsv", "txt"]);
const SPREADSHEET_EXTENSIONS = new Set(["xlsx"]);

function extensionOf(name = "") {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

function tableError(code, message) {
  return { ok: false, level: "error", code, message };
}

/**
 * Heuristic (user-overridable in the UI) guess at whether a raw grid's first
 * row is a header: compare each column's first-row cell against the type of
 * the rest of that column's values. A column is "header-like" when its first
 * cell is text but the column's body is not (e.g. "Population" atop a column
 * of numbers). Returns `0` (row 0 is the header) when at least half of the
 * comparable columns look header-like, or `-1` (no header row — column names
 * are synthesized) otherwise. A single-row grid always returns `0`.
 */
export function detectHeaderRow(rows) {
  if (!rows || rows.length <= 1) return 0;

  const first = rows[0];
  const sample = rows.slice(1, Math.min(rows.length, 21));
  const columnCount = Math.max(first.length, ...sample.map((row) => row.length));

  let headerLikeColumns = 0;
  let comparedColumns = 0;
  for (let c = 0; c < columnCount; c += 1) {
    const bodyValues = sample
      .map((row) => row[c])
      .filter((value) => value != null && String(value).trim() !== "");
    if (!bodyValues.length) continue;
    comparedColumns += 1;
    const bodyType = inferColumnType(bodyValues).type;
    const headerType = inferColumnType([first[c]]).type;
    if (headerType === "text" && bodyType !== "text") headerLikeColumns += 1;
  }

  if (!comparedColumns) return 0;
  return headerLikeColumns / comparedColumns >= 0.5 ? 0 : -1;
}

/** Build the inline-table shape from a raw 2D grid of cell strings. */
function buildTable(rawRows, headerRowIndex) {
  if (!rawRows || !rawRows.length) return { columns: [], rows: [], issues: [] };

  const hasHeader = headerRowIndex != null && headerRowIndex >= 0;
  const header = hasHeader ? rawRows[headerRowIndex] || [] : [];
  const dataRows = hasHeader
    ? rawRows.filter((_, index) => index !== headerRowIndex)
    : rawRows;
  const width = Math.max(header.length, 1, ...dataRows.map((row) => row.length));

  const columns = Array.from({ length: width }, (_, columnIndex) => {
    const name = String(header[columnIndex] ?? "").trim() || `Column ${columnIndex + 1}`;
    const values = dataRows.map((row) => row[columnIndex] ?? "");
    return { name, type: inferColumnType(values).type };
  });

  const rows = dataRows.map((row) =>
    Array.from({ length: width }, (_, columnIndex) => String(row[columnIndex] ?? "")),
  );

  return { columns, rows, issues: [] };
}

/**
 * Clipboard sniffing: an Excel/Google Sheets copy is tab-delimited; a manual
 * paste of CSV-shaped text is comma-delimited. Sniffed from the first
 * non-blank line's tab vs. comma count (ties favor TSV, the more common
 * spreadsheet-copy case).
 */
export async function parsePaste(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return { value: null, errors: [tableError("TABLE_PARSE_FAILED", "Nothing to parse — the paste was empty.")] };
  }

  const firstLine =
    text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .find((line) => line.length > 0) || "";
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount >= commaCount ? "\t" : ",";

  try {
    const Papa = (await import("papaparse")).default;
    const result = Papa.parse(text, { delimiter, skipEmptyLines: true });
    const rawRows = result.data || [];
    if (!rawRows.length) {
      return { value: null, errors: [tableError("TABLE_PARSE_FAILED", "Nothing to parse — the paste was empty.")] };
    }
    return { value: buildTable(rawRows, detectHeaderRow(rawRows)), errors: [] };
  } catch (cause) {
    return {
      value: null,
      errors: [tableError("TABLE_PARSE_FAILED", `The pasted text could not be parsed: ${cause.message}`)],
    };
  }
}

function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text ?? "");
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  }
  return String(value);
}

async function parseXlsxFile(file) {
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook has no sheets.");

  const rawRows = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cellText(cell.value));
    });
    rawRows.push(cells);
  });
  return buildTable(rawRows, detectHeaderRow(rawRows));
}

async function parseDelimitedFile(file) {
  const Papa = (await import("papaparse")).default;
  const text = await file.text();
  const useWorker = file.size > WORKER_THRESHOLD_BYTES && typeof Worker !== "undefined";

  const rawRows = await new Promise((resolve, reject) => {
    Papa.parse(text, {
      skipEmptyLines: true,
      worker: useWorker,
      complete: (result) => resolve(result.data || []),
      error: (error) => reject(error),
    });
  });
  return buildTable(rawRows, detectHeaderRow(rawRows));
}

/**
 * CSV/TSV/TXT via papaparse (worker mode for files > 1 MB); XLSX via
 * ExcelJS. Dispatch is by file extension first, falling back to MIME type
 * for delimited text. Legacy spreadsheet formats (`.xls`, `.ods`, `.dbf`) are
 * rejected by name with `UNSUPPORTED_FORMAT`, naming the v1 deferral (see
 * the plan's *Additional Libraries* — ExcelJS covers `.xlsx`/`.csv` only).
 */
export async function parseFile(file) {
  if (!file) {
    return { value: null, errors: [tableError("TABLE_PARSE_FAILED", "No file was provided.")] };
  }
  if (file.size > MAX_FILE_BYTES) {
    const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
    return {
      value: null,
      errors: [
        tableError(
          "TABLE_TOO_LARGE",
          `"${file.name}" is ${mb(file.size)} MB, over the ${mb(MAX_FILE_BYTES)} MB limit.`,
        ),
      ],
    };
  }

  const extension = extensionOf(file.name);
  if (LEGACY_EXTENSIONS.has(extension)) {
    return {
      value: null,
      errors: [
        tableError(
          "UNSUPPORTED_FORMAT",
          `".${extension}" files aren't supported yet — legacy XLS/ODS/DBF formats are deferred from v1. Use CSV, TSV, TXT, or XLSX instead.`,
        ),
      ],
    };
  }

  try {
    if (SPREADSHEET_EXTENSIONS.has(extension)) {
      return { value: await parseXlsxFile(file), errors: [] };
    }
    if (
      DELIMITED_EXTENSIONS.has(extension) ||
      file.type?.includes("csv") ||
      file.type?.includes("text")
    ) {
      return { value: await parseDelimitedFile(file), errors: [] };
    }
    return {
      value: null,
      errors: [
        tableError(
          "UNSUPPORTED_FORMAT",
          `Unrecognized file type "${extension ? `.${extension}` : "unknown"}". Use CSV, TSV, TXT, or XLSX.`,
        ),
      ],
    };
  } catch (cause) {
    return {
      value: null,
      errors: [tableError("TABLE_PARSE_FAILED", `"${file.name}" could not be read: ${cause.message}`)],
    };
  }
}
