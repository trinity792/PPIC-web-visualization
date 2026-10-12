import { expect, it } from "vitest";
import { adaptObservations } from "@/lib/visualization/adapters";
import { input } from "@/tests/fixtures/visualization-v3/renderer";
// Owner decisions 2026-10-12 (renderer plan L): maps color places by discrete
// class (quantile, 5 by default) as PPIC's published maps do, with Continuous
// as a choice; the key is drawn by ChartKey in the PPIC frame, not by Plotly's
// colorbar. The fixture's two places hold 50,000 and 2,520,000; the class
// cases use ten places valued 10 to 100, enough for five quantile classes.
const GUIDE_MAP_CLASSES = ["#ECE8E7", "#FFCEBD", "#E9632A", "#CA4F1A", "#8F3811"];
function tenPlaces(type, appearance = {}) {
  const base = input(type);
  const row = base.observations[0];
  const observations = Array.from({ length: 10 }, (_, index) => ({ ...row, geographyId: `06${index}`, geographyLabel: `Place ${index}`, value: (index + 1) * 10 }));
  const points = Object.fromEntries(observations.map(entry => [entry.geographyId, [-120, 36]]));
  return { ...base, observations, appearance, geometry: type === "symbolMap" ? { geojson: base.geometry.geojson, points } : base.geometry };
}
it.each(["choroplethMap", "symbolMap"])("uses Inter and the guide's colors: %s", type => {
  const figure = adaptObservations(input(type));
  expect(figure.layout.font).toMatchObject({ family: "Inter, sans-serif", color: "#6C7075" });
  if(type === "symbolMap") expect(figure.data[0].line).toMatchObject({ color: "#6C7075", width: 1 });
});
it("defaults to the guide's five orange map classes", () => {
  const figure = adaptObservations(tenPlaces("choroplethMap"));
  expect(figure.key.entries.map(entry => entry.color)).toEqual(GUIDE_MAP_CLASSES);
  // z keeps the real values; the stepped scale colors each by its class.
  expect(figure.data[0].z).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  expect(figure.data[0].colorscale[0]).toEqual([0, "#ECE8E7"]);
  expect(figure.data[0].colorscale.at(-1)).toEqual([1, "#8F3811"]);
  expect(figure.data[0].showscale).toBe(false);
});
it("draws the guide's orange ramp when Continuous is chosen", () => {
  const scale = adaptObservations(tenPlaces("choroplethMap", { classification: "continuous" })).data[0].colorscale;
  expect(scale).toEqual([[0, "#ECE8E7"], [0.25, "#FFCEBD"], [0.5, "#E9632A"], [0.75, "#CA4F1A"], [1, "#8F3811"]]);
});
it("labels classes as the guide's key does", () => {
  const figure = adaptObservations(tenPlaces("choroplethMap"));
  expect(figure.key.entries.map(entry => entry.label)).toEqual(["< 30", "30 – 49", "50 – 69", "70 – 89", "> 89"]);
  expect(figure.key.title).toBe("Population");
});
it("draws the chosen number of classes", () => {
  const figure = adaptObservations(tenPlaces("choroplethMap", { bins: 3 }));
  expect(figure.key.entries.map(entry => entry.color)).toEqual(["#ECE8E7", "#E9632A", "#8F3811"]);
});
it.each(["choroplethMap", "symbolMap"])("reverses the ramp when Invert is on: %s", type => {
  const figure = adaptObservations(input(type, { appearance: { symbolGradient: true, classification: "continuous", colorScale: "diverging", divergingStops: ["#8F3811", "#ECE8E7", "#0F4880"], invertScale: true } }));
  const trace = figure.data.at(-1);
  expect(type === "symbolMap" ? trace.marker.colorscale : trace.colorscale).toEqual([[0,"#0F4880"],[0.5,"#ECE8E7"],[1,"#8F3811"]]);
  const classed = adaptObservations(tenPlaces(type, { symbolGradient: true, invertScale: true }));
  expect(classed.key.entries.map(entry => entry.color)).toEqual([...GUIDE_MAP_CLASSES].reverse());
});
it("colors symbols by value when Color gradient is on", () => {
  const gradient = adaptObservations(input("symbolMap", { appearance: { symbolGradient: true } })).data.at(-1).marker;
  const flat = adaptObservations(input("symbolMap", { appearance: { symbolGradient: false } })).data.at(-1).marker;
  const continuous = adaptObservations(input("symbolMap", { appearance: { symbolGradient: true, classification: "continuous" } })).data.at(-1).marker;
  expect(gradient.color).toEqual(["#ECE8E7", "#8F3811"]);
  expect(continuous.color).toEqual([50000, 2520000]);
  expect(flat.color).toBeTypeOf("string");
  expect(adaptObservations(input("symbolMap", { appearance: { symbolGradient: false } })).key).toBeNull();
});
it.each(["choroplethMap", "symbolMap"])("formats the color scale key with the chosen decimal places: %s", type => {
  const appearance = { symbolGradient: true, decimalPlaces: 1, verticalNumberType: "number" };
  expect(adaptObservations(tenPlaces(type, appearance)).key.entries[0].label).toBe("< 30.0");
  const continuous = adaptObservations(tenPlaces(type, { ...appearance, classification: "continuous" })).key.scale;
  expect([continuous.minLabel, continuous.maxLabel]).toEqual(["10.0", "100.0"]);
});
// Plotly's fitbounds fits a map inside the world's 2:1 frame, leaving empty
// bands; explicit ranges make the frame the places' own shape (2026-10-12).
it.each(["choroplethMap", "symbolMap"])("fits the map frame to the drawn places: %s", type => {
  const geo = adaptObservations(input(type)).layout.geo;
  expect(geo.projection).toEqual({ type: "mercator" });
  expect(geo.fitbounds).toBeUndefined();
  // The fixture's two counties span longitudes -123 to -118 and latitudes 34 to 38.
  expect(geo.lonaxis.range[0]).toBeLessThan(-123);
  expect(geo.lonaxis.range[1]).toBeGreaterThan(-118);
  expect(geo.lataxis.range[0]).toBeLessThan(34);
  expect(geo.lataxis.range[1]).toBeGreaterThan(38);
});
// Advanced Mode custom breaks (owner, 2026-10-12): the reader's own values
// set the classes; breaks that do not fit the class count fall back to quantiles.
it("draws the reader's custom class breaks", () => {
  const figure = adaptObservations(tenPlaces("choroplethMap", { classification: "custom", bins: 3, classBreaks: [25, 75] }));
  expect(figure.key.breaks).toEqual([25, 75]);
  expect(figure.key.entries.map(entry => entry.label)).toEqual(["< 25", "25 – 74", "> 74"]);
  const misfit = adaptObservations(tenPlaces("choroplethMap", { classification: "custom", bins: 3, classBreaks: [25] }));
  expect(misfit.key.breaks).toEqual(adaptObservations(tenPlaces("choroplethMap", { bins: 3 })).key.breaks);
});
// The frame sizes the drawing to the map so the key sits beside it.
it("reports the map's own shape", () => {
  expect(adaptObservations(input("choroplethMap")).aspectRatio).toBeGreaterThan(0);
});
