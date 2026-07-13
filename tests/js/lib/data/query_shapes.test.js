/**
 * Tests for lib/data/query_shapes.js — focused on the multi-value `source`
 * (provenance) filter added for Population & Housing (refactor guide B3).
 */

import { describe, expect, it } from "vitest";

import { filterRows } from "@/lib/data/query_shapes";

const ROWS = [
  { "Geographic Level": "City", Location: "Oakland", Year: 2019, Source: "E-8" },
  { "Geographic Level": "City", Location: "Oakland", Year: 2022, Source: "E-5" },
  { "Geographic Level": "Region", Location: "Bay Area", Year: 2022, Source: "Aggregated" },
];

const ALL_LEVELS = ["City", "Region", "County", "Town", "State"];

describe("filterRows source filter", () => {
  it("returns all rows when source is null (default all)", () => {
    const result = filterRows(ROWS, { levels: ALL_LEVELS, source: null });
    expect(result).toHaveLength(3);
  });

  it("returns all rows when source is an empty array (all)", () => {
    const result = filterRows(ROWS, { levels: ALL_LEVELS, source: [] });
    expect(result).toHaveLength(3);
  });

  it("filters to a single source passed as a string", () => {
    const result = filterRows(ROWS, { levels: ALL_LEVELS, source: "E-5" });
    expect(result.map((row) => row.Source)).toEqual(["E-5"]);
  });

  it("filters to multiple sources passed as an array", () => {
    const result = filterRows(ROWS, { levels: ALL_LEVELS, source: ["E-5", "Aggregated"] });
    expect(result.map((row) => row.Source).sort()).toEqual(["Aggregated", "E-5"]);
  });

  it("composes the source filter with the level filter", () => {
    const result = filterRows(ROWS, { levels: ["City"], source: ["E-5", "E-8"] });
    expect(result).toHaveLength(2);
    expect(new Set(result.map((row) => row.Source))).toEqual(new Set(["E-5", "E-8"]));
  });
});
