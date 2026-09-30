import { expect, it } from "vitest";
import * as defaults from "@/lib/visualization/plotlyDefaults";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";
it("Plotly font and grid come from chartStyle", () => {
  expect(defaults.PLOTLY_FONT.family).toBe(CHART_STYLE.text.axis.fontFamily);
  expect(defaults.PLOTLY_GRID_COLOR).toBe(CHART_STYLE.graphLine.color);
  expect(defaults.PLOTLY_GRID_COLOR).toBe("#6C7075");
});
it("keeps its existing export names", () => {
  expect(defaults.PLOTLY_FONT).toMatchObject({ family: "Inter, sans-serif" });
  expect(defaults.PLOTLY_FONT_FAMILY).toBe("Inter, sans-serif");
  expect(defaults.legendFor).toBeTypeOf("function");
});
