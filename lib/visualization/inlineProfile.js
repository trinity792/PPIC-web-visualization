/**
 * inlineProfile.js — read a pasted table's shape and rank the charts that
 * draw it best (dataset-range plan, workstream 5).
 *
 * `profileTable` describes the shape: which columns are dates, labels, and
 * numbers, whether labels repeat, whether two label columns form a complete
 * grid, whether the number columns are parts of a whole, and which number
 * columns are named like periods or like a low/high pair. `rankInlineCharts`
 * turns that into chart candidates, best first, each with the mapping and the
 * few appearance presets it needs and a reason a reader can understand. A
 * fresh import applies the first candidate; the Chart Type tiles follow the
 * rest of the order.
 *
 * Rules are checked top to bottom, and the first that fits ranks first:
 *
 *   1. a date column, a label column that repeats across dates, numbers → line, series by label
 *   2. a date column and numbers                                       → line, every number a series
 *   3. a label column and 3+ numbers named like periods                → line, columns as periods
 *   4. a label column and two numbers named as a pair (low/high, women/men)
 *      or as two periods, or a pair plus a total                       → range
 *   5. a label column, an estimate, and lower and upper bounds         → forest plot
 *   6. labels and 2+ numbers whose rows add up to 100                  → bar, stacked to 100%
 *   7. unique labels and exactly two numbers                           → scatter
 *   8. labels and 2+ numbers                                           → bar, grouped
 *   9. two labels, one number, every pair present, 25 values or fewer  → heatmap
 *  10. two labels and one number                                       → dot plot
 *  11. labels and one number                                           → bar
 *  12. two or more numbers and no labels                               → scatter
 *  13. anything else                                                   → bar
 *
 * Pie and the maps are never ranked first: the style guide prefers bars to
 * pies, and a pasted table has no map boundaries.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   profileTable(table)        — the table's shape (never changes the table)
 *   rankInlineCharts(profile)  — [{ chartType, bindings, appearance, reason }], best first
 *
 * Data sources:
 *   - lib/tabular/columnTypes.js (date headers, parts of a whole)
 */

import { chartableTable, parseDateToken, rowShares } from "@/lib/tabular/columnTypes";

// Grid charts stay readable up to this many labels on an axis.
const MAX_GRID_LABELS = 25;
// Bars turn horizontal past this many categories, or this long a label.
const MAX_VERTICAL_CATEGORIES = 10;
const MAX_VERTICAL_LABEL = 20;

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const CHART_NAMES = Object.freeze({
  line: "Line chart",
  bar: "Bar chart",
  dumbbell: "Range chart",
  forest: "Forest plot",
  heatmap: "Heatmap",
  dotPlot: "Dot plot",
  scatter: "Scatter plot",
  bubble: "Bubble chart",
  pie: "Pie chart",
  dataTable: "Data table",
});
// After the rules that fit, every other chart the tool can draw from pasted
// data, in a sensible order for the Chart Type tiles. Pie comes last.
const FALLBACK_ORDER = ["bar", "line", "dotPlot", "dumbbell", "heatmap", "scatter", "forest", "bubble", "dataTable", "pie"];

// Column names that make a pair: the first word starts a range, the second ends it.
const NAME_PAIRS = Object.freeze([
  ["low", "high"], ["lower", "upper"], ["start", "end"], ["before", "after"],
  ["min", "max"], ["minimum", "maximum"], ["from", "to"],
  // Two groups compared, as PPIC's range charts draw a gap (start, end).
  ["women", "men"], ["female", "male"],
]);
// With a pair, a third number column named like these is the range's middle point.
const POINT_WORDS = ["total", "all", "overall", "point", "average", "mean", "median"];
const ESTIMATE_WORDS = ["estimate", "est", "point", "mean", "median", "effect", "value", "or", "rr", "hr"];
const LOWER_WORDS = ["lower", "low", "lcl", "l95", "lo"];
const UPPER_WORDS = ["upper", "high", "ucl", "u95", "hi"];

