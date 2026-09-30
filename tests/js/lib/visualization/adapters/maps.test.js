import { expect, it } from "vitest";
import { adaptObservations } from "@/lib/visualization/adapters";
import { input } from "@/tests/fixtures/visualization-v3/renderer";
it.each(["choroplethMap", "symbolMap"])("uses Inter and the guide's colors: %s", type => {
  const figure = adaptObservations(input(type));
  expect(figure.layout.font).toMatchObject({ family: "Inter, sans-serif", color: "#6C7075" });
  if(type === "symbolMap") expect(figure.data[0].line).toMatchObject({ color: "#6C7075", width: 1 });
});
it("defaults to the orange sequential ramp", () => {
  const scale = adaptObservations(input("choroplethMap")).data[0].colorscale;
  expect(scale[0]).toEqual([0, "#F9E1D9"]);
  expect(scale.at(-1)).toEqual([1, "#8F3811"]);
});
it.each(["choroplethMap", "symbolMap"])("reverses the ramp when Invert is on: %s", type => {
  const figure = adaptObservations(input(type, { appearance: { symbolGradient: true, colorScale: "diverging", divergingStops: ["#8F3811", "#ECE8E7", "#0F4880"], invertScale: true } }));
  const trace = figure.data.at(-1);
  expect(type === "symbolMap" ? trace.marker.colorscale : trace.colorscale).toEqual([[0,"#0F4880"],[0.5,"#ECE8E7"],[1,"#8F3811"]]);
});
it("colors symbols by value when Color gradient is on", () => {
  const gradient = adaptObservations(input("symbolMap", { appearance: { symbolGradient: true } })).data.at(-1).marker;
  const flat = adaptObservations(input("symbolMap", { appearance: { symbolGradient: false } })).data.at(-1).marker;
  expect(gradient.color).toEqual([50000,2520000]);
  expect(gradient.showscale).toBe(true);
  expect(flat.color).toBeTypeOf("string");
  expect(flat.showscale).toBe(false);
});
it.each(["choroplethMap", "symbolMap"])("formats the color scale key with the chosen decimal places: %s", type => {
  const trace = adaptObservations(input(type, { appearance: { symbolGradient: true, decimalPlaces: 1, verticalNumberType: "number" } })).data.at(-1);
  expect((type === "symbolMap" ? trace.marker : trace).colorbar).toMatchObject({ tickformat: ",.1f" });
});
