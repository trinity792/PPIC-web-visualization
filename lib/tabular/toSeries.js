/**
 * toSeries.js — shape an inline table into the exact series/record shapes the
 * server query layer returns ({location, years[], values[]}, category
 * records, pairs, matrix), so `toPlotly` and the transform registry work
 * identically for module data and user data.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module. It is the client-side mirror of
 * `lib/data/query_shapes.js` and must be kept behaviorally aligned with it
 * (shared fixture tests enforce this) — concretely, it converts the inline
 * table's bound columns into the same `{Location, Year, <parameter>}`-style
 * row objects `lib/data/query_shapes.js`'s builders consume, then calls
 * those exact builders (imported directly, not reimplemented), so the output
 * is byte-identical by construction rather than merely similar.
 *
 * Query-shape dispatch mirrors `components/chart-builder/chartData.js`'s
 * QUERY_SHAPES table (chartType → line|category|twoPeriod|pairs|matrix|geo).
 * That map is duplicated here rather than imported, to avoid a lib → components
 * import cycle (chartData.js imports `buildShapes` for the inline data path).
 *
 * Binding → column resolution (documented once, here):
 *   - line       → location column: `bindings.series`, else `bindings.color`
 *                  (falls back to a single implied "Series" location when
 *                  neither is bound); years: `bindings.x`; values: `bindings.y`.
 *   - category   → category/location: `bindings.category`; value: `bindings.y`.
 *                  Bar has no temporal binding role (chartRegistry.CHART_TYPES.bar),
 *                  so every row is treated as one implied period (0) — this
 *                  makes `buildCategoryValues`'s period filter a no-op rather
 *                  than guessing which inline column (if any) is a year.
 *   - twoPeriod  → category: `bindings.category`; the two endpoints come from
 *                  TWO DIFFERENT columns (`bindings.start`, `bindings.end`) —
 *                  unlike the module API (one column fetched at two Year
 *                  values), an inline table naturally has one column per
 *                  period. `spec.period.startYear`/`endYear` (default 0/1)
 *                  become synthetic Year tags so `buildTwoPeriod` can join them.
 *   - pairs      → unit/location: `bindings.unit`; x: `bindings.x`; y: `bindings.y`;
 *                  size: `bindings.size` (optional). One implied period (0).
 *   - matrix     → y/location: `bindings.y`; x/period: `bindings.x` (numeric
 *                  when possible, else the raw label); color/value: `bindings.color`.
 *   - geo        → location: `bindings.geography`; value: `bindings.color`;
 *                  optional year: `bindings.period`. There is no GEOID
 *                  crosswalk for inline data, so `unmatched` is always `[]` —
 *                  the choropleth simply renders without a join to fail.
 *
 * Exports:
 *   applyTabFilter(table, filters) — filter inline rows to one tab value
 *   tabValues(table, column, order) — distinct nonblank tab values
 *   buildShapes(table, spec)   — dispatch on the spec's query shape; returns
 *                                the same response body shape the matching
 *                                module API view returns (e.g. `{series,
 *                                yearRange}` for line, `{records}` for
 *                                category/twoPeriod/pairs/geo, `{matrix,
 *                                yearRange}` for heatmap)
 *   supportedShapes(table)     — which chart families the table can feed,
 *                                used to gray out chart types in the sidebar
 *
 * Data sources:
 *   - the inline table in the spec (`spec.data.inline`); no network access
 */

import {
  buildCategoryValues,
  buildLineSeries,
  buildMatrix,
  buildMeasurePairs,
  buildTwoPeriod,
} from "@/lib/data/query_shapes";

import { COLUMN_TYPES, parseNumber } from "./columnTypes";

// Mirrors components/chart-builder/chartData.js's QUERY_SHAPES (see module
// docstring above for why this is duplicated rather than imported).
const QUERY_SHAPES = Object.freeze({
  line: "line",
  bar: "category",
  divergingBar: "category",
  pie: "category",
  dumbbell: "twoPeriod",
  slope: "twoPeriod",
  forest: "twoPeriod",
  scatter: "pairs",
  bubble: "pairs",
  heatmap: "matrix",
  dotPlot: "matrix",
  choroplethMap: "geo",
});

function columnIndex(table, name) {
  if (!name) return -1;
  return (table?.columns || []).findIndex((column) => column.name === name);
}

/** Cell value as a number when it parses; otherwise null (blank included). */
function numberCell(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  return parseNumber(String(raw));
}

/** Cell value as a trimmed string; blanks become null. */
function textCell(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  return String(raw).trim();
}

