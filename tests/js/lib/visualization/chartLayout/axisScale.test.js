import { expect, it } from "vitest";
import { axisScale, periodLabelCount } from "@/lib/visualization/chartLayout/axisScale";
it("starts at zero for positive values", () => expect(axisScale({ min: 12, max: 37 }).domain).toEqual([0, 40]));
it("includes zero and the lowest value when values go negative", () => {
  const result = axisScale({ min: -12, max: -2 });
  expect(result.domain[0]).toBeLessThanOrEqual(-12);
  expect(result.domain[1]).toBeGreaterThanOrEqual(0);
});
it("does not force zero for the indexed calculation", () => {
  const result = axisScale({ min: 98, max: 112, calculation: "indexed" });
  expect(result.domain[0]).toBeGreaterThan(0);
  expect(result.domain[0]).toBeLessThanOrEqual(98);
  expect(result.domain[1]).toBeGreaterThanOrEqual(112);
});
it("uses round steps", () => expect(axisScale({ min: 0, max: 37 }).ticks).toEqual([0, 10, 20, 30, 40]));
it("uses the tick increment when one is set", () => expect(axisScale({ min: 0, max: 19, increment: 5 }).ticks).toEqual([0, 5, 10, 15, 20]));
it.each([0, 10, -10])("handles one value and all-equal values: %s", value => {
  const result = axisScale({ min: value, max: value });
  expect(result.domain[1]).toBeGreaterThan(result.domain[0]);
  expect(result.domain[0]).toBeLessThanOrEqual(value);
  expect(result.domain[1]).toBeGreaterThanOrEqual(value);
  expect(result.ticks.length).toBeGreaterThanOrEqual(4);
  expect(result.ticks.length).toBeLessThanOrEqual(6);
});
it("fits fewer period labels at narrow widths", () => {
  expect(periodLabelCount(330)).toBe(4);
  expect(periodLabelCount(950)).toBe(13);
});
