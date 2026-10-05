/**
 * Workstream Q - lib/visualization/pairOutcomes.js.
 *
 * A module scatter's rows arrive one per measure: y rows untagged, the others
 * tagged `measureRole: "x"` / `"size"`. This helper groups them back into one
 * point per comparison, place, category, and period, for both renderers.
 *
 * Interpretation of the plan: `pairOutcomes(rows)` returns every group with
 * each role's `{ value, status }`; `pairOutcomes(rows, { required: ["x"] })`
 * returns only groups whose required roles are available, which is how the
 * chart models leave a point out rather than draw it at zero.
 */

import { describe, expect, it } from "vitest";

import { pairOutcomes } from "@/lib/visualization/pairOutcomes";
import { tableToObservations } from "@/lib/tabular/toObservations";

const base = {
  comparisonId: "cmp_all",
  comparisonLabel: "All",
  categoryId: null,
  categoryLabel: null,
  period: 2025,
  valueKind: "observed",
  calculation: { id: "actual", params: {} },
  includedPeriods: null,
  source: "ACS",
};

const row = (county, measureId, value, extra = {}) => ({
  ...base,
  geographyId: county,
  geographyLabel: county,
  measureId,
  measureLabel: measureId,
  unit: "number",
  value,
  status: value === null ? "suppressed" : "available",
  ...extra,
});

const MODULE_ROWS = [
  row("Alameda", "Population", 1600000),
  row("Alameda", "Share", 20, { measureRole: "x" }),
  row("Alameda", "Rent", 2400, { measureRole: "size" }),
  row("Fresno", "Population", 1000000),
  row("Fresno", "Share", 45, { measureRole: "x" }),
  row("Fresno", "Rent", 1300, { measureRole: "size" }),
];

describe("pairOutcomes", () => {
  it("pairs each place's measures into one point", () => {
    const points = pairOutcomes(MODULE_ROWS);

    expect(points).toHaveLength(2);
    const alameda = points.find((point) => point.geographyId === "Alameda");
    expect(alameda).toMatchObject({
      comparisonId: "cmp_all",
      geographyId: "Alameda",
      period: 2025,
      y: { value: 1600000, status: "available" },
      x: { value: 20, status: "available" },
      size: { value: 2400, status: "available" },
    });
    const fresno = points.find((point) => point.geographyId === "Fresno");
    expect(fresno).toMatchObject({
      y: { value: 1000000, status: "available" },
      x: { value: 45, status: "available" },
    });
  });

  it("keeps different periods and comparisons as different points", () => {
    const later = MODULE_ROWS.slice(0, 2).map((entry) => ({ ...entry, period: 2030 }));
    const other = MODULE_ROWS.slice(0, 2).map((entry) => ({ ...entry, comparisonId: "cmp_two" }));
    const points = pairOutcomes([...MODULE_ROWS.slice(0, 2), ...later, ...other]);

    expect(points).toHaveLength(3);
    expect(points.map((point) => `${point.comparisonId}|${point.period}`).sort()).toEqual([
      "cmp_all|2025",
      "cmp_all|2030",
      "cmp_two|2025",
    ]);
  });

  it("leaves out a point whose horizontal value is missing or suppressed", () => {
    const rows = [
      row("Alameda", "Population", 1600000),
      row("Alameda", "Share", 20, { measureRole: "x" }),
      row("Marin", "Population", 260000),
      row("Marin", "Share", null, { measureRole: "x" }),
      row("Napa", "Population", 140000),
      // Napa has no x row at all: missing, not suppressed.
    ];

    // Each point keeps the status that explains why it cannot be drawn.
    const all = pairOutcomes(rows);
    expect(all).toHaveLength(3);
    expect(all.find((point) => point.geographyId === "Marin").x.status).toBe("suppressed");
    expect(all.find((point) => point.geographyId === "Napa").x.status).toBe("missing");

    const drawable = pairOutcomes(rows, { required: ["x"] });
    expect(drawable.map((point) => point.geographyId)).toEqual(["Alameda"]);
  });

  it("leaves out a bubble with no size when size is required", () => {
    const rows = [
      row("Alameda", "Population", 1600000),
      row("Alameda", "Share", 20, { measureRole: "x" }),
      row("Alameda", "Rent", null, { measureRole: "size" }),
    ];
    expect(pairOutcomes(rows, { required: ["x", "size"] })).toEqual([]);
    expect(pairOutcomes(rows, { required: ["x"] })).toHaveLength(1);
  });

  it("pairs pasted and module rows the same way", () => {
    const table = {
      columns: [
        { name: "Region", type: "text" },
        { name: "Population", type: "number" },
        { name: "Share", type: "number" },
      ],
      rows: [
        ["North", "100", "0.4"],
        ["South", "80", "0.35"],
      ],
    };
    const pasted = tableToObservations(table, {
      chartType: "scatter",
      bindings: { x: "Share", y: "Population", unit: "Region" },
      measure: { id: "Population" },
    });
    const pastedPoints = pairOutcomes(pasted);

    const moduleRows = [
      row("North", "Population", 100, { categoryId: "North", categoryLabel: "North", period: null }),
      row("North", "Share", 0.4, { measureRole: "x", categoryId: "North", categoryLabel: "North", period: null }),
      row("South", "Population", 80, { categoryId: "South", categoryLabel: "South", period: null }),
      row("South", "Share", 0.35, { measureRole: "x", categoryId: "South", categoryLabel: "South", period: null }),
    ];
    const moduleSummary = pairOutcomes(moduleRows).map((point) => [
      point.categoryLabel,
      point.y.value,
      point.x.value,
    ]);

    expect(pastedPoints.map((point) => [point.categoryLabel, point.y.value, point.x.value])).toEqual(
      moduleSummary,
    );
    expect(moduleSummary).toEqual([
      ["North", 100, 0.4],
      ["South", 80, 0.35],
    ]);
  });
});
