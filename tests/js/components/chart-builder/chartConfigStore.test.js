/**
 * Tests for components/chart-builder/chartConfigStore.js — spec-v2 config
 * construction and the new v2 reducer actions. `reduceChartConfig` and
 * `createChartConfig` are pure, so no React rendering is needed.
 */

import { describe, expect, it } from "vitest";

import {
  createChartConfig,
  reduceChartConfig,
} from "@/components/chart-builder/chartConfigStore";
import { SPEC_VERSION } from "@/lib/visualization/chartSpec";

const schema = {
  id: "testmodule",
  label: "Test Module",
  sources: null,
  subsets: { Counties: ["County"], Regions: ["Region"] },
  filterDimensions: [],
  fields: {
    Year: { kind: "temporal" },
    Location: { kind: "dimension" },
    "Total Widgets": {
      kind: "measure",
      unit: "count",
      comparisonGroup: "widgets",
      transforms: ["actual", "indexed", "percentChange"],
      chartRoles: ["yMeasure", "xMeasure", "size", "color"],
      curated: true,
    },
    "Spare Widgets": {
      kind: "measure",
      unit: "count",
      comparisonGroup: "widgets",
      transforms: ["actual"],
      chartRoles: ["yMeasure"],
    },
  },
};

const dispatch = (config, action) => reduceChartConfig(config, action, schema);

describe("createChartConfig", () => {
  it("builds a spec-v2 config with the new containers", () => {
    const config = createChartConfig(schema);
    expect(config.version).toBe(SPEC_VERSION);
    expect(config.data).toEqual({ source: "module" });
    expect(config.format).toEqual({});
    expect(config.annotations).toEqual([]);
    expect(config.tier).toBe("moderate");
    expect(config.validation).toEqual([]);
  });

  it("accepts a legacy v1 wire shape (filters-smuggled keys)", () => {
    const config = createChartConfig(schema, {
      version: 1,
      preset: "trend-over-time",
      filters: { subset: "Regions", transform: "indexed", chartType: "line" },
    });
    expect(config.transform).toBe("indexed");
    expect(config.filters.subset).toBe("Regions");
    expect(config.filters.transform).toBeUndefined();
  });

  it("defaults to trend-over-time when the schema declares no defaultPreset", () => {
    const config = createChartConfig(schema);
    expect(config.preset).toBe("trend-over-time");
    expect(config.chartType).toBe("line");
  });

  it("honors a schema-declared defaultPreset (snapshot-only ranking module)", () => {
    const config = createChartConfig({ ...schema, defaultPreset: "compare-places" });
    expect(config.preset).toBe("compare-places");
    expect(config.chartType).toBe("bar");
    // An explicit initial preset still wins over the schema default.
    const explicit = createChartConfig(
      { ...schema, defaultPreset: "compare-places" },
      { preset: "trend-over-time" },
    );
    expect(explicit.preset).toBe("trend-over-time");
  });
});

