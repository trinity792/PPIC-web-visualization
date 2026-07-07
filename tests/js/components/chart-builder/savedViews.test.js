/**
 * Tests for components/chart-builder/savedViews.js — the v2 wire shape,
 * the v1 reader (flagged issue 6 regression), fail-loud imports, and the
 * inline-data size cap.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  deleteView,
  deserialize,
  listViews,
  SAVED_VIEW_VERSION,
  saveView,
  serialize,
} from "@/components/chart-builder/savedViews";
import { normalizeSpec } from "@/lib/visualization/chartSpec";

const schema = {
  id: "testmodule",
  label: "Test Module",
  sources: null,
  subsets: { Counties: ["County"] },
  fields: {
    Year: { kind: "temporal" },
    Location: { kind: "dimension" },
    "Total Widgets": {
      kind: "measure",
      unit: "count",
      comparisonGroup: "widgets",
      transforms: ["actual", "indexed", "percentChange"],
      chartRoles: ["yMeasure"],
    },
  },
};

const config = {
  version: 2,
  module: "testmodule",
  preset: "trend-over-time",
  chartType: "line",
  data: { source: "module" },
  bindings: { x: "Year", y: "Total Widgets", series: "Location" },
  period: { startYear: 2020, endYear: 2024 },
  filters: { subset: "Counties" },
  transform: "indexed",
  comparisonMode: "places",
  labels: { title: "Widgets" },
  format: {},
  appearance: { legendPosition: "bottom" },
  annotations: [],
  layers: [],
  referenceLines: [],
  tier: "moderate",
  seriesCount: 3,
  validation: [],
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("serialize", () => {
  it("writes transform/chartType/appearance top-level, never inside filters (issue 6)", () => {
    const saved = JSON.parse(serialize(config));
    expect(saved.version).toBe(SAVED_VIEW_VERSION);
    expect(saved.transform).toBe("indexed");
    expect(saved.chartType).toBe("line");
    expect(saved.appearance).toEqual({ legendPosition: "bottom" });
    expect(saved.filters).toEqual({ subset: "Counties" });
  });

  it("strips computed keys", () => {
    const saved = JSON.parse(serialize(config));
    expect(saved.seriesCount).toBeUndefined();
    expect(saved.validation).toBeUndefined();
  });
});

describe("deserialize", () => {
  it("round-trips a v2 config (identity minus computed keys)", () => {
    expect(deserialize(serialize(config), schema)).toEqual(normalizeSpec(config, schema));
  });

  it("loads a v1 fixture with filters-smuggled keys", () => {
    const v1Fixture = JSON.stringify({
      version: 1,
      module: "testmodule",
      preset: "trend-over-time",
      bindings: { x: "Year", y: "Total Widgets" },
      period: {},
      filters: {
        subset: "Counties",
        transform: "indexed",
        chartType: "line",
        appearance: { legendPosition: "right" },
      },
      labels: { title: "Old view" },
      referenceLines: [],
      layers: [],
    });
    const out = deserialize(v1Fixture, schema);
    expect(out.version).toBe(2);
    expect(out.transform).toBe("indexed");
    expect(out.appearance.legendPosition).toBe("right");
    expect(out.filters).toEqual({ subset: "Counties" });
  });

  it("rejects an unsupported version, a module mismatch, and an unknown preset by name", () => {
    expect(() => deserialize(JSON.stringify({ ...JSON.parse(serialize(config)), version: 9 }), schema))
      .toThrow(/version "9"/);
    expect(() => deserialize(serialize(config), { ...schema, id: "othermodule" }))
      .toThrow(/belongs to "testmodule"/);
    expect(() => deserialize(JSON.stringify({ ...JSON.parse(serialize(config)), preset: "nope" }), schema))
      .toThrow(/Unknown preset "nope"/);
  });

  it("fails loudly when the imported view has blocking errors", () => {
    const broken = JSON.parse(serialize(config));
    broken.bindings.y = "No Such Field";
    expect(() => deserialize(JSON.stringify(broken), schema)).toThrow(/Saved view is invalid/);
  });

  it("rejects non-JSON input", () => {
    expect(() => deserialize("{ nope", schema)).toThrow(/not valid JSON/);
  });
});

describe("saveView / listViews / deleteView", () => {
  it("persists, lists, and deletes a view in localStorage", () => {
    const saved = saveView("My view", config);
    expect(listViews().map((v) => v.id)).toContain(saved.id);
    expect(listViews()[0].config.version).toBe(SAVED_VIEW_VERSION);
    deleteView(saved.id);
    expect(listViews()).toEqual([]);
  });

  it("rejects a view whose inline data exceeds the size cap (VIEW_TOO_LARGE)", () => {
    const bigInline = {
      columns: [{ name: "a", type: "text" }],
      rows: Array.from({ length: 40_000 }, (_, i) => [`row ${i} ${"x".repeat(24)}`]),
    };
    const bigConfig = { ...config, data: { source: "inline", inline: bigInline } };
    expect(() => saveView("Too big", bigConfig)).toThrow(/VIEW_TOO_LARGE/);
  });

  it("allows a small inline table through", () => {
    const smallConfig = {
      ...config,
      data: {
        source: "inline",
        inline: { columns: [{ name: "a", type: "number" }], rows: [[1], [2]] },
      },
    };
    expect(() => saveView("Small inline", smallConfig)).not.toThrow();
  });
});
