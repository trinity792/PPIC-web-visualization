/**
 * colorScale.js — the colors a scale-driven chart gives its values: a
 * continuous ramp (the heatmap, and a map set to Continuous) or a few discrete
 * classes (maps, by default).
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Both renderers read it, so a value keeps its color when the renderer
 * changes: the Plotly adapters take `scaleStops` as their `colorscale`, and the
 * visx heatmap colors each cell with `colorAt` on the same stops.
 *
 * Classes (owner, 2026-10-12): PPIC's published choropleth and symbol maps
 * color places by class, not along a continuous ramp. The guide's example
 * (p.29) draws five classes keyed "< 14.1%", "14.1 - 15.5%", ..., "> 18.3%".
 * `classification` picks how values split ("quantile", the default, puts the
 * same number of places in each class; "equalInterval" splits the value range
 * evenly; "custom" uses the reader's own `classBreaks`, an Advanced Mode
 * choice; "continuous" keeps the ramp) and `bins` how many classes (3 to 7,
 * 5 by default). Breaks are rounded to the precision the key shows, so every
 * key label is exact.
 *
 * Exports:
 *   CLASSIFICATIONS                    — the `classification` values a view may save
 *   CLASS_COUNT_LIMITS                 — { min, max, fallback } for `bins`
 *   classificationFor(appearance)      — the saved classification, else "quantile"
 *   classCountFor(appearance)          — the saved class count, kept within limits
 *   customBreaksFor(appearance, count) — the reader's own breaks, or null when they do not fit
 *   scaleStops(appearance, opts)       — [[stop, hex], ...] for a ramp, inverted if asked
 *   colorAt(stops, t)                  — the ramp's color at t (0–1)
 *   sampleColors(stops, count)         — `count` evenly spaced colors along a ramp
 *   continuousColor(value, domain, stops) — a value's color, or null when missing
 *   classesFor(values, opts)           — { thresholds, classes: [{ label, color, from, to }] }
 *   classIndex(value, thresholds)      — the class a value falls in
 *
 * Data sources:
 *   - lib/visualization/palettes.js (rampFor and each chart type's default ramp)
 */

import { rampFor } from "./palettes";

// ── Settings ─────────────────────────────────────────────────────────

export const CLASSIFICATIONS = Object.freeze(["quantile", "equalInterval", "custom", "continuous"]);

export const CLASS_COUNT_LIMITS = Object.freeze({ min: 3, max: 7, fallback: 5 });

export function classificationFor(appearance = {}) {
  return CLASSIFICATIONS.includes(appearance.classification)
    ? appearance.classification
    : "quantile";
}

/**
 * The reader's own class breaks (Advanced Mode, owner 2026-10-12): one value
 * opening each class after the first, so `count - 1` of them, rising. Null when
 * they do not fit the class count, so the map falls back to quantiles rather
 * than drawing classes nobody chose.
 */
export function customBreaksFor(appearance = {}, count = classCountFor(appearance)) {
  const breaks = appearance.classBreaks;
  if (!Array.isArray(breaks) || breaks.length !== count - 1) return null;
  const values = breaks.map((value) => (value === null || value === "" ? NaN : Number(value)));
  if (!values.every(Number.isFinite)) return null;
  if (values.some((value, index) => index > 0 && value <= values[index - 1])) return null;
  return values;
}

export function classCountFor(appearance = {}) {
  const raw = appearance.bins;
  const value = Number(raw);
  if (raw === null || raw === undefined || raw === "" || !Number.isFinite(value)) {
    return CLASS_COUNT_LIMITS.fallback;
  }
  return Math.min(CLASS_COUNT_LIMITS.max, Math.max(CLASS_COUNT_LIMITS.min, Math.round(value)));
}

// ── Ramps ────────────────────────────────────────────────────────────

// Plotly's built-in "RdBu" (plotly.js colorscale scales), as hex stops, so the
// legacy named fallback can be interpolated and both renderers draw the same.
const NAMED_SCALES = Object.freeze({
  RdBu: Object.freeze([
    [0, "#050AAC"],
    [0.35, "#6A89F7"],
    [0.5, "#BEBEBE"],
    [0.6, "#DCAA84"],
    [0.7, "#E6915A"],
    [1, "#B20A1C"],
  ]),
});

