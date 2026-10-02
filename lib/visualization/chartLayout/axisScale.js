/**
 * axisScale.js — value-axis ranges and tick values for every visx chart with a
 * value axis, plus how many period labels fit along a horizontal axis.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Follows the style guide: the axis starts at zero, steps are round (1, 2, 2.5,
 * or 5 times a power of ten), and there are four to six ticks. The exceptions
 * to the zero baseline are the "indexed" calculation, whose values sit around
 * 100: starting at zero would flatten every line, so its axis starts at a round
 * number just below the lowest value; and a chart that places values rather
 * than measuring lengths from zero (the range chart, `includeZero: false`),
 * which fits its data the same way, as PPIC's published range plots do.
 *
 * Exports:
 *   axisScale({ min, max, calculation?, increment?, includeZero? }) — { domain: [lo, hi], ticks, step }
 *   periodLabelCount(width)                           — period labels that fit at `width` px
 *   periodTicks(periods, { width, increment })        — the periods the time axis labels
 *
 * Data sources:
 *   - Chart models (lib/visualization/models/*), which pass their value extent
 */

const NICE_MULTIPLIERS = [1, 2, 2.5, 5];
const MAX_INTERVALS = 5;
// The densest axis the editor's tick increment control can produce: a 75-unit
// span at increment 1 (MAX_TICK_INCREMENT_RANGE in AppearanceSection.js). A
// saved increment that would draw more intervals (an imported view, say)
// widens to a round multiple of itself, so ticks still land on its multiples.
const MAX_INCREMENT_INTERVALS = 75;
// About one period label per 70px keeps four-digit years from touching.
const PX_PER_PERIOD_LABEL = 70;

// ── Helpers ──────────────────────────────────────────────────────────

/** Removes floating-point noise, so 0.1 + 0.2 reads as 0.3. */
function clean(value) {
  return Number(value.toPrecision(12));
}

function niceSteps(span) {
  const power = 10 ** Math.floor(Math.log10(span / MAX_INTERVALS));
  return [0.1, 1, 10].flatMap((scale) =>
    NICE_MULTIPLIERS.map((multiplier) => clean(multiplier * power * scale)),
  );
}

function ticksFor(lo, hi, step) {
  const start = Math.floor(clean(lo / step)) * step;
  const end = Math.ceil(clean(hi / step)) * step;
  const count = Math.round((end - start) / step);
  return Array.from({ length: count + 1 }, (_, index) => clean(start + index * step));
}

/**
 * The value range to cover: zero is included unless the calculation is indexed
 * or the chart fits its data (`includeZero: false`).
 */
function extent(min, max, calculation, includeZero) {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  const fits = calculation === "indexed" || !includeZero;
  if (!fits) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (lo === hi) {
    // One value, or all values equal: give the axis height around it.
    const pad = lo === 0 ? 1 : Math.abs(lo) / 2;
    if (fits) return [lo - pad, hi + pad];
    return lo >= 0 ? [0, hi + (hi === 0 ? pad : 0)] : [lo, 0];
  }
  return [lo, hi];
}

// ── Public API ───────────────────────────────────────────────────────

export function axisScale({ min, max, calculation = null, increment = null, includeZero = true } = {}) {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  const [lo, hi] = extent(safeMin, safeMax, calculation, includeZero);

  if (Number.isFinite(increment) && increment > 0) {
    // increment × 1, 2, 5, 10, 20, 50, … until the axis is no denser than
    // the editor allows.
    let step = increment;
    for (let rung = 1; (hi - lo) / step > MAX_INCREMENT_INTERVALS && rung < 60; rung += 1) {
      step = clean(increment * [1, 2, 5][rung % 3] * 10 ** Math.floor(rung / 3));
    }
    const ticks = ticksFor(lo, hi, step);
    if (ticks.length >= 2 && ticks.length - 1 <= MAX_INCREMENT_INTERVALS) {
      return { domain: [ticks[0], ticks.at(-1)], ticks, step };
    }
  }

  const span = hi - lo;
  for (const step of niceSteps(span)) {
    const ticks = ticksFor(lo, hi, step);
    if (ticks.length - 1 <= MAX_INTERVALS) {
      return { domain: [ticks[0], ticks.at(-1)], ticks, step };
    }
  }
  // Unreachable for finite input; kept so a bad value never throws mid-render.
  return { domain: [lo, hi], ticks: [lo, hi], step: span };
}

export function periodLabelCount(width) {
  return Math.max(1, Math.floor((Number(width) || 0) / PX_PER_PERIOD_LABEL));
}

// Even year steps, as PPIC's published charts label a time axis.
const YEAR_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];

function isNumericPeriod(period) {
  return String(period ?? "").trim() !== "" && Number.isFinite(Number(period));
}

/**
 * The periods a time axis labels: always the latest period, then back from it
 * in one even step, so the gaps are equal and the most recent year is never
 * dropped (1991-2026 reads 1991, 1996, ..., 2021, 2026). For years the step is
 * 1, 2, 5, 10, 20, ... years, the smallest that fits `width` and no finer than
 * the data's own spacing, so five-yearly projections still read 2020, 2025,
 * 2030; a saved tick increment sets the step instead. Other periods
 * ("2019-20", "2024-01") are labeled every Nth period back from the last.
 */
export function periodTicks(periods = [], { width = 0, increment = null } = {}) {
  if (!periods.length) return [];
  const fit = Math.max(2, periodLabelCount(width));
  if (!periods.every(isNumericPeriod)) {
    const every = Math.max(1, Math.ceil(periods.length / fit));
    const last = periods.length - 1;
    return periods.filter((_, index) => (last - index) % every === 0);
  }
  const values = [...new Set(periods.map(Number))].sort((a, b) => a - b);
  const lo = values[0];
  const hi = values.at(-1);
  if (lo === hi) return [lo];
  // Back from the latest period in one step, then read left to right.
  const onMultiples = (step) => {
    const ticks = [];
    for (let tick = hi; tick >= lo; tick = clean(tick - step)) ticks.push(clean(tick));
    return ticks.reverse();
  };
  if (Number.isFinite(increment) && increment > 0) {
    const ticks = onMultiples(increment);
    if (ticks.length >= 1 && ticks.length - 1 <= MAX_INCREMENT_INTERVALS) return ticks;
  }
  const dataGap = Math.min(...values.slice(1).map((value, index) => value - values[index]));
  for (const step of YEAR_STEPS.filter((candidate) => candidate >= dataGap)) {
    const ticks = onMultiples(step);
    if (ticks.length <= fit) return ticks.length >= 2 ? ticks : [lo, hi];
  }
  return [lo, hi];
}
