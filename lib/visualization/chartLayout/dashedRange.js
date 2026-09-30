/**
 * dashedRange.js — which line segments a saved dashed range draws dashed.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Lines are solid by default, as the style guide asks. A reader can dash a
 * range of periods they choose (`appearance.dashedRange = { from, to, label }`),
 * for example projected years. A segment between two neighbouring periods is
 * dashed when both of its ends fall inside the range, so the segment leading
 * into the range stays solid.
 *
 * Periods are compared by their position in the response's ordered list, never
 * by their text, because period labels are not always numbers ("2019-20").
 *
 * Exports:
 *   validDashedRange(periods, dashedRange) — { from, to, label, start, end } | null
 *   dashedSegments(periods, dashedRange)   — one boolean per segment (periods.length - 1)
 *
 * Data sources:
 *   - The line model's ordered periods and `appearance.dashedRange`
 */

function indexOfPeriod(periods, period) {
  return periods.findIndex((entry) => String(entry) === String(period));
}

/**
 * The saved range with its start and end positions, or null when nothing is set
 * or either end is not a period in the data (an old view after the data moved).
 */
export function validDashedRange(periods = [], dashedRange = null) {
  if (!dashedRange || dashedRange.from == null || dashedRange.to == null) return null;
  const fromIndex = indexOfPeriod(periods, dashedRange.from);
  const toIndex = indexOfPeriod(periods, dashedRange.to);
  if (fromIndex < 0 || toIndex < 0) return null;
  return {
    ...dashedRange,
    start: Math.min(fromIndex, toIndex),
    end: Math.max(fromIndex, toIndex),
  };
}

export function dashedSegments(periods = [], dashedRange = null) {
  const range = validDashedRange(periods, dashedRange);
  return periods.slice(1).map((_, index) =>
    Boolean(range && index >= range.start && index + 1 <= range.end),
  );
}