const words = (name) => String(name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const hasWord = (name, list) => words(name).some((word) => list.includes(word));
const count = (n) => NUMBER_WORDS[n] || String(n);
const plural = (n, noun) => `${count(n)} ${noun}${n === 1 ? "" : "s"}`;

function filled(value) {
  return value != null && String(value).trim() !== "";
}

/**
 * The shape of a pasted table, for ranking. Reads the column types the import
 * profiled (`date`, `number`, and `text` or `group` as labels).
 */
export function profileTable(input) {
  // Ignored columns and marked rows never shape the chart (import overhaul).
  const table = chartableTable(input);
  const rows = table?.rows || [];
  const columns = (table?.columns || []).map((column, index) => ({ ...column, index }));
  const valuesOf = (column) => rows.map((row) => row?.[column.index]).filter(filled).map((value) => String(value).trim());

  const dates = columns.filter((column) => column.type === "date");
  const numbers = columns.filter((column) => column.type === "number");
  const labels = columns
    .filter((column) => column.type === "text" || column.type === "group")
    .map((column) => {
      const values = valuesOf(column);
      const distinct = new Set(values).size;
      return {
        name: column.name,
        index: column.index,
        distinct,
        repeats: distinct < values.length,
        unique: values.length === rows.length && distinct === rows.length,
        longest: Math.max(0, ...values.map((value) => value.length)),
      };
    });
  const numberNames = numbers.map((column) => column.name);

  let grid = null;
  if (labels.length === 2) {
    const pairs = new Set(rows.map((row) => JSON.stringify([row?.[labels[0].index], row?.[labels[1].index]])));
    grid = {
      complete: pairs.size === rows.length && labels[0].distinct * labels[1].distinct === pairs.size,
      small: labels.every((label) => label.distinct <= MAX_GRID_LABELS),
    };
  }

  const interval = numbers.length === 3
    ? (() => {
      const lower = numbers.find((column) => hasWord(column.name, LOWER_WORDS));
      const upper = numbers.find((column) => column !== lower && hasWord(column.name, UPPER_WORDS));
      const point = numbers.find((column) => column !== lower && column !== upper && hasWord(column.name, ESTIMATE_WORDS));
      return lower && upper && point ? { point: point.name, start: lower.name, end: upper.name } : null;
    })()
    : null;

  // Two number columns named as a pair; with a third, it must read as the
  // range's middle point (a total), and the three must not be an estimate
  // with its bounds, which is a forest plot.
  let pair = null;
  if (numbers.length === 2 || (numbers.length === 3 && !interval)) {
    pair = NAME_PAIRS.map(([start, end]) => {
      const first = numbers.find((column) => hasWord(column.name, [start]));
      const second = numbers.find((column) => column !== first && hasWord(column.name, [end]));
      if (!first || !second) return null;
      const rest = numbers.find((column) => column !== first && column !== second);
      if (rest && !hasWord(rest.name, POINT_WORDS)) return null;
      return { start: first.name, end: second.name, ...(rest ? { point: rest.name } : {}) };
    }).find(Boolean) || null;
  }

  return {
    table,
    rowCount: rows.length,
    dates: dates.map((column) => column.name),
    labels,
    numbers: numberNames,
    periodHeaders: numberNames.filter((name) => parseDateToken(name)),
    shares: numberNames.length >= 2 && rowShares(table, numberNames),
    grid,
    pair,
    interval,
  };
}

/** The label column with the most distinct values (the natural category axis). */
function richestLabel(labels) {
  return labels.reduce((best, label) => (!best || label.distinct > best.distinct ? label : best), null);
}

function barOrientation(label) {
  return label && (label.distinct > MAX_VERTICAL_CATEGORIES || label.longest > MAX_VERTICAL_LABEL)
    ? { orientation: "horizontal" }
    : {};
}

/** Every rule that fits the profile, best first. */
function matchingRules(profile) {
  const { dates, labels, numbers, periodHeaders, shares, grid, pair, interval } = profile;
  const rules = [];
  const add = (chartType, bindings, appearance, reason) =>
    rules.push({ chartType, bindings, appearance, reason: `${CHART_NAMES[chartType]}: ${reason}.` });
  const category = richestLabel(labels);
  const repeating = labels.find((label) => label.repeats);

  if (dates.length && repeating && numbers.length) {
    add("line", { x: dates[0], series: repeating.name, y: numbers[0] }, {},
      `a date column, a label column (“${repeating.name}”) whose values repeat across dates, and a number column`);
  }
  if (dates.length && numbers.length && !repeating) {
    add("line", { x: dates[0], y: numbers }, {},
      `a date column and ${plural(numbers.length, "number column")}, one line each`);
  }
  if (labels.length && periodHeaders.length >= 3 && !dates.length) {
    add("line", { series: category.name, y: periodHeaders, valuesArePeriods: true }, {},
      `${plural(periodHeaders.length, "number column")} named like periods, so each column is a period and each row a line`);
  }
  if (labels.length && (pair || (numbers.length === 2 && periodHeaders.length === 2))) {
    const ends = pair || { start: numbers[0], end: numbers[1] };
    add("dumbbell", { category: category.name, ...ends }, {},
      pair
        ? `two number columns named as a pair (“${ends.start}” and “${ends.end}”), drawn as the two ends of each row's range`
        : `two number columns named like periods (“${ends.start}” and “${ends.end}”), drawn as each row's change between them`);
  }
  if (labels.length && interval) {
    add("forest", { category: category.name, ...interval }, {},
      `an estimate column with lower and upper bound columns`);
  }
  if (labels.length && numbers.length >= 2 && shares) {
    add("bar", { category: category.name, y: numbers },
      { orientation: "horizontal", stackMode: "percent", sort: "descending" },
      `${plural(numbers.length, "number column")} that add up to 100 on each row, so they are shares of a whole`);
  }
  const uniqueLabel = labels.length === 1 && labels[0].unique ? labels[0] : null;
  if (uniqueLabel && numbers.length === 2) {
    add("scatter", { unit: uniqueLabel.name, x: numbers[0], y: numbers[1] }, {},
      `two number columns to plot against each other, one point per row of “${uniqueLabel.name}”`);
  }
  if (labels.length && numbers.length >= 2) {
    add("bar", { category: category.name, y: numbers }, { stackMode: "none" },
      `a label column and ${plural(numbers.length, "number column")}, side by side`);
  }
  if (labels.length === 2 && numbers.length === 1 && grid?.complete && grid.small) {
    add("heatmap", { x: labels[0].name, y: labels[1].name, color: numbers[0] }, {},
      `two label columns that form a complete grid, with a number in every cell`);
  }
  if (labels.length === 2 && numbers.length === 1) {
    const [rows, across] = labels[1].distinct > labels[0].distinct ? [labels[1], labels[0]] : labels;
    add("dotPlot", { y: rows.name, x: across.name, color: [numbers[0]] }, {},
      `two label columns and a number column, one row per “${rows.name}”`);
  }
  if (labels.length && numbers.length === 1) {
    add("bar", { category: category.name, y: [numbers[0]] }, barOrientation(category),
      `a label column and a number column`);
  }
  if (!labels.length && numbers.length >= 2) {
    add("scatter", { x: numbers[0], y: numbers[1] }, {},
      `two number columns to plot against each other, one point per row`);
  }
  return rules;
}

/**
 * Charts for the table, best first: each rule that fits, then every other
 * chart in a fixed order (without a mapping, which the editor guesses when
 * the reader picks it). The first candidate is never a pie or a map.
 *
 * @returns {Array<{ chartType, bindings, appearance, reason }>}
 */
export function rankInlineCharts(profile) {
  const ranked = [];
  const seen = new Set();
  for (const rule of matchingRules(profile)) {
    if (seen.has(rule.chartType)) continue;
    seen.add(rule.chartType);
    ranked.push(rule);
  }
  for (const chartType of FALLBACK_ORDER) {
    if (seen.has(chartType)) continue;
    seen.add(chartType);
    const first = profile.labels[0]?.name;
    ranked.push({
      chartType,
      bindings: chartType === "bar" && first ? { category: first } : {},
      appearance: {},
      reason: `${CHART_NAMES[chartType]}: another way to draw these columns.`,
    });
  }
  return ranked;
}
