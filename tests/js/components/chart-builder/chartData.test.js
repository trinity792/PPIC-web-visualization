/**
 * Tests for components/chart-builder/chartData.js — the pure, fetch-free
 * pieces: change-transform record shaping and derived series names. (The
 * fetch-driven loaders are exercised indirectly through ModuleEditor and are
 * not re-tested here per the setup.js network safety net.)
 */

import { describe, expect, it } from "vitest";

import {
  changeRecords,
  isChangeTransform,
  loadChartData,
  seriesNamesOf,
} from "@/components/chart-builder/chartData";

describe("isChangeTransform", () => {
  it("is true for the three change-family transforms", () => {
    expect(isChangeTransform("numericChange")).toBe(true);
    expect(isChangeTransform("percentChange")).toBe(true);
    expect(isChangeTransform("percentagePointChange")).toBe(true);
  });

  it("is false for actual/indexed and anything else", () => {
    expect(isChangeTransform("actual")).toBe(false);
    expect(isChangeTransform("indexed")).toBe(false);
    expect(isChangeTransform(undefined)).toBe(false);
  });
});

describe("changeRecords", () => {
  const records = [
    { location: "Alameda", category: "Alameda", start: 100, end: 130 },
    { location: "Butte", category: "Butte", start: 50, end: 25 },
    { location: "Colusa", category: "Colusa", start: 0, end: 10 },
    { location: "Del Norte", category: "Del Norte", start: null, end: 5 },
  ];

  it("computes a plain difference for numericChange", () => {
    const out = changeRecords(records, "numericChange");
    expect(out.map((r) => r.value)).toEqual([30, -25, 10, null]);
  });

  it("computes percent change, with null on a zero or missing start", () => {
    const out = changeRecords(records, "percentChange");
    expect(out.map((r) => r.value)).toEqual([30, -50, null, null]);
  });

  it("computes a plain difference for percentagePointChange", () => {
    const out = changeRecords(records, "percentagePointChange");
    expect(out.map((r) => r.value)).toEqual([30, -25, 10, null]);
  });

  it("drops start/end and keeps every other field", () => {
    const out = changeRecords(records, "numericChange");
    expect(out[0]).toEqual({ location: "Alameda", category: "Alameda", value: 30 });
    expect(out[0].start).toBeUndefined();
    expect(out[0].end).toBeUndefined();
  });
});

describe("loadChartData — inline ('your data') source", () => {
  it("shapes via toSeries.buildShapes with no fetch, in the standard envelope", async () => {
    const config = {
      chartType: "bar",
      bindings: { category: "County", y: "Population" },
      filters: {},
      appearance: {},
      data: {
        source: "inline",
        inline: {
          columns: [
            { name: "County", type: "text" },
            { name: "Population", type: "number" },
          ],
          rows: [
            ["Fresno", "100"],
            ["Kern", "90"],
          ],
          issues: [],
        },
      },
    };

    // No schema/signal needed for the inline path, and setup.js's fetch stub
    // throws on any real network call — this only passes if nothing fetches.
    const result = await loadChartData(config, {});
    expect(result.geometry).toBeNull();
    expect(result.unmatched).toEqual([]);
    expect(result.series).toHaveLength(2);
    expect(result.series[0]).toMatchObject({ location: "Fresno", value: 100 });
  });
});

describe("seriesNamesOf", () => {
  it("returns each location for a line result", () => {
    const result = { series: [{ location: "Alameda" }, { location: "Butte" }] };
    expect(seriesNamesOf("line", result)).toEqual(["Alameda", "Butte"]);
  });

  it("returns the row labels (y) for a heatmap result", () => {
    const result = { series: { x: [2020, 2021], y: ["Alameda", "Butte"], z: [[1, 2], [3, 4]] } };
    expect(seriesNamesOf("heatmap", result)).toEqual(["Alameda", "Butte"]);
  });

  it("returns [] for a missing result", () => {
    expect(seriesNamesOf("line", null)).toEqual([]);
  });

  it("de-duplicates repeated group names for a bar result", () => {
    const result = {
      series: [
        { category: "Alameda", group: "Owner" },
        { category: "Butte", group: "Owner" },
        { category: "Alameda", group: "Renter" },
      ],
    };
    expect(seriesNamesOf("bar", result)).toEqual(["Owner", "Renter"]);
  });
});
