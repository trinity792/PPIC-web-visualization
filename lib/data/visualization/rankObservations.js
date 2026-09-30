import { OBSERVATION_STATUS } from "@/lib/visualization/observationContract";

/**
 * Top or Bottom N, over the values the reader will see.
 *
 * What is ranked is each series: every row that shares a comparison, place,
 * and category, whatever its period. A line chart's place therefore keeps all
 * of its years, and is ranked by its latest available value; ranking single
 * place-year rows instead kept the N largest values across every year, so a
 * ranked line lost its early years. With one period per series (a bar chart,
 * a snapshot) each series is one row, and the ranking is exactly the row
 * ranking it has always been.
 *
 * A series with no available value at all is excluded, never ranked as zero.
 * Ties break by `labelKey`, so the order is the same on every run.
 */

/**
 * Rows of one series share everything but the period. A row with no period is
 * not part of a time series (an unbound snapshot), so it stays its own entry
 * rather than being merged with its namesakes.
 */
function seriesKey(row, index) {
  if (row.period === null || row.period === undefined || row.period === "") return `row:${index}`;
  return [
    row.comparisonId ?? "",
    row.geographyId ?? row.geographyLabel ?? "",
    row.categoryId ?? row.categoryLabel ?? "",
  ].join("\u0000");
}

function comparePeriods(left, right) {
  return String(left.period ?? "").localeCompare(String(right.period ?? ""), undefined, {
    numeric: true,
  });
}

function isAvailable(row) {
  return row.status === OBSERVATION_STATUS.AVAILABLE && Number.isFinite(row.value);
}

export function rankObservations(observations, {
  direction = "top",
  n = observations.length,
  labelKey = "comparisonLabel",
  includeUnranked = false,
} = {}) {
  const groups = new Map();
  observations.forEach((row, index) => {
    const key = seriesKey(row, index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...row });
  });

  const series = [...groups.values()].map((rows) => {
    const ordered = [...rows].sort(comparePeriods);
    const latest = [...ordered].reverse().find(isAvailable) || null;
    return { rows: ordered, latest, label: String(ordered[0]?.[labelKey] || "") };
  });
  const rankable = series.filter((entry) => entry.latest);
  const unavailable = series
    .filter((entry) => !entry.latest)
    .sort((a, b) => a.label.localeCompare(b.label));
  rankable.sort((a, b) => {
    const numeric =
      direction === "bottom" ? a.latest.value - b.latest.value : b.latest.value - a.latest.value;
    return numeric || a.label.localeCompare(b.label);
  });

  const count = Math.max(0, n);
  const selected = rankable.slice(0, count).flatMap((entry, index) =>
    entry.rows.map((row) => ({ ...row, rank: index + 1, inRankedSet: true })),
  );
  const remainder = rankable.slice(count).flatMap((entry) =>
    entry.rows.map((row) => ({ ...row, rank: null, inRankedSet: false })),
  );
  const excluded = unavailable.flatMap((entry) =>
    entry.rows.map((row) => ({ ...row, rank: null, inRankedSet: false })),
  );
  return {
    rows: selected,
    excluded,
    ...(includeUnranked ? { all: [...selected, ...remainder, ...excluded] } : {}),
  };
}
