/**
 * exportTable.js — "export the data displayed in the graph": the post-filter,
 * post-transform table behind the current chart, as CSV text or an .xlsx
 * workbook, plus config-JSON download/copy helpers.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module. ExcelJS is loaded via dynamic import for .xlsx only.
 *
 * Exports:
 *   displayTable(spec, loaded)  — the canonical rows/columns the chart is
 *                                 showing (shared with codebridge, so exported
 *                                 CSV + generated R/Stata always agree)
 *   toCsv(table)                — RFC-4180 CSV text (quotes, CRLF)
 *   toXlsxBlob(table)           — one-sheet workbook
 *   downloadBlob(blob, filename) / copyText(text) — shared download/copy
 *
 * Data sources:
 *   - the loaded chart data already in memory; no re-fetch
 */

/**
 * The filename codebridge and the CSV/XLSX exports agree on. Matches
 * `codebridge`'s `csvFilename` fallback (`<module>-<chartType>.csv`) so the
 * generated `read_csv(...)` / `import delimited ...` reference the same file a
 * user would download.
 */
function tableFilename(spec) {
  const module = spec?.module || "data";
  return `${module}-${spec?.chartType}.csv`;
}

/** Dimension-like roles render as text columns; measures/temporal as numbers. */
function column(name, type) {
  return { name, type };
}

/**
 * Flatten the loaded chart result into a rectangular { filename, columns, rows }
 * table. Column *names* come from the spec's bindings (the field names the user
 * chose); the row values come from the loaded series/records. Kept behaviorally
 * identical to what R/Stata code generation expects, so the exported CSV and the
 * generated code always describe the same table.
 */
export function displayTable(spec, loaded = {}) {
  const filename = tableFilename(spec);
  const bindings = spec?.bindings || {};

  // Line: one row per (series, period). series → text, x/y → number.
  if (spec?.chartType === "line") {
    const seriesName = bindings.series || "Series";
    const columns = [
      column(seriesName, "text"),
      column(bindings.x || "Period", "number"),
      column(bindings.y || "Value", "number"),
    ];
    const rows = [];
    for (const item of loaded.series || []) {
      const years = item.years || [];
      const values = item.values || [];
      for (let i = 0; i < years.length; i += 1) {
        rows.push([item.location ?? item.label ?? null, years[i] ?? null, values[i] ?? null]);
      }
    }
    return { filename, columns, rows };
  }

  // Matrix-shaped (heatmap + multi-series dot plot): flatten the {x,y,z} grid
  // to a long table — one row per (category, series) with its value.
  const matrix = loaded.series;
  if (
    (spec?.chartType === "heatmap" || spec?.chartType === "dotPlot") &&
    matrix &&
    !Array.isArray(matrix) &&
    Array.isArray(matrix.y)
  ) {
    const hasGroup =
      Array.isArray(matrix.groups) || Boolean(bindings.group);
    const columns = [
      column(bindings.y || "Category", "text"),
      ...(hasGroup ? [column(bindings.group || "Group", "text")] : []),
      column(bindings.x || "Series", "text"),
      column(bindings.color || "Value", "number"),
    ];
    const rows = [];
    (matrix.y || []).forEach((rowName, r) => {
      (matrix.x || []).forEach((colName, c) => {
        rows.push([
          rowName,
          ...(hasGroup ? [matrix.groups?.[r] ?? null] : []),
          colName,
          matrix.z?.[r]?.[c] ?? null,
        ]);
      });
    });
    return { filename, columns, rows };
  }

  const records = loaded.records || (Array.isArray(loaded.series) ? loaded.series : []);

  // Scatter/bubble: one row per unit, with x/y (and optional size) measures.
  if (spec?.chartType === "scatter" || spec?.chartType === "bubble") {
    const hasSize = records.some((r) => r.size != null) || Boolean(bindings.size);
    const columns = [
      column(bindings.unit || bindings.location || "Unit", "text"),
      column(bindings.x || "X", "number"),
      column(bindings.y || "Y", "number"),
      ...(hasSize ? [column(bindings.size || "Size", "number")] : []),
    ];
    const rows = records.map((r) => [
      r.location ?? r.category ?? null,
      r.x ?? null,
      r.y ?? null,
      ...(hasSize ? [r.size ?? null] : []),
    ]);
    return { filename, columns, rows };
  }

  // Range/slope/forest: one row per unit with its two endpoints (+ optional
  // center point/estimate and, for forest plots, a study weight).
  if (
    spec?.chartType === "dumbbell" ||
    spec?.chartType === "slope" ||
    spec?.chartType === "forest"
  ) {
    const hasPoint = Boolean(bindings.point) && records.some((r) => r.point != null);
    const hasWeight = Boolean(bindings.size) && records.some((r) => r.size != null);
    const hasGroup = records.some((r) => r.group != null) || Boolean(bindings.group);
    const columns = [
      column(bindings.category || bindings.unit || "Category", "text"),
      ...(hasGroup ? [column(bindings.group || "Group", "text")] : []),
      column(bindings.start || "Start", "number"),
      ...(hasPoint ? [column(bindings.point || "Point", "number")] : []),
      column(bindings.end || "End", "number"),
      ...(hasWeight ? [column(bindings.size || "Weight", "number")] : []),
    ];
    const rows = records.map((r) => [
      r.category ?? r.location ?? null,
      ...(hasGroup ? [r.group ?? null] : []),
      r.start ?? null,
      ...(hasPoint ? [r.point ?? null] : []),
      r.end ?? null,
      ...(hasWeight ? [r.size ?? null] : []),
    ]);
    return { filename, columns, rows };
  }

  // Category/bar (and any other record-shaped result): category (+ optional
  // group) → text, value → number.
  const hasGroup = records.some((r) => r.group != null) || Boolean(bindings.group);
  const columns = [
    column(bindings.category || bindings.x || "Category", "text"),
    ...(hasGroup ? [column(bindings.group || "Group", "text")] : []),
    column(bindings.y || bindings.value || "Value", "number"),
  ];
  const rows = records.map((r) => [
    r.category ?? r.location ?? null,
    ...(hasGroup ? [r.group ?? null] : []),
    r.value ?? null,
  ]);
  return { filename, columns, rows };
}

