/**
 * sharedSettings.js — the one reader for the settings every chart shares.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Every chart model calls `sharedSettings` for labels and their show switches,
 * typography sizes, key placement, number formats, decimal places, and tick
 * increments (renderer plan, Workstream C). No chart reads these settings any
 * other way, so each has exactly one place to change. `ChartFrame` reads the
 * label and size helpers below for the same reason, and the Plotly adapters
 * read `numberFormatFor` so both renderers format numbers alike.
 *
 * Settings the owner removed or hid (`showLegend`, `labels.tooltip`,
 * `legendLabels`, `hiddenSeries`, `seriesColors`, the row label indents) are
 * never read here, so a saved view that still holds them opens unchanged.
 *
 * Exports:
 *   TYPOGRAPHY_LIMITS                    — { appearanceKey: { role?, min, max, fallback } }
 *   LEGEND_POSITIONS                     — key placements a view may save
 *   resolveLabels(labels, appearance)    — frame and axis labels after show switches
 *   resolveTypography(appearance)        — { title, subtitle, axis, legend, dataLabel } px
 *   showsSourceBox(appearance)           — whether the source-and-notes box is drawn
 *   numberFormatFor(observations, appearance, axis) — { type, decimalPlaces } | null
 *   formatAxisNumber(value, numberFormat) — text for one value
 *   sharedSettings(input)                — every shared setting for one chart
 *
 * Data sources:
 *   - adaptObservations input ({ chartType, observations, labels, appearance })
 *   - lib/visualization/chartStyle.js (the guide's type sizes as fallbacks)
 *   - lib/visualization/formatters.js (number formatting)
 */

import { getChartType } from "@/lib/visualization/chartRegistry";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";
import { formatNumber } from "@/lib/visualization/formatters";

// ── Limits ───────────────────────────────────────────────────────────

/**
 * The Typography section's fields and their ranges. The section clamps edits
 * to these, and `resolveTypography` clamps saved values to them, so a view saved
 * with an out-of-range size still draws within the PPIC type scale.
 */
export const TYPOGRAPHY_LIMITS = Object.freeze({
  titleFontSize: Object.freeze({ role: "title", min: 14, max: 32, fallback: CHART_STYLE.text.title.fontSize }),
  subtitleFontSize: Object.freeze({ role: "subtitle", min: 11, max: 24, fallback: CHART_STYLE.text.subtitle.fontSize }),
  axisFontSize: Object.freeze({ role: "axis", min: 9, max: 20, fallback: CHART_STYLE.text.axis.fontSize }),
  legendFontSize: Object.freeze({ role: "legend", min: 10, max: 20, fallback: CHART_STYLE.text.key.fontSize }),
  dataLabelFontSize: Object.freeze({ role: "dataLabel", min: 9, max: 22, fallback: CHART_STYLE.text.dataLabel.fontSize }),
  decimalPlaces: Object.freeze({ min: 0, max: 6, fallback: 2 }),
});

// "top" places the key above the chart, as every PPIC bar chart with a key
// does (renderer plan E); every chart type can choose it.
export const LEGEND_POSITIONS = Object.freeze(["automatic", "top", "right", "bottom", "hidden"]);

const NUMBER_TYPES = new Set(["number", "usd", "percent"]);
const LABEL_SWITCHES = Object.freeze({
  title: "showTitle",
  subtitle: "showSubtitle",
  xAxis: "showXAxisLabel",
  yAxis: "showYAxisLabel",
});

// ── Helpers ──────────────────────────────────────────────────────────

function clamp(raw, { min, max, fallback }) {
  const value = Number(raw);
  if (raw === null || raw === undefined || raw === "" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function textOrNull(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function positiveOrNull(raw) {
  const value = Number(raw);
  return raw !== null && raw !== undefined && raw !== "" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function isYearOverYearPercentage(observations = []) {
  return observations.some((row) => row.calculation?.id === "percentChange");
}

// ── Readers ──────────────────────────────────────────────────────────

/**
 * The frame and axis labels to draw. A label is null when it has no text or its
 * show switch is off, so a drawing leaves the part out rather than keeping an
 * empty gap. Only these labels are read: `labels.tooltip` was removed.
 */
export function resolveLabels(labels = {}, appearance = {}) {
  const resolved = {
    eyebrow: textOrNull(labels.eyebrow),
    title: textOrNull(labels.title),
    subtitle: textOrNull(labels.subtitle),
    xAxis: textOrNull(labels.xAxis),
    yAxis: textOrNull(labels.yAxis),
    footnote: textOrNull(labels.footnote),
  };
  for (const [label, key] of Object.entries(LABEL_SWITCHES)) {
    if (appearance[key] === false) resolved[label] = null;
  }
  return resolved;
}

/** The source-and-notes box is on unless the reader switched it off. */
export function showsSourceBox(appearance = {}) {
  return appearance.showSource !== false;
}

/** Text sizes in px, falling back to the style guide's and kept within limits. */
export function resolveTypography(appearance = {}) {
  const sizes = {};
  for (const [key, limits] of Object.entries(TYPOGRAPHY_LIMITS)) {
    if (limits.role) sizes[limits.role] = clamp(appearance[key], limits);
  }
  return sizes;
}

/**
 * The number format for one value axis ("horizontal" or "vertical"), or null
 * when numbers are shown as they are. A year-over-year percent calculation
 * reads as a percent when no type is chosen, as it always has on line charts.
 */
export function numberFormatFor(observations, appearance = {}, axis = "vertical") {
  const explicitType = appearance[`${axis}NumberType`];
  const type = NUMBER_TYPES.has(explicitType)
    ? explicitType
    : isYearOverYearPercentage(observations)
      ? "percent"
      : null;
  if (!type) return null;
  return { type, decimalPlaces: clamp(appearance.decimalPlaces, TYPOGRAPHY_LIMITS.decimalPlaces) };
}

/**
 * Text for one value on an axis, tooltip, or label. With no number type,
 * whole-number counts are left as they are, which is today's rule for counts.
 */
export function formatAxisNumber(value, numberFormat) {
  if (!numberFormat) {
    return formatNumber(value, { type: "raw" });
  }
  return formatNumber(value, numberFormat);
}

function axisSettings(observations, appearance, axis) {
  const numberFormat = numberFormatFor(observations, appearance, axis);
  return {
    numberType: numberFormat?.type ?? null,
    decimalPlaces: numberFormat?.decimalPlaces ?? null,
    increment: positiveOrNull(appearance[`${axis}TickIncrement`]),
    format: (value) => formatAxisNumber(value, numberFormat),
  };
}

function keyPosition(chartType, appearance) {
  if (LEGEND_POSITIONS.includes(appearance.legendPosition)) return appearance.legendPosition;
  return getChartType(chartType)?.defaults?.legendPosition || "right";
}

/**
 * Every shared setting for one chart, from the same input `adaptObservations`
 * takes. Chart models call this once and read chart-specific settings
 * themselves.
 */
export function sharedSettings({ chartType, observations = [], labels = {}, appearance = {} } = {}) {
  return {
    labels: resolveLabels(labels, appearance),
    typography: resolveTypography(appearance),
    key: { position: keyPosition(chartType, appearance) },
    frame: { showSource: showsSourceBox(appearance) },
    axes: {
      x: axisSettings(observations, appearance, "horizontal"),
      y: axisSettings(observations, appearance, "vertical"),
    },
  };
}
