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
 */

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