function inferredType(values) {
  return values.every((value) => value == null || typeof value === "number")
    ? "number"
    : "text";
}

function sourceContext(response = {}) {
  const entries = [];
  if (response.subset) entries.push(["Subset", response.subset]);
  if (response.source) entries.push(["Source", response.source]);
  if (response.permitType) entries.push(["Permit Type", response.permitType]);
  return {
    columns: entries.map(([name]) => column(name, "text")),
    values: entries.map(([, value]) => value),
  };
}

/**
 * The data as it *entered* the tool, before the chart narrowed it to the bound
 * roles: for bring-your-own-data the full imported table (every pasted/uploaded
 * column, original headers, all rows); for a module the widest source-like table
 * available from the loaded API response. This is the "View original data" side
 * of the View Data step — `displayTable` is the "data in the chart" side.
 * Returns null when no richer source than the chart table exists.
 */
export function originalTable(spec, loaded = {}) {
  const inline = spec?.data?.inline;
  if (inline?.columns?.length) {
    return {
      filename: "original-data.csv",
      columns: inline.columns.map((col) =>
        column(col.name, col.type === "number" ? "number" : "text"),
      ),
      rows: inline.rows || [],
    };
  }

  const response = loaded.response || {};
  const context = sourceContext(response);

  // Module line fetches return grouped series instead of flat records. Rebuild the
  // source-like Location × Period table so the View Data toggle changes the viewer
  // on the default module chart as well.
  if (Array.isArray(response.series) && response.series.length) {
    const periods = response.series.flatMap((item) => item.years || []);
    const valueName =
      response.parameter ||
      response.permitType ||
      spec?.bindings?.y ||
      "Value";
    const columns = [
      ...context.columns,
      column("Location", "text"),
      column("Period", inferredType(periods)),
      column(valueName, "number"),
    ];
    const rows = [];
    for (const item of response.series) {
      const itemPeriods = item.years || [];
      const values = item.values || [];
      for (let i = 0; i < itemPeriods.length; i += 1) {
        rows.push([
          ...context.values,
          item.location ?? item.label ?? null,
          itemPeriods[i] ?? null,
          values[i] ?? null,
        ]);
      }
    }
    return { filename: "original-data.csv", columns, rows };
  }

  // Module matrix fetches are Location × Period grids. Flatten them into the same
  // source-style long table instead of falling back to the chart display table.
  const matrix = response.matrix;
  if (matrix && Array.isArray(matrix.x) && Array.isArray(matrix.y)) {
    const valueName =
      response.parameter ||
      spec?.bindings?.color ||
      spec?.bindings?.y ||
      "Value";
    const columns = [
      ...context.columns,
      column("Location", "text"),
      column("Period", inferredType(matrix.x)),
      column(valueName, "number"),
    ];
    const rows = [];
    (matrix.y || []).forEach((location, rowIndex) => {
      (matrix.x || []).forEach((period, columnIndex) => {
        rows.push([
          ...context.values,
          location,
          period,
          matrix.z?.[rowIndex]?.[columnIndex] ?? null,
        ]);
      });
    });
    return { filename: "original-data.csv", columns, rows };
  }

  // Module fetch: reconstruct the widest table from the returned records (each
  // record is a flat object).
  const records = response.records;
  if (Array.isArray(records) && records.length) {
    const names = [];
    for (const record of records) {
      for (const key of Object.keys(record)) {
        if (!names.includes(key)) names.push(key);
      }
    }
    const columns = [
      ...context.columns,
      ...names.map((name) => {
        const numeric = records.every(
          (record) => record[name] == null || typeof record[name] === "number",
        );
        return column(name, numeric ? "number" : "text");
      }),
    ];
    const rows = records.map((record) => [
      ...context.values,
      ...names.map((name) => record[name] ?? null),
    ]);
    return { filename: "original-data.csv", columns, rows };
  }

  return null;
}