/** Distinct nonblank values in first-seen order, optionally rearranged by a
 * persisted user order. Values are strings because GraphTabs and the stored
 * active value share this exact representation. */
export function tabValues(table, columnName, savedOrder = []) {
  const index = columnIndex(table, columnName);
  if (index === -1) return [];
  const firstSeen = [];
  const seen = new Set();
  for (const row of table?.rows || []) {
    const value = textCell(row?.[index]);
    if (value == null || seen.has(value)) continue;
    seen.add(value);
    firstSeen.push(value);
  }
  const ordered = [];
  const used = new Set();
  for (const raw of savedOrder || []) {
    const value = textCell(raw);
    if (value == null || !seen.has(value) || used.has(value)) continue;
    used.add(value);
    ordered.push(value);
  }
  return [...ordered, ...firstSeen.filter((value) => !used.has(value))];
}

/** Filter a table to the active GraphTab slice. A disabled/missing tab column
 * or null active value is a no-op; a stale non-null value intentionally yields
 * zero rows so the preview's existing empty state can explain the slice. */
export function applyTabFilter(table, filters = {}) {
  const columnName = filters?.tabColumn;
  const active = textCell(filters?.tabValue);
  const index = columnIndex(table, columnName);
  if (!table || index === -1 || active == null) return table;
  return {
    ...table,
    rows: (table.rows || []).filter((row) => textCell(row?.[index]) === active),
  };
}

/** Add optional per-category attributes without changing the ungrouped module
 * shape. Attribute queues preserve repeated category rows (e.g. one per color
 * series) after the canonical category builder sorts them. */
function categoryAttributes(table, bindings) {
  const categoryIndex = columnIndex(table, bindings.category);
  const valueIndex = columnIndex(table, bindings.y);
  const groupIndex = columnIndex(table, bindings.group);
  const colorIndex = columnIndex(table, bindings.color);
  if (groupIndex === -1 && colorIndex === -1) return null;

  const byRecord = new Map();
  const groupOrder = new Map();
  for (const row of table.rows || []) {
    const category = textCell(row[categoryIndex]) ?? "";
    const value = numberCell(row[valueIndex]);
    const group = groupIndex === -1 ? null : textCell(row[groupIndex]);
    const color = colorIndex === -1 ? null : textCell(row[colorIndex]);
    if (groupIndex !== -1 && !groupOrder.has(group)) groupOrder.set(group, groupOrder.size);
    const key = `${category}\u0000${String(value)}`;
    if (!byRecord.has(key)) byRecord.set(key, []);
    byRecord.get(key).push({ group, color });
  }
  return { byRecord, groupIndex, colorIndex, groupOrder };
}

function attachCategoryAttributes(records, attributes) {
  if (!attributes) return records;
  const offsets = new Map();
  const tagged = records.map((record) => {
    const category = record.category ?? record.location ?? "";
    const key = `${category}\u0000${String(record.value)}`;
    const offset = offsets.get(key) || 0;
    const values = attributes.byRecord.get(key) || [];
    const attribute = values[offset] || values.at(-1) || {};
    offsets.set(key, offset + 1);
    return {
      ...record,
      ...(attributes.groupIndex !== -1 ? { group: attribute.group } : {}),
      ...(attributes.colorIndex !== -1 ? { color: attribute.color } : {}),
    };
  });
  if (attributes.groupIndex === -1) return tagged;
  // The canonical builder already applied the chart's value/name sort. Grouping
  // that ordered list by first-seen group therefore preserves the sort inside
  // each block while restoring the source table's block order.
  return tagged
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
      const aRank = attributes.groupOrder.get(a.record.group) ?? Infinity;
      const bRank = attributes.groupOrder.get(b.record.group) ?? Infinity;
      return aRank - bRank || a.index - b.index;
    })
    .map(({ record }) => record);
}

function buildLineShape(table, spec) {
  const bindings = spec.bindings || {};
  const xIndex = columnIndex(table, bindings.x);
  const yIndex = columnIndex(table, bindings.y);
  const locationName = bindings.series || bindings.color;
  const locationIndex = columnIndex(table, locationName);

  const rows = (table.rows || []).map((row) => ({
    Location: locationIndex === -1 ? "Series" : textCell(row[locationIndex]) ?? "Series",
    Year: numberCell(row[xIndex]),
    value: numberCell(row[yIndex]),
  }));

  const fallbackRange = [spec.period?.startYear ?? null, spec.period?.endYear ?? null];
  return buildLineSeries(rows, "value", fallbackRange);
}

// Bar has no temporal binding role — see module docstring.
const IMPLIED_PERIOD = 0;

