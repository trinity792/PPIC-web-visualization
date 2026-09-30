import { expect, it } from "vitest";
import { input } from "@/tests/fixtures/visualization-v3/renderer";

import { buildHeatmapModel } from "@/lib/visualization/models/heatmapModel";
import { adaptObservations } from "@/lib/visualization/adapters";
it("uses the same color scale the Plotly heatmap uses", () => {
  const fixture = input("heatmap", { appearance: { colorScale: "diverging", divergingStops: ["#8F3811", "#ECE8E7", "#0F4880"] } });
  const expected = [[0,"#8F3811"],[0.5,"#ECE8E7"],[1,"#0F4880"]];
  expect(buildHeatmapModel(fixture).colorScale).toEqual(expected);
  expect(adaptObservations(fixture).data[0].colorscale).toEqual(expected);
});
it("draws a missing cell as empty, not the lowest color", () => {
  const cell = buildHeatmapModel(input("heatmap")).cells.find(c => c.category === "10-14" && c.period === 2025);
  expect(cell).toMatchObject({ value: null, fill: null });
});
it("reverses the scale when Invert is on", () => expect(buildHeatmapModel(input("heatmap", { appearance: { colorScale: "diverging", divergingStops: ["#8F3811", "#ECE8E7", "#0F4880"], invertScale: true } })).colorScale).toEqual([[0,"#0F4880"],[0.5,"#ECE8E7"],[1,"#8F3811"]]));
it("orders and hides categories as chosen", () => {
  const model = buildHeatmapModel(input("heatmap", { appearance: { categoryOrder: ["5-9", "10-14", "0-4"], hiddenCategories: ["10-14"] } }));
  expect(model.categories).toEqual(["5-9", "0-4"]);
  expect(model.cells.some(c => c.category === "10-14")).toBe(false);
});