/** RFC-4180 field: quote when it contains a comma, quote, CR, or LF. */
function csvField(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * RFC-4180 CSV: header row from column names, CRLF line endings, quoted/escaped
 * fields, empty cell for null/undefined.
 */
export function toCsv(table) {
  const columns = table?.columns || [];
  const rows = table?.rows || [];
  const lines = [columns.map((col) => csvField(col.name)).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvField).join(","));
  }
  return lines.map((line) => `${line}\r\n`).join("");
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Excel worksheet names: max 31 chars, none of []:*?/\, and unique per workbook.
function safeSheetName(name, index, used) {
  const cleaned =
    String(name || `Chart ${index + 1}`)
      .replace(/[\\/?*[\]:]/g, " ")
      .trim()
      .slice(0, 31) || `Chart ${index + 1}`;
  let candidate = cleaned;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Multi-sheet .xlsx workbook — one worksheet per {name, table}. ExcelJS is
 * lazy-imported so it stays out of the bundle. Sheet names are sanitized and
 * de-duplicated to satisfy Excel's constraints.
 */
export async function tablesToXlsxBlob(sheets) {
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = ExcelJSModule.default || ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  const used = new Set();
  (sheets || []).forEach(({ name, table }, index) => {
    const sheet = workbook.addWorksheet(safeSheetName(name, index, used));
    sheet.addRow((table?.columns || []).map((col) => col.name));
    for (const row of table?.rows || []) {
      // ExcelJS treats null as an empty cell; map it so column alignment holds.
      sheet.addRow(row.map((cell) => (cell === null || cell === undefined ? null : cell)));
    }
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}

/** One-sheet .xlsx workbook (the single-chart case). */
export function toXlsxBlob(table) {
  return tablesToXlsxBlob([{ name: "Data", table }]);
}

/** Trigger a browser download of a Blob via a transient object URL. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Copy text to the clipboard; resolves undefined on success. */
export function copyText(text) {
  return navigator.clipboard.writeText(text).then(() => undefined);
}
