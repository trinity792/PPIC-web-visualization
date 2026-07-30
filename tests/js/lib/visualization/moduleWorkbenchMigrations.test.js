/** Phases 5, 6, and 9 backward-compatibility and reducer contracts. */

import { describe, expect, it } from "vitest";

import {
  createChartConfig,
  reduceChartConfig,
} from "@/components/chart-builder/chartConfigStore";
import { deserialize, serialize } from "@/components/chart-builder/savedViews";
import { CHART_TYPE_IDS, getChartType } from "@/lib/visualization/chartRegistry";
import { normalizeSpec, parseSpec } from "@/lib/visualization/chartSpec";
import { toPlotly } from "@/lib/visualization/toPlotly";

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

  describe("divergingBar retires to bar + appearance.diverging (Workstream B)", () => {
    const oldDivergingBarView = {
      ...oldView,
      chartType: "divergingBar",
      preset: "diverging-pace",
      bindings: { category: "Location", y: "Stock" },
      appearance: {
        center: 1,
        orientation: "horizontal",
        valueRange: [0, 2],
        trackRail: true,
        minimalAxis: true,
        colorBuckets: [
          { at: 1.0, color: "blue3" },
          { at: null, color: "orange3" },
        ],
      },
    };

    it("migrates a stored v2 divergingBar view to bar with diverging on", () => {
      const normalized = normalizeSpec(oldDivergingBarView, schema);
      expect(normalized.chartType).toBe("bar");
      expect(normalized.appearance.diverging).toBe(true);
    });

    it("keeps the center reference intact", () => {
      const normalized = normalizeSpec(oldDivergingBarView, schema);
      expect(normalized.appearance.center).toBe(1);
    });

    it("keeps the dashboard styling intact", () => {
      const normalized = normalizeSpec(oldDivergingBarView, schema);
      expect(normalized.appearance.valueRange).toEqual([0, 2]);
      expect(normalized.appearance.trackRail).toBe(true);
      expect(normalized.appearance.minimalAxis).toBe(true);
      expect(normalized.appearance.colorBuckets).toEqual(
        oldDivergingBarView.appearance.colorBuckets,
      );
    });

    it("renders identically before and after migration", () => {
      const series = [
        { category: "Alameda", value: 1.2 },
        { category: "Butte", value: 0.6 },
      ];
      const bindings = { category: "category", y: "value" };
      const before = toPlotly({
        chartType: "divergingBar",
        bindings,
        series,
        labels: {},
        appearance: oldDivergingBarView.appearance,
      });
      const normalized = normalizeSpec(
        { ...oldDivergingBarView, bindings },
        schema,
      );
      const after = toPlotly({ ...normalized, series });
      expect(after).toEqual(before);
    });

    it("announces the retirement via parseSpec", () => {
      const { spec, errors } = parseSpec(
        JSON.stringify(oldDivergingBarView),
        schema,
      );
      expect(spec.chartType).toBe("bar");
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "CHART_TYPE_RETIRED", level: "warn" }),
        ]),
      );
    });
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