function buildCategoryShape(table, spec) {
  const bindings = spec.bindings || {};
  const categoryIndex = columnIndex(table, bindings.category);
  const yIndex = columnIndex(table, bindings.y);

  const rows = (table.rows || []).map((row) => ({
    Location: textCell(row[categoryIndex]) ?? "",
    Year: IMPLIED_PERIOD,
    value: numberCell(row[yIndex]),
  }));

  const result = buildCategoryValues(rows, "value", {
    period: IMPLIED_PERIOD,
    topN: spec.filters?.topN || null,
    sort: spec.appearance?.sort || "value",
  });
  const attributes = categoryAttributes(table, bindings);
  if (attributes) result.records = attachCategoryAttributes(result.records, attributes);
  return result;
}

function buildTwoPeriodShape(table, spec) {
  const bindings = spec.bindings || {};
  const categoryIndex = columnIndex(table, bindings.category);
  const startIndex = columnIndex(table, bindings.start);
  const endIndex = columnIndex(table, bindings.end);
  const pointIndex = bindings.point ? columnIndex(table, bindings.point) : -1;
  const sizeIndex = bindings.size ? columnIndex(table, bindings.size) : -1;
  const groupIndex = bindings.group ? columnIndex(table, bindings.group) : -1;
  const startYear = spec.period?.startYear ?? 0;
  const endYear = spec.period?.endYear ?? 1;

  const rows = [];
  const pointByCategory = new Map();
  const sizeByCategory = new Map();
  const groupByCategory = new Map();
  const groupOrder = new Map();
  for (const row of table.rows || []) {
    const location = textCell(row[categoryIndex]) ?? "";
    rows.push({ Location: location, Year: startYear, value: numberCell(row[startIndex]) });
    rows.push({ Location: location, Year: endYear, value: numberCell(row[endIndex]) });
    if (pointIndex !== -1) pointByCategory.set(location, numberCell(row[pointIndex]));
    if (sizeIndex !== -1) sizeByCategory.set(location, numberCell(row[sizeIndex]));
    if (groupIndex !== -1) {
      const group = textCell(row[groupIndex]);
      groupByCategory.set(location, group);
      if (!groupOrder.has(group)) groupOrder.set(group, groupOrder.size);
    }
  }

  const result = buildTwoPeriod(rows, "value", { startYear, endYear });
  // Carry the optional center point (the estimate inside a CI) and study weight
  // (Forest plot marker size) per category alongside the two endpoints.
  if (pointIndex !== -1 || sizeIndex !== -1 || groupIndex !== -1) {
    result.records = result.records.map((record) => ({
      ...record,
      ...(pointIndex !== -1 ? { point: pointByCategory.get(record.category) ?? null } : {}),
      ...(sizeIndex !== -1 ? { size: sizeByCategory.get(record.category) ?? null } : {}),
      ...(groupIndex !== -1 ? { group: groupByCategory.get(record.category) ?? null } : {}),
    }));
  }
  if (groupIndex !== -1) {
    result.records = result.records
      .map((record, index) => ({ record, index }))
      .sort((a, b) => {
        const aRank = groupOrder.get(a.record.group) ?? Infinity;
        const bRank = groupOrder.get(b.record.group) ?? Infinity;
        return aRank - bRank || a.index - b.index;
      })
      .map(({ record }) => record);
  }
  return result;
}

function buildPairsShape(table, spec) {
  const bindings = spec.bindings || {};
  const unitIndex = columnIndex(table, bindings.unit);
  const xIndex = columnIndex(table, bindings.x);
  const yIndex = columnIndex(table, bindings.y);
  const sizeIndex = columnIndex(table, bindings.size);

  const rows = (table.rows || []).map((row, index) => ({
    Location: unitIndex === -1 ? `Row ${index + 1}` : textCell(row[unitIndex]) ?? `Row ${index + 1}`,
    Year: IMPLIED_PERIOD,
    x: numberCell(row[xIndex]),
    y: numberCell(row[yIndex]),
    ...(sizeIndex !== -1 ? { size: numberCell(row[sizeIndex]) } : {}),
  }));

  return buildMeasurePairs(rows, {
    xMeasure: "x",
    yMeasure: "y",
    sizeMeasure: sizeIndex !== -1 ? "size" : null,
    period: IMPLIED_PERIOD,
  });
}

