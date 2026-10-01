import { expect, it } from "vitest";
import { input, gapRows, comparisons, observations } from "@/tests/fixtures/visualization-v3/renderer";

import { buildBarModel } from "@/lib/visualization/models/barModel";
import { adaptObservations } from "@/lib/visualization/adapters";
it("gives each comparison the same color the Plotly bar chart gives it", () => {
  expect(buildBarModel(input("bar")).series.map(s => s.color)).toEqual(["#CA4F1A", "#293B54"]);
  expect(adaptObservations(input("bar")).data.map(s => s.marker.color)).toEqual(["#CA4F1A", "#293B54"]);
});
it("starts the value axis at zero", () => expect(buildBarModel(input("bar")).valueAxis.domain[0]).toBe(0));
it("keeps missing values as gaps, not zero-height bars", () => {
  const model = buildBarModel(input("bar", { observations: gapRows.filter(r => r.period === 2025), comparisons: [comparisons[2]] }));
  expect(model.bars).toEqual([]);
  expect(model.categories).toEqual(["San Francisco", "Los Angeles"]);
});
it("orders bars by the dragged location order", () => expect(buildBarModel(input("bar", { appearance: { categoryOrder: ["Los Angeles", "San Francisco"] } })).categories).toEqual(["Los Angeles", "San Francisco"]));
it("stacks series dark to light", () => {
  const model = buildBarModel(input("bar", { appearance: { stackMode: "stacked", palette: "ui-kit-blue" } }));
  expect(model.bars.slice(0,2).map(b => [b.start, b.end])).toEqual([[0,50000],[50000,113000]]);
  // Relative luminance uses a local independent formula, not palette code.
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
  };
  expect(luminance(model.series[0].color)).toBeLessThan(luminance(model.series[1].color));
});
it("draws bars from the center value", () => {
  const model = buildBarModel(input("bar", { appearance: { diverging: true, center: 60000 } }));
  expect(model.bars[0]).toMatchObject({ start: 60000, end: 50000 });
  expect(model.bars.find(b => b.value === 63000)).toMatchObject({ start: 60000, end: 63000 });
});
it("uses the manual value axis range", () => expect(buildBarModel(input("bar", { appearance: { diverging: true, valueRange: [-100, 3000000] } })).valueAxis.domain).toEqual([-100,3000000]));
it("colors bars by threshold", () => {
  const model = buildBarModel(input("bar", { appearance: { diverging: true, colorBuckets: [{ at: 60000, color: "Navy" }, { at: null, color: "Orange" }] } }));
  expect(model.bars.find(b => b.value === 50000).color).toBe("#CA4F1A");
  expect(model.bars.find(b => b.value === 63000).color).toBe("#293B54");
});

// ── Added 2026-09-30 (owner decisions from the PPIC bar references) ──
// Fixture values, 2025: San Francisco Latina 50,000 and White 63,000;
// Los Angeles Latina 2,520,000 and White 1,188,000.
const twoPeriods = () => observations.filter(r => r.comparisonId !== "black" && [2020, 2025].includes(r.period));
const row = (geography, comparisonId, value) => ({ ...observations[0], period: 2025, geographyId: geography, geographyLabel: geography, comparisonId, comparisonLabel: comparisonId === "latina" ? "Latina Women" : "White Women", value, status: "available" });
// A leads on totals (110 vs 60), B leads on the first series (50 vs 10).
const crossingRows = [row("A", "latina", 10), row("A", "white", 100), row("B", "latina", 50), row("B", "white", 10)];

