/** Phases 5, 6, and 9 backward-compatibility and reducer contracts. */

import { describe, expect, it } from "vitest";

import {
  createChartConfig,
  reduceChartConfig,
} from "@/components/chart-builder/chartConfigStore";
import { deserialize, serialize } from "@/components/chart-builder/savedViews";
import { CHART_TYPE_IDS, getChartType } from "@/lib/visualization/chartRegistry";
import { normalizeSpec, parseSpec } from "@/lib/visualization/chartSpec";

const schema = {
  id: "widgets",
  label: "Widgets",
  sources: null,
  subsets: { Counties: ["County"] },
  fields: {
    Year: { kind: "temporal", label: "Year" },
    Location: { kind: "dimension", label: "Location", cardinality: "high" },
    Stock: {
      kind: "measure",
      label: "Stock",
      unit: "count",
      comparisonGroup: "widgets",
      transforms: ["actual", "indexed", "numericChange", "percentChange"],
      chartRoles: ["yMeasure", "color", "size"],
      curated: true,
    },
    Rate: {
      kind: "measure",
      label: "Rate",
      unit: "percent",
      comparisonGroup: "rates",
      transforms: ["actual", "percentagePointChange"],
      chartRoles: ["yMeasure", "color"],
    },
  },
};

const oldView = {
  version: 2,
  module: "widgets",
  preset: "trend-over-time",
  chartType: "line",
  data: { source: "module" },
  bindings: { x: "Year", y: "Stock", series: "Location" },
  period: {},
  filters: { subset: "Counties" },
  transform: "actual",
  comparisonMode: "places",
  labels: {},
  format: {},
  appearance: {},
  annotations: [],
  layers: [],
  referenceLines: [],
  tier: "advanced",
};

describe("retired chart and state shape", () => {
  it("removes slope from the public chart registry", () => {
    expect(CHART_TYPE_IDS).not.toContain("slope");
    expect(getChartType("slope")).toBeUndefined();
  });

  it("migrates a v2 slope view to line with a named warning", () => {
    const { spec, errors } = parseSpec(
      JSON.stringify({ ...oldView, chartType: "slope" }),
      schema,
    );
    expect(spec.chartType).toBe("line");
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CHART_TYPE_RETIRED", level: "warn" }),
      ]),
    );
  });

  it("creates locations and no tier in fresh configs", () => {
    const config = createChartConfig(schema);
    expect(config.filters.locations).toEqual([]);
    expect(config).not.toHaveProperty("tier");
  });

  it("treats legacy SET_TIER as a no-op", () => {
    const config = createChartConfig(schema);
    expect(
      reduceChartConfig(config, { type: "SET_TIER", tier: "advanced" }, schema),
    ).toBe(config);
    expect(config).not.toHaveProperty("tier");
  });

  it("resets an invalid transform when a newly bound measure disallows it", () => {
    const config = {
      ...createChartConfig(schema),
      bindings: { x: "Year", y: "Stock", series: "Location" },
      transform: "percentChange",
    };
    const rebound = reduceChartConfig(
      config,
      { type: "SET_BINDING", role: "y", field: "Rate" },
      schema,
    );
    expect(rebound.transform).toBe("actual");
  });
});

describe("saved-view migrations", () => {
  it("moves legacy selectedPlaces values into filters.locations without removing the layer", () => {
    const layer = {
      id: "places",
      type: "selectedPlaces",
      values: ["Alameda", "Butte"],
    };
    const normalized = normalizeSpec({ ...oldView, tier: undefined, layers: [layer] }, schema);
    expect(normalized.filters.locations).toEqual(["Alameda", "Butte"]);
    expect(normalized.layers).toContainEqual(layer);
  });

  it("loads a stored tier without error and drops the key", () => {
    const normalized = normalizeSpec(oldView, schema);
    expect(normalized).not.toHaveProperty("tier");
    expect(normalized.chartType).toBe("line");
  });

  it("round-trips locations cleanly with tier gone", () => {
    const current = {
      ...oldView,
      tier: undefined,
      filters: { ...oldView.filters, locations: ["Alameda"] },
    };
    const saved = JSON.parse(serialize(current));
    expect(saved).not.toHaveProperty("tier");
    expect(saved.filters.locations).toEqual(["Alameda"]);
    expect(deserialize(JSON.stringify(saved), schema).filters.locations).toEqual([
      "Alameda",
    ]);
  });
});