function buildMatrixShape(table, spec) {
  const bindings = spec.bindings || {};
  const xIndex = columnIndex(table, bindings.x);
  const yIndex = columnIndex(table, bindings.y);
  const colorIndex = columnIndex(table, bindings.color);
  const groupIndex = columnIndex(table, bindings.group);
  const groupByCategory = new Map();
  const groupOrder = new Map();

  const rows = (table.rows || []).map((row) => {
    const location = textCell(row[yIndex]) ?? "";
    if (groupIndex !== -1) {
      const group = textCell(row[groupIndex]);
      groupByCategory.set(location, group);
      if (!groupOrder.has(group)) groupOrder.set(group, groupOrder.size);
    }
    return {
      Location: location,
      Year: numberCell(row[xIndex]) ?? textCell(row[xIndex]),
      value: numberCell(row[colorIndex]),
    };
  });

  const result = buildMatrix(rows, "value");
  if (groupIndex === -1) return result;
  const indexed = result.matrix.y.map((category, index) => ({
    category,
    values: result.matrix.z[index],
    group: groupByCategory.get(category) ?? null,
    index,
  }));
  indexed.sort((a, b) => {
    const aRank = groupOrder.get(a.group) ?? Infinity;
    const bRank = groupOrder.get(b.group) ?? Infinity;
    return aRank - bRank || a.index - b.index;
  });
  result.matrix = {
    ...result.matrix,
    y: indexed.map((row) => row.category),
    z: indexed.map((row) => row.values),
    groups: indexed.map((row) => row.group),
  };
  return result;
}

/** Inline data has no GEOID crosswalk to join against — `unmatched` is
 * always `[]` (there is no join to fail, unlike the module geoValues view). */
function buildGeoShape(table, spec) {
  const bindings = spec.bindings || {};
  const geographyIndex = columnIndex(table, bindings.geography);
  const colorIndex = columnIndex(table, bindings.color);
  const periodIndex = columnIndex(table, bindings.period);

  const records = (table.rows || []).map((row) => ({
    location: textCell(row[geographyIndex]) ?? "",
    value: numberCell(row[colorIndex]),
    ...(periodIndex !== -1
      ? { year: numberCell(row[periodIndex]) ?? textCell(row[periodIndex]) }
      : {}),
  }));

  return { records, unmatched: [] };
}

const SHAPE_BUILDERS = Object.freeze({
  line: buildLineShape,
  category: buildCategoryShape,
  twoPeriod: buildTwoPeriodShape,
  pairs: buildPairsShape,
  matrix: buildMatrixShape,
  geo: buildGeoShape,
});

/**
 * Shape an inline table into the response body the matching module API view
 * would return for `spec.chartType`. Returns `{ records: [] }` when the
 * table or chart type is unusable (mirrors an empty API response rather
 * than throwing).
 */
export function buildShapes(table, spec) {
  const shape = QUERY_SHAPES[spec?.chartType];
  const builder = shape && SHAPE_BUILDERS[shape];
  if (!table || !builder) return { records: [] };
  return builder(applyTabFilter(table, spec?.filters), spec);
}

/**
 * Which chart families a table can plausibly feed, based on the mix of
 * column types present — used to gray out chart types the bound columns
 * can't support. This is a coarse heuristic (enough columns of the right
 * kind), not a binding-validity check (`validateInlineBindings` in
 * lib/visualization/validation.js owns that).
 */
export function supportedShapes(table) {
  const columns = table?.columns || [];
  const numberCols = columns.filter((column) => column.type === "number").length;
  const textCols = columns.filter((column) => column.type === "text").length;
  const groupCols = columns.filter((column) => column.type === COLUMN_TYPES.GROUP).length;
  const dateCols = columns.filter((column) => column.type === "date").length;
  const dimensionCols = textCols + groupCols + dateCols;

  const supported = [];
  if (numberCols >= 1 && (dateCols >= 1 || numberCols >= 2 || dimensionCols >= 1)) {
    supported.push("line");
  }
  if (dimensionCols >= 1 && numberCols >= 1) supported.push("bar");
  if (dimensionCols >= 1 && numberCols >= 2) supported.push("dumbbell", "slope");
  // Forest plot wants a study label + a low/high pair (CI); an estimate and a
  // weight column are optional extras.
  if (dimensionCols >= 1 && numberCols >= 2) supported.push("forest");
  if (numberCols >= 2) supported.push("scatter");
  if (numberCols >= 3) supported.push("bubble");
  // Two dimensions + a measure: heatmap grid or multi-series dot plot.
  if (dimensionCols >= 2 && numberCols >= 1) supported.push("heatmap", "dotPlot");
  if (dimensionCols >= 1 && numberCols >= 1) supported.push("choroplethMap");
  return supported;
}