it("defaults the key to the top for bar charts", () => {
  expect(buildBarModel(input("bar")).key.position).toBe("top");
  expect(buildBarModel(input("bar", { appearance: { legendPosition: "right" } })).key.position).toBe("right");
});
it("keeps data order when nothing is saved", () => {
  expect(buildBarModel(input("bar")).categories).toEqual(["San Francisco", "Los Angeles"]);
  // Views saved before this change carry the registry's old "value" default.
  expect(buildBarModel(input("bar", { appearance: { sort: "value" } })).categories).toEqual(["San Francisco", "Los Angeles"]);
});
it("sorts largest first and smallest first", () => {
  expect(buildBarModel(input("bar", { appearance: { sort: "descending" } })).categories).toEqual(["Los Angeles", "San Francisco"]);
  const reversed = [...input("bar").observations].reverse();
  expect(buildBarModel(input("bar", { observations: reversed })).categories).toEqual(["Los Angeles", "San Francisco"]);
  expect(buildBarModel(input("bar", { observations: reversed, appearance: { sort: "ascending" } })).categories).toEqual(["San Francisco", "Los Angeles"]);
});
it("sorts stacked bars by their totals", () => {
  expect(buildBarModel(input("bar", { observations: crossingRows, appearance: { sort: "descending" } })).categories).toEqual(["B", "A"]);
  expect(buildBarModel(input("bar", { observations: crossingRows, appearance: { sort: "descending", stackMode: "stacked" } })).categories).toEqual(["A", "B"]);
});
// Owner, 2026-09-30: the order of the bars within each group is the reader's.
it("orders the series within each group by a dragged order, keeping their colors", () => {
  const model = buildBarModel(input("bar", { appearance: { seriesOrder: ["White Women", "Latina Women"] } }));
  expect(model.series.map(s => [s.label, s.color])).toEqual([["White Women", "#293B54"], ["Latina Women", "#CA4F1A"]]);
  expect(model.bars.filter(b => b.slot === 0).map(b => b.seriesId)).toEqual(["white::2025", "latina::2025"]);
  expect(model.key.entries.map(e => e.label)).toEqual(["White Women", "Latina Women"]);
});
it("lets a dragged order win over the sort choice", () => {
  expect(buildBarModel(input("bar", { appearance: { sort: "ascending", categoryOrder: ["Los Angeles", "San Francisco"] } })).categories).toEqual(["Los Angeles", "San Francisco"]);
});
it("stacks each bar to 100 percent", () => {
  const model = buildBarModel(input("bar", { appearance: { stackMode: "percent" } }));
  const sf = model.bars.filter(b => b.category === "San Francisco");
  expect(sf[0].start).toBe(0);
  expect(sf[0].end).toBeCloseTo(44.25, 1); // 50,000 of 113,000
  expect(sf[1].end).toBeCloseTo(100, 6);
  expect(model.valueAxis.domain).toEqual([0, 100]);
});
it("puts periods along the axis when Bars along is Periods", () => {
  const model = buildBarModel(input("bar", { observations: twoPeriods(), appearance: { categoryAxis: "period" } }));
  expect(model.categories).toEqual(["2020", "2025"]);
  expect(model.series.map(s => s.label)).toEqual(["San Francisco Latina Women", "Los Angeles Latina Women", "San Francisco White Women", "Los Angeles White Women"]);
});
it("nests the inner category under each location", () => {
  const byPeriod = buildBarModel(input("bar", { observations: twoPeriods(), appearance: { barColorBy: "period" } }));
  expect(byPeriod.series.map(s => s.label)).toEqual(["2020", "2025"]);
  expect(byPeriod.groups.map(g => g.label)).toEqual(["San Francisco", "Los Angeles"]);
  expect(byPeriod.categories).toEqual(["Latina Women", "White Women", "Latina Women", "White Women"]);
  const byComparison = buildBarModel(input("bar", { observations: twoPeriods(), appearance: { barColorBy: "comparison" } }));
  expect(byComparison.series.map(s => s.label)).toEqual(["Latina Women", "White Women"]);
  expect(byComparison.categories).toEqual(["2020", "2025", "2020", "2025"]);
  expect(byComparison.series.map(s => s.color)).toEqual(["#CA4F1A", "#293B54"]);
});
it("keeps today's series and colors when Color bars by is not saved", () => {
  const value = input("bar", { observations: twoPeriods() });
  const model = buildBarModel(value);
  expect(model.series.map(s => s.label)).toEqual(["Latina Women · 2020", "Latina Women · 2025", "White Women · 2020", "White Women · 2025"]);
  expect(model.groups).toEqual([]);
  expect(model.series.map(s => s.color)).toEqual(adaptObservations(value).data.map(s => s.marker.color));
});
it("labels only the chosen series", () => {
  const model = buildBarModel(input("bar", { appearance: { showValueLabels: true, valueLabelSeries: { "White Women": false } } }));
  const labeled = model.bars.filter(b => b.label);
  expect(labeled.map(b => b.seriesId)).toEqual(["latina::2025", "latina::2025"]);
  expect(labeled.map(b => b.label.text)).toEqual(["50,000", "2,520,000"]);
});
it("places labels outside for one series and inside for several", () => {
  const one = buildBarModel(input("bar", { comparisons: [comparisons[0]], appearance: { showValueLabels: true } }));
  expect(one.bars.map(b => b.label.placement)).toEqual(["outside", "outside"]);
  const several = buildBarModel(input("bar", { appearance: { showValueLabels: true } }));
  expect(several.bars.map(b => b.label.placement)).toEqual(["inside", "inside", "inside", "inside"]);
  const some = buildBarModel(input("bar", { appearance: { showValueLabels: true, valueLabelSeries: { "White Women": false } } }));
  expect(some.bars.filter(b => b.label).map(b => b.label.placement)).toEqual(["outside", "outside"]);
  const chosen = buildBarModel(input("bar", { appearance: { showValueLabels: true, valueLabelPosition: "outside" } }));
  expect(chosen.bars.map(b => b.label.placement)).toEqual(["outside", "outside", "outside", "outside"]);
});
it("labels stacked segments inside", () => {
  const model = buildBarModel(input("bar", { comparisons: [comparisons[0]], appearance: { showValueLabels: true, stackMode: "stacked", valueLabelPosition: "outside" } }));
  expect(model.bars.map(b => b.label.placement)).toEqual(["inside", "inside"]);
});
it("shows a total for each stack", () => {
  const model = buildBarModel(input("bar", { appearance: { stackMode: "stacked", showStackTotals: true } }));
  expect(model.totals.map(t => [t.category, t.value, t.text])).toEqual([["San Francisco", 113000, "113,000"], ["Los Angeles", 3708000, "3,708,000"]]);
  expect(buildBarModel(input("bar", { appearance: { showStackTotals: true } })).totals).toEqual([]);
});
it("gives every bar a stable key", () => {
  expect(buildBarModel(input("bar")).bars.map(b => b.key)).toEqual(["latina|06075|2025", "white|06075|2025", "latina|06037|2025", "white|06037|2025"]);
});
it("ignores a saved mirror setting", () => {
  expect(JSON.stringify(buildBarModel(input("bar", { appearance: { mirror: true } })))).toBe(JSON.stringify(buildBarModel(input("bar"))));
});

