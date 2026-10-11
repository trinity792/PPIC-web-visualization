import { expect, it } from "vitest";
import { input, lineRows } from "@/tests/fixtures/visualization-v3/renderer";

import { buildPieModel } from "@/lib/visualization/models/pieModel";
import { adaptObservations } from "@/lib/visualization/adapters";
it("gives each slice the same color the Plotly pie gives it", () => {
  const fixture = input("pie", { observations: lineRows.filter(r => r.period === 2025) });
  expect(buildPieModel(fixture).slices.map(s => s.color)).toEqual(["#CA4F1A", "#293B54"]);
  expect(adaptObservations(fixture).data[0].marker.colors).toEqual(["#CA4F1A", "#293B54"]);
});
it("leaves out a missing slice rather than drawing it as zero", () => expect(buildPieModel(input("pie")).slices.map(s => [s.label,s.value])).toEqual([["0-4",3000],["5-9",3500]]));
it("orders and hides slices as chosen", () => expect(buildPieModel(input("pie", { appearance: { categoryOrder: ["5-9", "0-4", "10-14"], hiddenCategories: ["0-4"] } })).slices.map(s => s.label)).toEqual(["5-9"]));
it("labels every slice even when an old showValueLabels setting is false", () => expect(buildPieModel(input("pie", { appearance: { showValueLabels: false } })).slices.every(s => typeof s.valueLabel === "string" && s.valueLabel.length > 0)).toBe(true));
it("draws a full pie when no hole is saved", () => expect(buildPieModel(input("pie")).hole).toBe(0));
it.each([0, 0.4, 0.6])("draws a donut at the chosen hole size: %s", hole => expect(buildPieModel(input("pie", { appearance: { hole } })).hole).toBe(hole));

// Owner review, 2026-10-10: a module pie of one comparison across several
// regions drew every slice as "Selected locations", all in one color.
const regionRows = ["Bay Area", "Central Coast", "Far North"].map((place, i) => ({
  ...lineRows[0], period: 2025, comparisonId: "selected", comparisonLabel: "Selected locations",
  geographyId: `region-${i}`, geographyLabel: place, categoryId: null, categoryLabel: null,
  value: 1000 * (i + 1), status: "available",
}));
const regionInput = () => input("pie", {
  observations: regionRows,
  comparisons: [{ id: "selected", label: "Selected locations", color: "#000000" }],
  presentation: { comparisonPresentation: "slices", activePeriod: 2025 },
});
it("names each place slice by its place when one comparison spans several places", () => {
  expect(buildPieModel(regionInput()).slices.map(s => s.label)).toEqual(["Bay Area", "Central Coast", "Far North"]);
  expect(adaptObservations(regionInput()).data[0].labels).toEqual(["Bay Area", "Central Coast", "Far North"]);
});
it("gives each place slice its own color, not the comparison's", () => {
  const colors = buildPieModel(regionInput()).slices.map(s => s.color);
  expect(new Set(colors).size).toBe(3);
  expect(colors).not.toContain("#000000");
});
