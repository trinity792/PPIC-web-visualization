import { expect, it } from "vitest";
import { plotClipRect, svgSafeId } from "@/lib/visualization/chartLayout/plotClip";

it("clips nothing when neither axis has a range", () => expect(plotClipRect({ width: 400, height: 300 })).toBeNull());
it("clips a ranged axis at the plot edge, plus the bleed", () => {
  const rect = plotClipRect({ width: 400, height: 300, clipY: true, bleed: 4 });
  expect(rect.y).toBe(-4);
  expect(rect.height).toBe(308);
});
it("leaves the other axis open, so edge markers are never cut", () => {
  const rect = plotClipRect({ width: 400, height: 300, clipY: true });
  expect(rect.x).toBeLessThan(-400);
  expect(rect.x + rect.width).toBeGreaterThan(800);
});
it("clips both axes for a scatter plot with two ranges", () => {
  expect(plotClipRect({ width: 400, height: 300, clipX: true, clipY: true })).toEqual({ x: 0, y: 0, width: 400, height: 300 });
});
it("starts the box at the axis ends when they sit inside the plot", () => {
  expect(plotClipRect({ left: 12, top: 8, width: 380, height: 280, clipX: true, clipY: true, bleed: 2 })).toEqual({ x: 10, y: 6, width: 384, height: 284 });
});
it("makes React ids safe inside url(#…)", () => expect(svgSafeId("plot-clip", ":r1:")).toBe("plot-clip-r1"));
