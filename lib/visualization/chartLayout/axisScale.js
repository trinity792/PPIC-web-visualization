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
 * A reader's axis range (`fixed`, Advanced Mode) overrides all of that: a set
 * end is used exactly, a blank end keeps the rules above, and ticks stay
 * inside the axis. The range may be narrower than the data, so `fixed: true`
 * tells the renderer to clip the marks to the plot.
 *
 * Exports:
 *   axisScale({ min, max, calculation?, increment?, includeZero?, fixed? }) — { domain: [lo, hi], ticks, step, fixed }
 *   periodLabelCount(width)                           — period labels that fit at `width` px
 *   periodTicks(periods, { width, increment })        — the periods the time axis labels
 *   calendarTicks({ min, max, width, granularity, increment }) — { ticks, tickText } at
 *                                                       calendar boundaries for dated periods
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

/**
 * The reader's fixed ends as [lo|null, hi|null], or null when neither is set
 * or the ends would leave no axis (min at or above max), so an impossible
 * range falls back to the automatic one rather than drawing nothing.
 */
function fixedEnds(fixed, [lo, hi]) {
  if (!Array.isArray(fixed)) return null;
  const ends = [0, 1].map((index) => (Number.isFinite(fixed[index]) ? fixed[index] : null));
  if (ends[0] == null && ends[1] == null) return null;
  return (ends[0] ?? lo) < (ends[1] ?? hi) ? ends : null;
}

/** Round ticks over [lo, hi]: the saved increment's, else the guide's. */
function niceScale(lo, hi, increment) {
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

// ── Public API ───────────────────────────────────────────────────────

export function axisScale({ min, max, calculation = null, increment = null, includeZero = true, fixed = null } = {}) {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  const [lo, hi] = extent(safeMin, safeMax, calculation, includeZero);
  const ends = fixedEnds(fixed, [lo, hi]);
  if (!ends) return { ...niceScale(lo, hi, increment), fixed: false };

  // A set end is exact; a blank end rounds as it would without a range.
  const scale = niceScale(ends[0] ?? lo, ends[1] ?? hi, increment);
  const domain = [ends[0] ?? scale.domain[0], ends[1] ?? scale.domain[1]];
  const ticks = scale.ticks.filter((tick) => tick >= domain[0] && tick <= domain[1]);
  return { domain, ticks, step: scale.step, fixed: true };
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

// ── Calendar time axis (dataset-range plan, workstream 2) ────────────

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Steps finer than a year, in years, by the finest granularity a column uses.
const SUB_YEAR_STEPS = Object.freeze({
  day: [1 / 12, 3 / 12, 6 / 12],
  month: [1 / 12, 3 / 12, 6 / 12],
  quarter: [3 / 12, 6 / 12],
});

/** One tick's text: a year, a quarter, or a month, as fine as its step. */
function calendarTickText(position, step, granularity) {
  const year = Math.floor(position + 1e-9);
  if (step >= 1 - 1e-9) return String(year);
  const month = Math.round((position - year) * 12);
  if (granularity === "quarter") return `Q${Math.floor(month / 3) + 1} ${year}`;
  return `${MONTH_LABELS[month]} ${year}`;
}

/** Ticks on multiples of `step` (calendar boundaries) between min and max. */
function alignedTicks(min, max, step) {
  const ticks = [];
  for (let index = Math.ceil(min / step - 1e-9); index * step <= max + 1e-9; index += 1) {
    ticks.push(clean(index * step));
  }
  return ticks;
}

/**
 * Ticks for a time axis whose periods sit at decimal-year positions (months,
 * quarters, days, school years): as many as `periodLabelCount(width)` allows
 * (half as many for month and quarter labels, which are twice as wide), at
 * calendar boundaries. Steps run from a month (or quarter) up through the
 * even year steps PPIC labels with. Labels read "2010", "Q1 2010", or
 * "Jan 2010". A positive `increment` (in years) is used when it fits. A span
 * too short for two ticks labels its two ends.
 *
 * @returns {{ ticks: number[], tickText: string[] }}
 */
export function calendarTicks({ min, max, width = 0, granularity = "year", increment = null } = {}) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [], tickText: [] };
  if (min === max) return { ticks: [min], tickText: [calendarTickText(min, 1, granularity)] };
  const fit = Math.max(2, periodLabelCount(width));
  const label = (ticks, step) => ({ ticks, tickText: ticks.map((tick) => calendarTickText(tick, step, granularity)) });
  if (Number.isFinite(increment) && increment > 0) {
    const ticks = alignedTicks(min, max, increment);
    if (ticks.length >= 2 && ticks.length - 1 <= MAX_INCREMENT_INTERVALS) return label(ticks, increment);
  }
  // "Jan 2010" and "Q1 2010" are about twice as wide as "2010".
  const subYearFit = Math.max(2, Math.floor(fit / 2));
  for (const step of [...(SUB_YEAR_STEPS[granularity] || []), ...YEAR_STEPS]) {
    const ticks = alignedTicks(min, max, step);
    if (ticks.length <= (step < 1 ? subYearFit : fit) && ticks.length >= 2) return label(ticks, step);
    if (ticks.length < 2 && step >= 1) break;
  }
  return label([min, max], SUB_YEAR_STEPS[granularity] ? 1 / 12 : 1);
}
