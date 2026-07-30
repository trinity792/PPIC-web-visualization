/**
 * Value transforms applied to line/series data before rendering.
 *
 * CLIENT-SAFE (no node:fs). Each transform is a pure function
 * `(series, opts) => series` over the API series shape:
 *
 *   series: Array<{ location: string, years: number[], values: (number|null)[] }>
 *
 * Transforms are null-safe (missing input → null output, never 0) and never
 * mutate their input. Which transforms a field may use is gated by
 * `field.transforms` via `isTransformAllowed` — this is where guardrail #4
 * (rates use percentage-point change, never percent change) is enforced.
 *
 * Mirrors the "Display: Actual / Indexed / Percent change / Difference from
 * benchmark" controls and the transform lists in main.md.
 *
 * `transformOptions` is the other half of that: which of these a given chart
 * may offer at all. It lives here, beside the transforms themselves, so the
 * sidebar control and the reducer read one answer instead of two.
 */

import { inlinePeriods } from "@/lib/tabular/toSeries";

import { getChartType } from "./chartRegistry";
import { allowedTransforms } from "./fieldTypes";

/** Pick the base value for a series: the value at `baseYear`, else first non-null. */
function baseValueOf(series, baseYear) {
  if (baseYear != null) {
    const idx = series.years.indexOf(baseYear);
    if (idx !== -1 && series.values[idx] != null) return series.values[idx];
  }
  for (const v of series.values) {
    if (v != null) return v;
  }
  return null;
}

/** Map a series' values through `fn(value, base)`, preserving years and nulls. */
function mapAgainstBase(series, baseYear, fn) {
  const base = baseValueOf(series, baseYear);
  return {
    ...series,
    values: series.values.map((v) => (v == null || base == null ? null : fn(v, base))),
  };
}

/**
 * Registry keyed by transform id. `opts` may carry:
 *   - baseYear: number — reference period for indexed/change transforms
 *   - benchmark: { years, values } — comparison series for differenceFromBenchmark
 */
export const TRANSFORMS = Object.freeze({
  /** No-op; returns input unchanged. */
  actual: (series) => series,

  /** Index every series to 100 at the base year (proportional growth). */
  indexed: (series, opts = {}) =>
    mapAgainstBase(series, opts.baseYear, (v, base) => (v / base) * 100),

  /** Absolute change from the base-year value. */
  numericChange: (series, opts = {}) =>
    mapAgainstBase(series, opts.baseYear, (v, base) => v - base),

  /** Percent change from the base-year value. For stocks/counts only. */
  percentChange: (series, opts = {}) =>
    mapAgainstBase(series, opts.baseYear, (v, base) => ((v - base) / base) * 100),

  /** Percentage-point change from the base year. For rate/percentage fields. */
  percentagePointChange: (series, opts = {}) =>
    mapAgainstBase(series, opts.baseYear, (v, base) => v - base),

  /** Difference from a benchmark series, aligned by year. */
  differenceFromBenchmark: (series, opts = {}) => {
    const benchmark = opts.benchmark;
    if (!benchmark) return series;
    const benchByYear = new Map(benchmark.years.map((y, i) => [y, benchmark.values[i]]));
    return {
      ...series,
      values: series.values.map((v, i) => {
        const b = benchByYear.get(series.years[i]);
        return v == null || b == null ? null : v - b;
      }),
    };
  },
});

/** Whether `transformId` is permitted for `field` (guardrail #4). */
export function isTransformAllowed(field, transformId) {
  return allowedTransforms(field).includes(transformId);
}

// ── What a config may offer ──────────────────────────────────────────

/** Only "actual" — a chart that cannot re-express its values at all. */
const NO_CHOICE = Object.freeze(["actual"]);

/**
 * Raw values or index-to-100, the only pair bring-your-own-data can honour: an
 * imported table has no field catalog to read `transforms` from, and the
 * two-period change transforms are computed by the module fetch layer
 * (components/chart-builder/chartData.js), which has no inline equivalent.
 */
const INLINE_TRANSFORMS = Object.freeze(["actual", "indexed"]);

/** The measure whose values a chart is expressing, per the module catalog. */
function boundMeasure(config, schema) {
  const name =
    config?.bindings?.y ||
    config?.bindings?.color ||
    config?.bindings?.start ||
    config?.bindings?.x;
  return schema?.fields?.[name];
}

/** The imported table when this config is drawing user data, else null. */
function inlineTableOf(config, schema) {
  if (!schema?.inlineOnly || config?.data?.source !== "inline") return null;
  return config.data.inline || null;
}

/** Every year in an inclusive `[start, end]` range; [] for a malformed range. */
function yearsIn(range) {
  if (!Array.isArray(range) || range.length !== 2) return [];
  const [start, end] = range;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

/**
 * What the transform control may offer for a config, in one call — so the
 * sidebar section and the reducer's stranded-transform guard can never disagree
 * about which transforms a chart is able to express.
 *
 * Bring-your-own-data goes down the `inline` branch: its base periods are the
 * imported x column's own values rather than a module year range, and the pair
 * is offered only when the table holds more than one period (indexing a single
 * period sets every series to 100, which is a broken control, not a view).
 *
 * @param {object} config declarative chart configuration
 * @param {object} schema module (or byod) schema
 * @returns {{ transforms: string[], basePeriods: number[], inline: boolean }}
 */
export function transformOptions(config, schema) {
  const chart = getChartType(config?.chartType);
  const table = inlineTableOf(config, schema);
  const inline = Boolean(table);
  if (!chart?.transformCapable) {
    return { transforms: NO_CHOICE, basePeriods: [], inline };
  }
  if (inline) {
    const basePeriods = inlinePeriods(table, config);
    return {
      transforms: basePeriods.length > 1 ? INLINE_TRANSFORMS : NO_CHOICE,
      basePeriods,
      inline,
    };
  }
  return {
    transforms: allowedTransforms(boundMeasure(config, schema)),
    basePeriods: yearsIn(schema?.yearRange),
    inline,
  };
}

/**
 * Apply a transform to a list of series. Falls back to `actual` (with a flag) if
 * the transform is unknown or disallowed for the field, so callers can surface a
 * notice rather than silently producing a misleading chart.
 *
 * @returns {{ series: Array, applied: string, blocked: boolean }}
 */
export function applyTransform(transformId, seriesList, field, opts = {}) {
  const fn = TRANSFORMS[transformId];
  const blocked = !fn || (field && !isTransformAllowed(field, transformId));
  if (blocked) {
    return { series: seriesList, applied: "actual", blocked: true };
  }
  return { series: seriesList.map((s) => fn(s, opts)), applied: transformId, blocked: false };
}
