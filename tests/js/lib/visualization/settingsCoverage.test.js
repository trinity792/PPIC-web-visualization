import { describe, expect, it } from "vitest";
import { buildChartModel } from "@/lib/visualization/models";
import { adaptObservations } from "@/lib/visualization/adapters";
import { input, VISX_TYPES, MAP_TYPES, observations } from "@/tests/fixtures/visualization-v3/renderer";
const SHARED = [
  ["labels.subtitle", "A different subtitle"], ["labels.footnote", "A different note"],
  ["showTitle", false], ["showSubtitle", false], ["showSource", false], ["legendPosition", "bottom"],
  ["titleFontSize", 24], ["subtitleFontSize", 22], ["legendFontSize", 18], ["dataLabelFontSize", 18], ["decimalPlaces", 1],
];
const AXES = [["showXAxisLabel", false], ["showYAxisLabel", false], ["axisFontSize", 18], ["horizontalTickIncrement", 5], ["verticalTickIncrement", 10000]];
const ROWS = [["groupLabelAlignment", "left"], ["variableLabelAlignment", "center"], ["hideXAxis", true], ["showPointLabels", false]];
const TABLE = {
  line: [...SHARED, ...AXES, ["verticalNumberType", "usd"], ["categoryOrder", ["Los Angeles", "San Francisco"]], ["dashedRange", { from: 2025, to: 2030, label: "Forecast" }]],
  bar: [...SHARED, ...AXES.filter(([key]) => key !== "horizontalTickIncrement"), ["horizontalTickIncrement", 10000, { orientation: "horizontal" }], ["verticalNumberType", "usd"], ["horizontalNumberType", "usd", { orientation: "horizontal" }], ["orientation", "horizontal"], ["stackMode", "stacked"], ["groupGap", 2], ["categoryOrder", ["Los Angeles", "San Francisco"]], ["diverging", true], ["center", 60000, { diverging: true }], ["referenceValue", 0, { diverging: true }], ["referenceLabel", "Benchmark", { diverging: true, referenceValue: 0 }], ["valueRange", [-100,3000000], { diverging: true }], ["colorBuckets", [{ at: 60000, color: "Navy" }, { at: null, color: "Orange" }], { diverging: true }],
    // Owner decisions 2026-09-30 (PPIC bar references). Track rail and Minimal
    // axis now work on ordinary bars, so they need no diverging prerequisite.
    ["trackRail", true], ["minimalAxis", true],
    ["showValueLabels", true], ["valueLabelSeries", { "White Women": false }, { showValueLabels: true }],
    // Automatic places labels inside when every one of several series is labeled.
    ["valueLabelPosition", "outside", { showValueLabels: true }],
    ["showStackTotals", true, { stackMode: "stacked" }],
    // Data order is San Francisco first; Los Angeles has the larger values.
    ["sort", "descending"]],
  dumbbell: [...SHARED, ...AXES.filter(([key]) => key !== "verticalTickIncrement"), ...ROWS, ["horizontalNumberType", "usd"], ["pointLabelsFirstLineOnly", true]],
  dotPlot: [...SHARED, ...AXES.filter(([key]) => key !== "verticalTickIncrement"), ...ROWS, ["horizontalNumberType", "usd"], ["pointLabelSeries", { "White Women": false }], ["markerSize", 14]],
  forest: [...SHARED, ...AXES.filter(([key]) => key !== "verticalTickIncrement"), ...ROWS, ["horizontalNumberType", "usd"], ["endpointStyle", "diamonds"], ["pointStyle", "dot"], ["noEffectValue", 0], ["center", 45000]],
  heatmap: [...SHARED, ...AXES.filter(([key]) => !key.endsWith("TickIncrement")), ["invertScale", true], ["categoryOrder", ["5-9", "0-4", "10-14"]], ["hiddenCategories", ["0-4"]], ["showCellValues", false]],
  scatter: [...SHARED, ...AXES, ["horizontalNumberType", "usd"], ["verticalNumberType", "percent"]],
  bubble: [...SHARED, ...AXES, ["horizontalNumberType", "usd"], ["verticalNumberType", "percent"]],
  pie: [...SHARED, ["categoryOrder", ["5-9", "0-4", "10-14"]], ["hiddenCategories", ["0-4"]], ["hole", 0.4]],
  choroplethMap: [...SHARED, ["invertScale", true]],
  symbolMap: [...SHARED, ["invertScale", true, { symbolGradient: true }], ["symbolGradient", true]],
};
function fixture(type, prerequisites = {}) {
  return input(type, {
    ...(type === "line" ? { observations: observations.filter(r => r.comparisonId !== "black") } : {}),
    appearance: { verticalNumberType: "number", horizontalNumberType: "number", showPointLabels: true, showCellValues: true, ...prerequisites },
  });
}
function draw(type, value) {
  return MAP_TYPES.includes(type) ? adaptObservations(value) : buildChartModel(value);
}
// Compare serialized drawing output, so a freshly allocated formatter function
// alone cannot make an inert setting look like it works.
const picture = model => JSON.stringify(model);
for (const [type, rows] of Object.entries(TABLE)) {
  describe(type, () => {
    it.each(rows)(`${type}: %s changes the chart`, (key, value, prerequisites) => {
      const base = fixture(type, prerequisites);
      const changed = key.startsWith("labels.")
        ? { ...base, labels: { ...base.labels, [key.slice(7)]: value } }
        : { ...base, appearance: { ...base.appearance, [key]: value } };
      expect(picture(draw(type, changed))).not.toBe(picture(draw(type, base)));
    });
    it(`${type}: removed and hidden settings are ignored without error`, () => {
      const base = fixture(type);
      const changed = { ...base, labels: { ...base.labels, tooltip: "%{y}" }, appearance: { ...base.appearance, showLegend: false, legendLabels: { "Latina Women": "Wrong" }, hiddenSeries: ["Latina Women"], seriesColors: { "Latina Women": "#000000" }, groupLabelIndent: 99, variableLabelIndent: 99, sizeByArea: false, showValueLabels: false, mirror: true } };
      expect(picture(draw(type, changed))).toBe(picture(draw(type, base)));
    });
  });
}
// Bars along and Color bars by only act when bars show several periods, which
// the one-period bar fixture does not, so these rows draw 2020 and 2025.
const MULTI_PERIOD_BAR = [["categoryAxis", "period"], ["barColorBy", "period"]];
describe("bar, extra cases", () => {
  it.each(MULTI_PERIOD_BAR)("bar: %s changes the chart", (key, value) => {
    const base = { ...fixture("bar"), observations: observations.filter(r => r.comparisonId !== "black" && [2020, 2025].includes(r.period)) };
    const changed = { ...base, appearance: { ...base.appearance, [key]: value } };
    expect(picture(draw("bar", changed))).not.toBe(picture(draw("bar", base)));
  });
  // Its own case, because the table's titles name only the key and
  // stackMode already has a row for "stacked".
  it("bar: stackMode percent changes the chart", () => {
    const base = fixture("bar", { stackMode: "stacked" });
    const changed = { ...base, appearance: { ...base.appearance, stackMode: "percent" } };
    expect(picture(draw("bar", changed))).not.toBe(picture(draw("bar", base)));
  });
});
it("covers every planned drawing family", () => expect(Object.keys(TABLE).sort()).toEqual([...VISX_TYPES, ...MAP_TYPES].sort()));