// ── Owner, 2026-09-30: one series' key names what the bars measure ──
it("names a single series' key entry after the value axis", () => {
  const one = buildBarModel(input("bar", { comparisons: [comparisons[0]] }));
  expect(one.key.entries.map(e => e.label)).toEqual(["People"]);
  expect(one.valueTitleInKey).toBe(true);
  // With the axis label switched off, the key still says what is measured.
  const unlabeled = buildBarModel(input("bar", { comparisons: [comparisons[0]], appearance: { showYAxisLabel: false } }));
  expect(unlabeled.key.entries.map(e => e.label)).toEqual(["Population"]);
  // Horizontal bars measure along X.
  const horizontal = buildBarModel(input("bar", { comparisons: [comparisons[0]], appearance: { orientation: "horizontal" } }));
  expect(horizontal.key.entries.map(e => e.label)).toEqual(["Year"]);
});
it("keeps series names in the key and the axis title when there are several series or no key", () => {
  const several = buildBarModel(input("bar"));
  expect(several.key.entries.map(e => e.label)).toEqual(["Latina Women", "White Women"]);
  expect(several.valueTitleInKey).toBe(false);
  expect(buildBarModel(input("bar", { comparisons: [comparisons[0]], appearance: { legendPosition: "hidden" } })).valueTitleInKey).toBe(false);
});
