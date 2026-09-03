import { OBSERVATION_STATUS } from "@/lib/visualization/observationContract";

export function rankObservations(observations, {
  direction = "top",
  n = observations.length,
  labelKey = "comparisonLabel",
  includeUnranked = false,
} = {}) {
  const cloned = observations.map((row) => ({ ...row }));
  const available = cloned.filter(
    (row) => row.status === OBSERVATION_STATUS.AVAILABLE && Number.isFinite(row.value),
  );
  const unavailable = cloned
    .filter((row) => row.status !== OBSERVATION_STATUS.AVAILABLE || !Number.isFinite(row.value))
    .sort((a, b) => String(a[labelKey] || "").localeCompare(String(b[labelKey] || "")));
  available.sort((a, b) => {
    const numeric = direction === "bottom" ? a.value - b.value : b.value - a.value;
    return numeric || String(a[labelKey] || "").localeCompare(String(b[labelKey] || ""));
  });
  const selected = available.slice(0, Math.max(0, n)).map((row, index) => ({
    ...row,
    rank: index + 1,
    inRankedSet: true,
  }));
  const remainder = available.slice(Math.max(0, n)).map((row) => ({
    ...row,
    rank: null,
    inRankedSet: false,
  }));
  const excluded = unavailable.map((row) => ({ ...row, rank: null, inRankedSet: false }));
  return {
    rows: selected,
    excluded,
    ...(includeUnranked ? { all: [...selected, ...remainder, ...excluded] } : {}),
  };
}
