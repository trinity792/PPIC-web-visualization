import { expect, it } from "vitest";
import { input, lineRows, gapRows, observations, comparisons } from "@/tests/fixtures/visualization-v3/renderer";
import { officialComparisonColor, seriesColor } from "@/lib/visualization/palettes";

import { buildRangeModel } from "@/lib/visualization/models/rangeModel";
it("draws the connector from the start value to the end value", () => {
  const model = buildRangeModel(input("dumbbell", { observations: [lineRows[2], lineRows[0]], comparisons: [comparisons[0]], periods: [2020,2030] }));
  expect(model.rows[0]).toMatchObject({ start: { period: 2020, value: 40000 }, end: { period: 2030, value: 60000 }, connector: { from: 40000, to: 60000 } });
});
it("keeps a row with one missing endpoint, without a connector", () => {
  const model = buildRangeModel(input("dumbbell", { observations: gapRows.filter(r => r.geographyId === "06075" && r.period !== 2030), comparisons: [comparisons[2]], periods: [2020,2025] }));
  expect(model.rows).toHaveLength(1);
  expect(model.rows[0]).toMatchObject({ start: { value: 10000 }, end: { value: null }, connector: null });
});
it("opens an old view with showValueAxis false as hideXAxis true", () => expect(buildRangeModel(input("dumbbell", { appearance: { showValueAxis: false } })).valueAxis.visible).toBe(false));
it("lets the explicit hideXAxis setting win over the old name", () => expect(buildRangeModel(input("dumbbell", { appearance: { showValueAxis: false, hideXAxis: false } })).valueAxis.visible).toBe(true));

// ── Added with the Workstream F build (2026-10-01) ──
// Owner, 2026-10-01 (PPIC range references): each end has its own color.
it("colors the start Navy and the end Orange on every row", () => {
  const model = buildRangeModel(input("dumbbell"));
  expect(model.ends).toEqual({ start: { label: "2020", color: officialComparisonColor("Navy") }, end: { label: "2030", color: officialComparisonColor("Orange") } });
  expect(model.rows[0]).not.toHaveProperty("color");
});
it("takes the two end colors from a chosen categorical palette", () => {
  const appearance = { palette: "brand-categorical" };
  const model = buildRangeModel(input("dumbbell", { appearance }));
  expect([model.ends.start.color, model.ends.end.color]).toEqual([seriesColor(appearance, "2020", 0), seriesColor(appearance, "2030", 1)]);
});
it("groups rows by location when there are several comparisons and locations", () => {
  const model = buildRangeModel(input("dumbbell", { observations: observations.filter(r => r.comparisonId !== "black"), periods: [2020,2030] }));
  expect(model.groups).toEqual([{ label: "San Francisco", start: 0, end: 1 }, { label: "Los Angeles", start: 2, end: 3 }]);
  expect(model.rows.map(r => r.label)).toEqual(["Latina Women", "White Women", "Latina Women", "White Women"]);
});
it("labels rows by location with one comparison, without groups", () => {
  const model = buildRangeModel(input("dumbbell", { observations: observations.filter(r => r.comparisonId === "latina"), comparisons: [comparisons[0]] }));
  expect(model.groups).toEqual([]);
  expect(model.rows.map(r => r.label)).toEqual(["San Francisco", "Los Angeles"]);
});
// Owner, 2026-10-01: no Automatic for range charts; the key sits on top.
it("names the two ends in a key above the chart by default", () => {
  expect(buildRangeModel(input("dumbbell")).key).toMatchObject({ position: "top", entries: [{ id: "start", label: "2020", kind: "dot" }, { id: "end", label: "2030", kind: "dot" }] });
  expect(buildRangeModel(input("dumbbell", { appearance: { legendPosition: "automatic" } })).key.position).toBe("top");
  expect(buildRangeModel(input("dumbbell", { appearance: { legendPosition: "bottom" } })).key.position).toBe("bottom");
});
it("asks the frame to fit the drawing", () => expect(buildRangeModel(input("dumbbell")).fitContent).toBe(true));
it("fits the value axis to the data instead of starting at zero", () => {
  const model = buildRangeModel(input("dumbbell"));
  expect(model.valueAxis.domain[0]).toBeGreaterThan(0);
  expect(model.valueAxis.zero).toBe(false);
});
it("marks zero when the axis reaches it", () => {
  const value = input("dumbbell", { observations: lineRows.map(r => ({ ...r, value: r.value - 50000 })) });
  expect(buildRangeModel(value).valueAxis.zero).toBe(true);
});
it.each([["start", ["$40,000"], [null]], ["end", [null], ["$60,000"]], ["both", ["$40,000"], ["$60,000"]]])("labels %s values with Label which end", (ends, start, end) => {
  const model = buildRangeModel(input("dumbbell", { appearance: { showPointLabels: true, pointLabelEnds: ends, horizontalNumberType: "usd", decimalPlaces: 0 } }));
  expect([model.rows[0].start.label]).toEqual(start);
  expect([model.rows[0].end.label]).toEqual(end);
});
it("reads Range style and Value axis position, with dots at the bottom by default", () => {
  expect(buildRangeModel(input("dumbbell"))).toMatchObject({ rangeStyle: "dots", valueAxis: { position: "bottom" } });
  expect(buildRangeModel(input("dumbbell", { appearance: { rangeStyle: "arrow", valueAxisPosition: "top" } }))).toMatchObject({ rangeStyle: "arrow", valueAxis: { position: "top" } });
});
it("left-aligns row labels by default", () => expect(buildRangeModel(input("dumbbell")).rowLabels).toEqual({ groupAlignment: "left", variableAlignment: "left" }));
it("labels each endpoint in the value axis number format", () => {
  const model = buildRangeModel(input("dumbbell", { appearance: { showPointLabels: true, horizontalNumberType: "usd", decimalPlaces: 0 } }));
  expect(model.rows[0].start.label).toBe("$40,000");
  expect(model.rows[0].start.text).toBe("40,000");
});
it("orders rows by the dragged location order", () => {
  const value = input("dumbbell", { observations: observations.filter(r => r.comparisonId === "latina"), comparisons: [comparisons[0]] });
  expect(buildRangeModel(value).rows.map(r => r.label)).toEqual(["San Francisco", "Los Angeles"]);
  value.appearance = { categoryOrder: ["Los Angeles", "San Francisco"] };
  expect(buildRangeModel(value).rows.map(r => r.label)).toEqual(["Los Angeles", "San Francisco"]);
});
it("orders groups by the dragged location order", () => {
  const model = buildRangeModel(input("dumbbell", { observations: observations.filter(r => r.comparisonId !== "black"), periods: [2020,2030], appearance: { categoryOrder: ["Los Angeles"] } }));
  expect(model.groups.map(g => g.label)).toEqual(["Los Angeles", "San Francisco"]);
});
