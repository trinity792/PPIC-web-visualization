import { expect, it } from "vitest";
import { contrastRatio, readableTextColor } from "@/lib/visualization/chartLayout/contrast";
it("measures WCAG contrast", () => {
  expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
});
it("leaves a color that already reads on white unchanged", () => {
  // Official navy and orange (4.52:1) both pass.
  expect(readableTextColor("#293B54")).toBe("#293B54");
  expect(readableTextColor("#CA4F1A")).toBe("#CA4F1A");
});
it.each([
  // Official lime and blue; PPIC's Datawrapper theme shows these as #797A27 and #0083A3.
  ["#CCCB74", "olive: red and green high, blue low", ([r, g, b]) => r > b && g > b],
  ["#44AFD0", "teal-blue: blue and green above red", ([r, g, b]) => b > r && g > r],
])("darkens pale %s to a readable %s", (color, _, sameHue) => {
  const text = readableTextColor(color);
  const ratio = contrastRatio(text, "#FFFFFF");
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  expect(ratio).toBeLessThan(5);
  expect(sameHue([1, 3, 5].map(i => parseInt(text.slice(i, i + 2), 16)))).toBe(true);
});
