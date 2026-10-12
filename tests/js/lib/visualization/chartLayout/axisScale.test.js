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
// Renderer plan F (owner, 2026-10-01): a range chart fits its data, as PPIC's
// published range plots do (one starts at 65%).
it("fits the data without zero when includeZero is false", () => {
  const result = axisScale({ min: 65.4, max: 91, includeZero: false });
  expect(result.domain[0]).toBeGreaterThan(0);
  expect(result.domain[0]).toBeLessThanOrEqual(65.4);
  expect(result.domain[1]).toBeGreaterThanOrEqual(91);
});
it("still reaches across zero when the data does", () => {
  const result = axisScale({ min: -4.7, max: 2.4, includeZero: false });
  expect(result.domain[0]).toBeLessThan(0);
  expect(result.domain[1]).toBeGreaterThan(0);
});
// Axis range (Advanced mode, 2026-10-12): a set end is exact, a blank end stays
// automatic, and ticks never fall outside the axis.
it("uses a fixed range exactly, with round ticks inside it", () => {
  const result = axisScale({ min: 12, max: 37, fixed: [5, 45] });
  expect(result.domain).toEqual([5, 45]);
  expect(result.ticks).toEqual([10, 20, 30, 40]);
  expect(result.fixed).toBe(true);
});
it("fixes only the end that is set", () => {
  expect(axisScale({ min: 12, max: 37, fixed: [10, null] }).domain).toEqual([10, 40]);
  expect(axisScale({ min: 12, max: 37, fixed: [null, 100] }).domain).toEqual([0, 100]);
});
it("may be narrower than the data, which the renderer clips", () => {
  const result = axisScale({ min: 0, max: 900, fixed: [0, 300] });
  expect(result.domain).toEqual([0, 300]);
  expect(result.ticks.at(-1)).toBeLessThanOrEqual(300);
});
it("keeps the tick increment inside a fixed range", () => {
  expect(axisScale({ min: 0, max: 19, increment: 5, fixed: [2, 18] }).ticks).toEqual([5, 10, 15]);
});
it.each([[[50, 10]], [[20, 20]], [[50, null]], [[null, -5]]])("ignores an impossible range: %j", (fixed) => {
  expect(axisScale({ min: 12, max: 37, fixed })).toMatchObject({ domain: [0, 40], fixed: false });
});