function roundStop(value) {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * The ramp as `[stop, hex]` pairs, low to high. Invert reverses the colors
 * along the same stops, so the low end takes the high end's color.
 * @param {object} appearance
 * @param {{kind?: "sequential"|"diverging", invert?: boolean, fallback?: string|null}} [opts]
 */
export function scaleStops(appearance = {}, { kind = "sequential", invert = false, fallback = null } = {}) {
  const ramp = rampFor(appearance, { kind, fallback });
  const stops = typeof ramp === "string" ? NAMED_SCALES[ramp] || NAMED_SCALES.RdBu : ramp;
  const copy = stops.map(([stop, color]) => [stop, color]);
  if (!invert) return copy;
  return copy.map(([stop, color]) => [roundStop(1 - stop), color]).reverse();
}

function channels(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
}

function toHex(rgb) {
  return `#${rgb
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

/** The ramp's color at t, blending the two stops around it in sRGB. */
export function colorAt(stops, t) {
  const position = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const upperIndex = stops.findIndex(([stop]) => stop >= position);
  if (upperIndex <= 0) return stops[0][1].toUpperCase();
  const [highStop, highColor] = stops[upperIndex];
  const [lowStop, lowColor] = stops[upperIndex - 1];
  const share = highStop === lowStop ? 1 : (position - lowStop) / (highStop - lowStop);
  const low = channels(lowColor);
  const high = channels(highColor);
  return toHex(low.map((channel, index) => channel + (high[index] - channel) * share));
}

/** `count` colors evenly spaced along the ramp, lightest (low) first. */
export function sampleColors(stops, count) {
  if (count <= 1) return [colorAt(stops, 1)];
  return Array.from({ length: count }, (_, index) => colorAt(stops, index / (count - 1)));
}

/** A value's color on a continuous ramp over `[min, max]`; null when missing. */
export function continuousColor(value, [min, max], stops) {
  if (!Number.isFinite(value)) return null;
  const t = max > min ? (value - min) / (max - min) : 0.5;
  return colorAt(stops, t);
}

// ── Classes ──────────────────────────────────────────────────────────

/**
 * The value that opens quantile class `index` of `count`: the first value past
 * that share of the sorted values, so each class holds as near the same number
 * of places as the data allows and none is empty. Null past the last value.
 */
function quantileBreak(sorted, index, count) {
  const position = Math.ceil((index * sorted.length) / count - 1e-9);
  return position < sorted.length ? sorted[position] : null;
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * How many decimal places the class breaks keep: the chosen number format's,
 * else none for whole numbers, else enough to tell classes of this range apart.
 */
function breakDecimals(values, decimalPlaces) {
  if (Number.isInteger(decimalPlaces)) return decimalPlaces;
  if (values.every(Number.isInteger)) return 0;
  const span = Math.max(...values) - Math.min(...values);
  if (!(span > 0)) return 1;
  return Math.min(6, Math.max(0, Math.ceil(-Math.log10(span / 100))));
}

/** Decimal places a typed number carries ("14.1" has one). */
function decimalsOf(value) {
  const text = String(value);
  const dot = text.indexOf(".");
  return dot === -1 || /e/i.test(text) ? 0 : text.length - dot - 1;
}

/** The class a value falls in: how many thresholds it reaches. */
export function classIndex(value, thresholds) {
  return thresholds.filter((threshold) => value >= threshold).length;
}

/**
 * Discrete classes for the drawn values. Each threshold opens a class (a value
 * equal to it belongs to the class above). Key labels follow the guide's
 * example: "< first", "low – high" with high one display step below the next
 * threshold, and "> last" for the top class. Fewer distinct values than
 * classes gives fewer classes, never an empty one. The reader's own `breaks`
 * are used as they are, every class kept even if no place falls in it, and
 * labeled to the precision they were typed in.
 * @param {number[]} values
 * @param {{method?: string, count?: number, stops: Array, decimalPlaces?: number|null,
 *          breaks?: number[]|null,
 *          format: (value: number, decimals: number) => string}} opts
 */
export function classesFor(values, { method = "quantile", count = 5, stops, decimalPlaces = null, breaks = null, format }) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return { thresholds: [], classes: [] };
  const min = finite[0];
  const max = finite.at(-1);
  const decimals = breaks
    ? Number.isInteger(decimalPlaces) ? decimalPlaces : Math.max(0, ...breaks.map(decimalsOf))
    : breakDecimals(finite, decimalPlaces);
  const step = 10 ** -decimals;
  const raw = breaks || Array.from({ length: count - 1 }, (_, index) => {
    const share = (index + 1) / count;
    return method === "equalInterval" ? min + (max - min) * share : quantileBreak(finite, index + 1, count);
  });
  const thresholds = breaks
    ? [...breaks]
    : [...new Set(raw.filter((value) => value != null).map((value) => roundTo(value, decimals)))]
      .filter((threshold) => threshold > min && threshold <= max)
      .sort((a, b) => a - b);
  const colors = sampleColors(stops, thresholds.length + 1);
  const below = (threshold) => roundTo(threshold - step, decimals);
  const text = (value) => format(value, decimals);
  const classes = colors.map((color, index) => {
    const from = index === 0 ? Math.min(min, thresholds[0] ?? min) : thresholds[index - 1];
    const to = index === thresholds.length ? Math.max(max, thresholds.at(-1) ?? max) : below(thresholds[index]);
    let label;
    if (!thresholds.length) label = min === max ? text(min) : `${text(min)} – ${text(max)}`;
    else if (index === 0) label = `< ${text(thresholds[0])}`;
    else if (index === thresholds.length) label = `> ${text(below(thresholds.at(-1)))}`;
    else label = to > from ? `${text(from)} – ${text(to)}` : text(from);
    return { index, label, color, from, to };
  });
  return { thresholds, classes, decimals };
}
