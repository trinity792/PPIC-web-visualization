import { expect, it } from "vitest";
import { adaptObservations } from "@/lib/visualization/adapters";
import { input, lineRows, gapRows } from "@/tests/fixtures/visualization-v3/renderer";
import { rendererVisualScenario } from "@/tests/fixtures/visualization-v3/rendererVisual";

it("uses the shared observed, projected, missing, and suppressed fixture values", () => {
  expect(lineRows.slice(0,3).map(r => [r.period,r.value,r.valueKind])).toEqual([
    [2020,40000,"observed"], [2025,50000,"observed"], [2030,60000,"projected"],
  ]);
  expect(gapRows.filter(r => r.value === null).map(r => [r.geographyId,r.status])).toEqual([
    ["06075","suppressed"], ["06037","missing"],
  ]);
});
it("pins comparison colors independently of the future models", () => {
  for(const [type, colors] of [
    ["line", f => f.data.map(t => t.line.color)],
    ["bar", f => f.data.map(t => t.marker.color)],
    ["dotPlot", f => f.data.map(t => t.marker.color)],
  ]) expect(colors(adaptObservations(input(type)))).toEqual(["#CA4F1A","#293B54"]);
});
it("supplies distinct series for the crowded visual cases", () => {
  const five = rendererVisualScenario("line", "five-lines");
  expect(new Set(five.observations.map(r => `${r.comparisonId}/${r.geographyId}`)).size).toBe(5);
  const eight = rendererVisualScenario("bar", "eight-comparisons");
  expect(eight.comparisons.map(c => c.label)).toEqual(["Group A","Group B","Group C","Group D","Group E","Group F","Group G","Group H"]);
  expect(eight.observations).toHaveLength(8);
});
