import { expect, it } from "vitest";
import { extendSeries } from "@/lib/tabular/fillSeries";
const options = { direction: "down", columnOptions: { type: "number" } };

it("continues a number step", () => {
  expect(extendSeries(["1", "2"], 2, options)).toEqual(["3", "4"]);
  expect(extendSeries(["10", "7"], 2, options)).toEqual(["4", "1"]);
  expect(extendSeries(["1,5", "2,5"], 2, { ...options, columnOptions: { type: "number", locale: "eu" } })).toEqual(["3,5", "4,5"]);
  expect(extendSeries(["3", "5"], 2, { ...options, direction: "up" })).toEqual(["1", "-1"]);
});

it("copies one number, or counts up with Option", () => {
  expect(extendSeries(["7"], 3, options)).toEqual(["7", "7", "7"]);
  expect(extendSeries(["7"], 3, { ...options, option: true })).toEqual(["8", "9", "10"]);
});

it.each([
  [["2026-11", "2026-12"], ["2027-01", "2027-02"]],
  [["2026 Q3", "2026 Q4"], ["2027 Q1", "2027 Q2"]],
  [["Q3 2026", "Q4 2026"], ["Q1 2027", "Q2 2027"]],
  [["2024", "2026"], ["2028", "2030"]],
  [["2024-02-27", "2024-02-28"], ["2024-02-29", "2024-03-01"]],
  [["2024-25", "2025-26"], ["2026-27", "2027-28"]],
  [["Nov 2026", "Dec 2026"], ["Jan 2027", "Feb 2027"]],
])("continues months, quarters, years, days, and school years in their own format: %j", (source, expected) => {
  expect(extendSeries(source, 2, { direction: "down", columnOptions: { type: "date" } })).toEqual(expected);
});

it("counts up text that ends in a number", () => {
  expect(extendSeries(["Wave 1"], 3, { direction: "down" })).toEqual(["Wave 2", "Wave 3", "Wave 4"]);
});

it("moves formula references and keeps anchors", () => {
  expect(extendSeries(["=B2/$C$2+B$2+$B2"], 2, options)).toEqual(["=B3/$C$2+B$2+$B3", "=B4/$C$2+B$2+$B4"]);
  expect(extendSeries(["=B2+$C$2"], 2, { direction: "right" })).toEqual(["=C2+$C$2", "=D2+$C$2"]);
});

it("repeats any other pattern", () => {
  expect(extendSeries(["North", "South"], 5, { direction: "down" })).toEqual(["North", "South", "North", "South", "North"]);
  expect(extendSeries(["1", "4", "2"], 4, options)).toEqual(["1", "4", "2", "1"]);
  expect(extendSeries([""], 2, options)).toEqual(["", ""]);
});
