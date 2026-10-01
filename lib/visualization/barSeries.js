/**
 * barSeries.js — the series a bar chart draws, one per visible comparison and
 * period.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Shared by the Plotly bar adapter (lib/visualization/adapters) and the visx
 * bar model (lib/visualization/models/barModel.js), so both renderers draw the
 * same series, in the same order, with the same names, and — through
 * `colorsForLineSeries` — the same colors. A chart never changes color when
 * its renderer changes.
 *
 * Exports:
 *   barComparisons(observations, comparisons, presentation) — the visible
 *     comparisons that have rows
 *   barSeries(observations, comparisons, presentation) — [{ id, comparison,
 *     comparisonId, period, label, rows }], comparisons in order, periods
 *     ascending within each
 *
 * Data sources:
 *   - adaptObservations input (observations, comparisons, presentation)
 */

import { visibleComparisons } from "./lineSeries";

function byPeriod(left, right) {
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

export function barComparisons(observations = [], comparisons = [], presentation = {}) {
  const available = (comparisons.length
    ? comparisons
    : [{ id: observations[0]?.comparisonId, label: observations[0]?.comparisonLabel }]
  ).filter((comparison) => observations.some((row) => row.comparisonId === comparison.id));
  return visibleComparisons(available, presentation);
}

export function barSeries(observations = [], comparisons = [], presentation = {}) {
  const visible = barComparisons(observations, comparisons, presentation);
  const periodCount = new Set(
    observations
      .filter((row) => visible.some((comparison) => comparison.id === row.comparisonId))
      .map((row) => row.period),
  ).size;
  return visible.flatMap((comparison) => {
    const periodGroups = new Map();
    for (const row of observations) {
      if (row.comparisonId !== comparison.id) continue;
      if (!periodGroups.has(row.period)) periodGroups.set(row.period, []);
      periodGroups.get(row.period).push(row);
    }
    return [...periodGroups.entries()]
      .sort(([left], [right]) => byPeriod(left, right))
      .map(([period, rows]) => {
        const comparisonLabel = comparison.customLabel || comparison.label || comparison.id;
        const label =
          periodCount > 1
            ? visible.length > 1
              ? `${comparisonLabel} · ${period}`
              : String(period)
            : rows[0]?.comparisonLabel || comparisonLabel;
        return {
          id: `${comparison.id}::${period}`,
          comparison: {
            ...comparison,
            // One explicit comparison colour cannot distinguish several year
            // traces. Multi-year bars therefore use the rendered-series
            // palette, while a one-year bar retains the comparison override.
            color: periodCount > 1 ? null : comparison.color,
          },
          comparisonId: comparison.id,
          period,
          label,
          rows,
        };
      });
  });
}
