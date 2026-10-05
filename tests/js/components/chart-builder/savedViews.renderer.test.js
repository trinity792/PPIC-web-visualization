import { expect, it } from "vitest";
import { deserialize, serialize, saveView, listViews } from "@/components/chart-builder/savedViews";
import { config, schema } from "@/tests/fixtures/visualization-v3/renderer";
// These are pre-renderer v3 views, not the intentionally unsupported v1/v2.
const OLD_VIEWS = [
  ["line", { markerMode: "on" }], ["bar", { diverging: true, orientation: "horizontal" }],
  ["dumbbell", { showValueAxis: false }], ["dotPlot", { markerSize: 12 }],
  ["forest", { endpointStyle: "caps", noEffectValue: 0 }], ["heatmap", { colorScale: "sequential" }],
  ["scatter", {}], ["bubble", { sizeByArea: false }], ["pie", { hole: 0.4 }],
  ["choroplethMap", { invertScale: true }], ["symbolMap", { symbolGradient: true }], ["dataTable", {}],
];
it.each(OLD_VIEWS)("opens a view saved before this plan for every chart type: %s", (type, appearance) => {
  const view = deserialize(JSON.stringify(config(type, appearance)), schema);
  expect(view).not.toHaveProperty("ok", false);
  expect(view.presentation.chartType).toBe(type);
  expect(view.question.comparisons[0].id).toBe("latina");
});
it("ignores removed settings in an old view", () => {
  const view = config("line", { showLegend: false, legendLabels: { "Latina Women": "Wrong" }, hiddenSeries: ["Latina Women"], seriesColors: { "Latina Women": "#000000" } });
  view.presentation.labels.tooltip = "%{y}";
  const restored = deserialize(JSON.stringify(view), schema);
  expect(restored).not.toHaveProperty("ok", false);
  expect(restored.question.comparisons[0]).toMatchObject({ customLabel: "Latina Women", color: "Orange" });
  // The drawing-side no-effect assertion lives in settingsCoverage.test.js;
  // preserving inert legacy keys here is allowed by the plan.
  expect(restored.presentation.comparisonVisibility?.latina).not.toBe(false);
});
it.each(["dumbbell", "dotPlot", "forest"])("keeps hidden settings through save and reopen: %s", type => {
  const original = config(type, { groupLabelIndent: 17, variableLabelIndent: 23 });
  saveView("Legacy indentation", original);
  const stored = listViews().find(v => v.name === "Legacy indentation");
  expect(stored).toBeDefined();
  const restored = deserialize(serialize(stored.config), schema);
  expect(restored.presentation.appearance).toMatchObject({ groupLabelIndent: 17, variableLabelIndent: 23 });
});
it.each(["dumbbell", "dotPlot", "forest"])("opens a view with showValueAxis false as hideXAxis true: %s", type => {
  const restored = deserialize(JSON.stringify(config(type, { showValueAxis: false })), schema);
  expect(restored.presentation.appearance.hideXAxis).toBe(true);
});
it("keeps dashedRange through save and reopen", () => {
  const original = config("line", { dashedRange: { from: 2025, to: 2030, label: "Projected" } });
  const restored = deserialize(serialize(original), schema);
  expect(restored.presentation.appearance.dashedRange).toEqual({ from: 2025, to: 2030, label: "Projected" });
});

it.each(["scatter", "bubble"])("preserves %s measures in saved, shared, and embedded views", async type => {
  const { serializeWorkspace, deserializeWorkspace } = await import("@/components/chart-builder/savedViews");
  const original = config(type);
  saveView(`Q ${type}`, original);
  const stored = listViews().find(view => view.name === `Q ${type}`);
  expect(deserialize(serialize(stored.config), schema).question.outcomes).toEqual(original.question.outcomes);

  const shared = new URL(`https://example.test/?view=${encodeURIComponent(serialize(original))}`);
  expect(deserialize(shared.searchParams.get("view"), schema).question.outcomes).toEqual(original.question.outcomes);
  const embed = new URL(`https://example.test/?embed=1&view=${encodeURIComponent(serializeWorkspace({ charts: [original], activeChartId: 0 }))}`);
  expect(deserializeWorkspace(embed.searchParams.get("view"), schema).charts[0].question.outcomes).toEqual(original.question.outcomes);
});

it("migrates an old single-outcome saved view and link without changing its chart", () => {
  const old = config("line");
  old.question.outcome = { measureId: "Population", unit: "people" };
  delete old.question.outcomes;
  const link = new URL(`https://example.test/?view=${encodeURIComponent(JSON.stringify(old))}`);
  const restored = deserialize(link.searchParams.get("view"), schema);
  expect(restored.presentation).toEqual(old.presentation);
  expect(restored.question.outcomes).toEqual([{ role: "y", measureId: "Population", unit: "people" }]);
  expect(JSON.parse(serialize(restored)).question).not.toHaveProperty("outcome");
});
