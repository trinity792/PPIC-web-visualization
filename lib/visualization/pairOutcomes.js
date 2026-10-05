/**
 * Pair module and pasted observations by comparison, place, category, and period.
 * Each role keeps its own status and metadata. Required unavailable roles omit
 * the point from drawing; callers without requirements can inspect every group.
 * Client-safe and shared by the visx and Plotly point renderers.
 */
export function pairOutcomes(rows = [], { required = [] } = {}) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([
      row.comparisonId,
      row.geographyId ?? row.geographyLabel,
      row.categoryId ?? row.categoryLabel,
      row.period,
    ]);
    if (!groups.has(key)) {
      groups.set(key, {
        ...row,
        y: { value: null, status: "missing" },
        x: { value: null, status: "missing" },
        size: { value: null, status: "missing" },
      });
    }
    const point = groups.get(key);
    const role = row.measureRole || "y";
    if (role === "y") Object.assign(point, row);
    point[role] = {
      value: row.value,
      status: row.status,
      unit: row.unit,
      measureId: row.measureId,
      measureLabel: row.measureLabel,
    };
  }
  return [...groups.values()].filter((point) => required.every(
    (role) => point[role]?.status === "available" && Number.isFinite(point[role].value),
  ));
}
