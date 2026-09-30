import { expect, it } from "vitest";
import { input, gapRows, comparisons } from "@/tests/fixtures/visualization-v3/renderer";

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