describe("reduceChartConfig — v2 actions", () => {
  const base = createChartConfig(schema);

  it("SET_DATA_SOURCE switches to inline and back, clearing the table", () => {
    const inline = { columns: [{ name: "a", type: "number" }], rows: [[1]] };
    const withInline = dispatch(base, { type: "SET_DATA_SOURCE", source: "inline", inline });
    expect(withInline.data).toEqual({ source: "inline", inline });
    const backToModule = dispatch(withInline, { type: "SET_DATA_SOURCE", source: "module" });
    expect(backToModule.data).toEqual({ source: "module" });
  });

  it("SET_FORMAT sets and clears one field's override", () => {
    const withFormat = dispatch(base, {
      type: "SET_FORMAT",
      field: "Total Widgets",
      format: { decimals: 1, suffix: " widgets" },
    });
    expect(withFormat.format["Total Widgets"]).toEqual({ decimals: 1, suffix: " widgets" });
    const cleared = dispatch(withFormat, { type: "SET_FORMAT", field: "Total Widgets", format: null });
    expect(cleared.format["Total Widgets"]).toBeUndefined();
  });

  it("SET_PALETTE and SET_SERIES_COLOR write appearance color state", () => {
    const withPalette = dispatch(base, { type: "SET_PALETTE", palette: "brand-categorical" });
    expect(withPalette.appearance.palette).toBe("brand-categorical");
    const withOverride = dispatch(withPalette, {
      type: "SET_SERIES_COLOR",
      seriesName: "California",
      token: "orange3",
    });
    expect(withOverride.appearance.seriesColors).toEqual({ California: "orange3" });
    const cleared = dispatch(withOverride, {
      type: "SET_SERIES_COLOR",
      seriesName: "California",
      token: null,
    });
    expect(cleared.appearance.seriesColors).toEqual({});
  });

  it("ADD_ANNOTATION / REMOVE_ANNOTATION manage the annotations array", () => {
    const note = { id: "a1", type: "text", text: "Recession", x: 2008 };
    const withNote = dispatch(base, { type: "ADD_ANNOTATION", annotation: note });
    expect(withNote.annotations).toEqual([note]);
    const removed = dispatch(withNote, { type: "REMOVE_ANNOTATION", id: "a1" });
    expect(removed.annotations).toEqual([]);
  });

  it("SET_TIER changes only the tier and no-ops when unchanged", () => {
    const advanced = dispatch(base, { type: "SET_TIER", tier: "advanced" });
    expect(advanced.tier).toBe("advanced");
    expect(advanced.bindings).toEqual(base.bindings);
    expect(dispatch(advanced, { type: "SET_TIER", tier: "advanced" })).toBe(advanced);
  });

  it("SET_RANKING applies Top/Bottom N and resets stale category customization", () => {
    const defaultBar = dispatch(base, { type: "SET_CHART_TYPE", chartType: "bar" });
    const bar = {
      ...defaultBar,
      appearance: {
        ...defaultBar.appearance,
        categoryOrder: ["Old value"],
        hiddenCategories: ["Old value"],
      },
    };
    const ranked = dispatch(bar, {
      type: "SET_RANKING",
      topN: 5,
      sort: "ascending",
    });
    expect(ranked.filters.topN).toBe(5);
    expect(ranked.appearance.sort).toBe("ascending");
    expect(ranked.appearance.categoryOrder).toEqual([]);
    expect(ranked.appearance.hiddenCategories).toEqual([]);
  });

  it("LOAD_SPEC applies a parsed spec as-is, keeping loaded metadata, and revalidates", () => {
    const withCount = dispatch(base, {
      type: "SET_SERIES_COUNT",
      count: 4,
      categoryNames: ["Alameda", "Butte"],
    });
    const draft = { ...withCount, labels: { ...withCount.labels, title: "From code" } };
    const applied = dispatch(withCount, { type: "LOAD_SPEC", spec: draft });
    expect(applied.labels.title).toBe("From code");
    expect(applied.seriesCount).toBe(4);
    expect(applied.categoryNames).toEqual(["Alameda", "Butte"]);
    expect(applied.validation).toEqual([]);
  });

  it("LOAD_SPEC does not re-seed bindings from the preset (the code is the truth)", () => {
    const draft = {
      ...base,
      bindings: { ...base.bindings, y: "Spare Widgets" },
    };
    const applied = dispatch(base, { type: "LOAD_SPEC", spec: draft });
    expect(applied.bindings.y).toBe("Spare Widgets");
  });

  it("SET_SERIES_COUNT stores loaded metadata alongside the count", () => {
    const withData = dispatch(base, {
      type: "SET_SERIES_COUNT",
      count: 2,
      geoUnmatched: ["Alpine"],
      seriesNames: ["Alameda", "Butte"],
      categoryNames: ["Fresno", "Kern"],
    });
    expect(withData.seriesCount).toBe(2);
    expect(withData.geoUnmatched).toEqual(["Alpine"]);
    expect(withData.seriesNames).toEqual(["Alameda", "Butte"]);
    expect(withData.categoryNames).toEqual(["Fresno", "Kern"]);
  });

  it("SET_SERIES_COUNT revalidation surfaces a GEO_JOIN_UNMATCHED warning", () => {
    const withData = dispatch(base, {
      type: "SET_SERIES_COUNT",
      count: 2,
      geoUnmatched: ["Alpine"],
    });
    expect(withData.validation.some((f) => f.code === "GEO_JOIN_UNMATCHED")).toBe(true);
  });

  it("SET_SERIES_COUNT no-ops only when both count and geoUnmatched are unchanged", () => {
    const withData = dispatch(base, {
      type: "SET_SERIES_COUNT",
      count: 2,
      geoUnmatched: ["Alpine"],
    });
    const sameAgain = dispatch(withData, {
      type: "SET_SERIES_COUNT",
      count: 2,
      geoUnmatched: ["Alpine"],
    });
    expect(sameAgain).toBe(withData);

    const changedGeo = dispatch(withData, {
      type: "SET_SERIES_COUNT",
      count: 2,
      geoUnmatched: ["Alpine", "Sierra"],
    });
    expect(changedGeo).not.toBe(withData);
    expect(changedGeo.geoUnmatched).toEqual(["Alpine", "Sierra"]);
  });
});
