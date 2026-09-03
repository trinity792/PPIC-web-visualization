/**
 * Tests for lib/visualization/chartRegistry.js - Phase 6 catalog growth.
 * The overhaul adds three base chart ids and moves named visual forms into
 * descriptor variants rather than separate one-off components.
 */

import { describe, expect, it } from "vitest";

import {
  CHART_TYPE_IDS,
  CHART_TYPES,
  COLOR_ENCODINGS,
  getChartType,
  SKELETON_SHAPES,
} from "@/lib/visualization/chartRegistry";
import { RETIRED_CHART_TYPES } from "@/lib/visualization/chartSpec";
import { FIELD_KINDS } from "@/lib/visualization/fieldTypes";
import { toPlotly } from "@/lib/visualization/toPlotly";

describe("Phase 6 catalog ids", () => {
  it("registers pie, symbolMap, and dataTable as base chart types", () => {
    expect(CHART_TYPE_IDS).toEqual(
      expect.arrayContaining(["pie", "symbolMap", "dataTable"]),
    );
  });

  it("keeps donut as a pie variant through appearance.hole", () => {
    const pie = getChartType("pie");
    expect(pie).toMatchObject({
      id: "pie",
      transformCapable: false,
      requiredRoles: ["category", "y"],
    });
    expect(pie.roleConstraints.category).toContain("dimension");
    expect(pie.roleConstraints.y).toContain("measure");
    expect(pie.defaults).toMatchObject({ hole: 0 });
  });

  it("carries diverging as a bar default in place of a separate chart type (Workstream B)", () => {
    expect(getChartType("bar").defaults).toMatchObject({ diverging: false });
  });

  it("no longer registers divergingBar, but still resolves the id", () => {
    // Deleted 2026-08-03, one release after the migration shipped. The
    // descriptor is gone; RETIRED_CHART_TYPES is what keeps a bookmarked link
    // working, by rewriting the id to "bar" in normalizeSpec before anything
    // asks the registry about it. That entry is permanent.
    expect(getChartType("divergingBar")).toBeUndefined();
    expect(CHART_TYPE_IDS).not.toContain("divergingBar");
    expect(RETIRED_CHART_TYPES.divergingBar).toBe("bar");
  });

  it("registers proportional-symbol maps as the symbolMap chart family", () => {
    const symbolMap = getChartType("symbolMap");
    expect(symbolMap).toMatchObject({
      id: "symbolMap",
      transformCapable: false,
      requiredRoles: ["geography", "size"],
      requiresGeometry: true,
    });
    expect(symbolMap.roleConstraints.geography).toContain("dimension");
    expect(symbolMap.roleConstraints.size).toContain("measure");
  });

  it("registers dataTable as a chart type with table-specific appearance defaults", () => {
    const dataTable = getChartType("dataTable");
    expect(dataTable).toMatchObject({
      id: "dataTable",
      transformCapable: false,
      requiredRoles: [],
    });
    expect(dataTable.defaults).toMatchObject({
      search: true,
      sortable: true,
      pageSize: 25,
    });
  });
});

describe("descriptor metadata", () => {
  it("no chart type declares a benchmark role", () => {
    for (const id of CHART_TYPE_IDS) {
      const chart = getChartType(id);
      expect(chart.optionalRoles || [], id).not.toContain("benchmark");
      expect(chart.requiredRoles || [], id).not.toContain("benchmark");
      expect(chart.roleConstraints || {}, id).not.toHaveProperty("benchmark");
    }
  });

  it("a line accepts only a temporal on x", () => {
    // Workstream D widened this to admit a DIMENSION and it was reverted: no
    // loader or shape builder honours a categorical line x, and admitting one
    // suppressed inlineMapping's "retype your year column as Date" hint. A
    // dimension is allowed back only in module mode, for a schema-marked
    // ordered dimension — see the descriptor comment in chartRegistry.js.
    expect(getChartType("line").roleConstraints.x).toEqual([FIELD_KINDS.TEMPORAL]);
  });

  it("a bar accepts a dimension or a temporal as its category", () => {
    expect(getChartType("bar").roleConstraints.category).toEqual([
      FIELD_KINDS.DIMENSION,
      FIELD_KINDS.TEMPORAL,
    ]);
  });

  it("every role in requiredRoles and optionalRoles has a roleConstraints entry", () => {
    for (const id of CHART_TYPE_IDS) {
      const chart = getChartType(id);
      for (const role of [...chart.requiredRoles, ...chart.optionalRoles]) {
        expect(chart.roleConstraints, `${id}.${role}`).toHaveProperty(role);
        expect(chart.roleConstraints[role], `${id}.${role}`).not.toHaveLength(0);
      }
    }
  });

  it("declares Group sectioning and spacing on every applicable chart family", () => {
    for (const chartType of ["bar", "dumbbell", "dotPlot", "forest"]) {
      const chart = getChartType(chartType);
      expect(chart.optionalRoles).toContain("group");
      expect(chart.roleConstraints.group).toContain("dimension");
      expect(chart.defaults.groupGap).toBeGreaterThan(0);
    }
  });

  it("exposes grid spacing only for Cartesian chart families", () => {
    for (const chartType of [
      "line",
      "bar",
      "heatmap",
      "dumbbell",
      "dotPlot",
      "forest",
      "scatter",
      "bubble",
    ]) {
      expect(getChartType(chartType).lineAxes).toEqual(["horizontal", "vertical"]);
    }
    for (const chartType of ["choroplethMap", "pie", "symbolMap", "dataTable"]) {
      expect(getChartType(chartType).lineAxes).toBeUndefined();
    }
  });

  it("tags every chart descriptor with transform capability", () => {
    for (const [id, descriptor] of Object.entries(CHART_TYPES)) {
      expect(typeof descriptor.transformCapable, `chart type: ${id}`).toBe("boolean");
      expect(descriptor.controlTiers, `chart type: ${id}`).toBeUndefined();
      expect(descriptor.tierHints, `chart type: ${id}`).toBeUndefined();
    }
  });

  it("does not register the retired Slopegraph", () => {
    expect(CHART_TYPE_IDS).not.toContain("slope");
    expect(getChartType("slope")).toBeUndefined();
  });

  it("keeps a working toPlotly builder for every remaining registered type", () => {
    const specs = {
      line: {
        bindings: { x: "Year", y: "Value" },
        series: [{ location: "A", years: [2024, 2025], values: [1, 2] }],
      },
      bar: {
        bindings: { category: "category", y: "value" },
        series: [{ category: "A", value: 1 }],
      },
      choroplethMap: {
        bindings: { geography: "geoid", color: "value" },
        series: [{ geoid: "06001", value: 1 }],
        geometry: { type: "FeatureCollection", features: [] },
      },
      dumbbell: {
        bindings: { category: "category", start: "start", end: "end" },
        series: [{ category: "A", start: 1, end: 2 }],
      },
      dotPlot: {
        bindings: { y: "row", x: "column", color: "value" },
        series: { x: ["X"], y: ["A"], z: [[1]] },
      },
      forest: {
        bindings: { category: "category", start: "start", end: "end" },
        series: [{ category: "A", start: 1, end: 2 }],
      },
      scatter: {
        bindings: { unit: "location", x: "x", y: "y" },
        series: [{ location: "A", x: 1, y: 2 }],
      },
      bubble: {
        bindings: { unit: "location", x: "x", y: "y", size: "size" },
        series: [{ location: "A", x: 1, y: 2, size: 3 }],
      },
      heatmap: {
        bindings: { x: "column", y: "row", color: "value" },
        series: { x: ["X"], y: ["A"], z: [[1]] },
      },
      pie: {
        bindings: { category: "category", y: "value" },
        series: [{ category: "A", value: 1 }],
      },
      symbolMap: {
        bindings: { geography: "location", size: "value" },
        series: [{ location: "A", lat: 37, lon: -122, value: 1 }],
      },
      dataTable: {
        bindings: {},
        series: { columns: [{ name: "Value" }], rows: [[1]] },
      },
    };

    for (const chartType of CHART_TYPE_IDS) {
      expect(() =>
        toPlotly({
          chartType,
          labels: {},
          appearance: {},
          period: {},
          ...specs[chartType],
        }),
      `chart type: ${chartType}`).not.toThrow();
    }
  });

  it("declares every implied role as also required, resolving to an acceptable kind", () => {
    for (const [id, descriptor] of Object.entries(CHART_TYPES)) {
      const implied = descriptor.impliedRoles || {};
      for (const [role, source] of Object.entries(implied)) {
        expect(descriptor.requiredRoles, `${id}.${role}`).toContain(role);
        const acceptedKinds = descriptor.roleConstraints[role] || [];
        const resolvedKind = source === "temporal" ? "temporal" : "dimension";
        expect(acceptedKinds, `${id}.${role}`).toContain(resolvedKind);
      }
    }
  });

  it("declares a skeletonShape on every chart type (Workstream C)", () => {
    for (const [id, descriptor] of Object.entries(CHART_TYPES)) {
      expect(descriptor.skeletonShape, `chart type: ${id}`).toEqual(expect.any(String));
      expect(SKELETON_SHAPES, `chart type: ${id}`).toContain(descriptor.skeletonShape);
    }
  });

  it("declares a colorEncoding on every chart type", () => {
    for (const [id, descriptor] of Object.entries(CHART_TYPES)) {
      expect(COLOR_ENCODINGS, `chart type: ${id}`).toContain(descriptor.colorEncoding);
    }
  });

  it("declares exactly which chart types are scale-driven", () => {
    // Hand-written rather than read back off the descriptors: this is the fact
    // AppearanceSection used to keep as a private list of ids, and the whole
    // point of moving it is that adding a scale-driven chart type has to change
    // a test someone reads.
    const byEncoding = (encoding) =>
      Object.entries(CHART_TYPES)
        .filter(([, descriptor]) => descriptor.colorEncoding === encoding)
        .map(([id]) => id)
        .sort();

    expect(byEncoding("scale")).toEqual(["choroplethMap", "heatmap"]);
    expect(byEncoding("conditional-scale")).toEqual(["symbolMap"]);
    expect(byEncoding("none")).toEqual(["dataTable"]);
  });

  it("keeps variants on base chart descriptors instead of growing one id per named form", () => {
    expect(CHART_TYPE_IDS).not.toEqual(
      expect.arrayContaining([
        "donut",
        "populationPyramid",
        "stackedBar",
        "groupedBar",
        "area",
      ]),
    );
    expect(getChartType("bar").defaults).toEqual(
      expect.objectContaining({ stackMode: expect.any(String), mirror: expect.any(Boolean) }),
    );
    expect(getChartType("line").defaults).toEqual(
      expect.objectContaining({ area: expect.any(Boolean) }),
    );
  });
});

/**
 * Workstream A - the capability matrix.
 *
 * Standard Mode hides chart choices the resolved question cannot support, and
 * Advanced Mode may expose a crowded presentation but never a mathematically
 * invalid one. Both read one merged descriptor, so this matrix is the fact that
 * decides which chart types a question can reach.
 *
 * The matrix is written out by hand. A test that reads the registry and then
 * asserts what it just read proves nothing: adding a chart type has to change a
 * table a person reviews.
 *
 * `getChartCapabilities` is resolved with a dynamic import so this block fails
 * on its own while the descriptor is still being written, instead of taking the
 * whole catalog file down with it.
 */
async function capabilitiesFor(chartTypeId) {
  const registry = await import("@/lib/visualization/chartRegistry");
  return registry.getChartCapabilities(chartTypeId);
}

const TIME_CONTRACTS = [
  "range", // a start and an end over available periods
  "orderedSequence", // every period in order, no endpoints chosen
  "snapshot", // exactly one period
  "selectedSnapshots", // an explicit set of periods, shown as tabs or averaged
  "twoPeriods", // exactly two ordered periods, for a change calculation
  "none", // the chart has no time axis at all
];

const ALL_CALCULATIONS = [
  "actual",
  "sum",
  "weightedMean",
  "averageSelectedYears",
  "numericChange",
  "percentChange",
  "percentagePointChange",
  "indexed",
  "benchmarkDifference",
  "ranking",
];

const CHANGE_CALCULATIONS = ["numericChange", "percentChange", "percentagePointChange"];

/** Hand-written from the implementation plan's "Capability matrix to encode". */
const CAPABILITY_MATRIX = {
  line: {
    time: ["range", "orderedSequence"],
    presentations: ["combined", "tabs"],
    defaultPresentation: "combined",
    tabsRequired: false,
    calculations: ["actual", "indexed", ...CHANGE_CALCULATIONS, "benchmarkDifference"],
  },
  bar: {
    time: ["selectedSnapshots", "snapshot", "twoPeriods"],
    presentations: ["combined", "tabs"],
    defaultPresentation: "combined",
    tabsRequired: false,
    calculations: ["actual", ...CHANGE_CALCULATIONS, "benchmarkDifference", "ranking"],
  },
  choroplethMap: {
    time: ["snapshot", "selectedSnapshots", "twoPeriods"],
    presentations: ["tabs"],
    defaultPresentation: "tabs",
    tabsRequired: true,
    calculations: ["actual", ...CHANGE_CALCULATIONS, "benchmarkDifference", "ranking"],
  },
  heatmap: {
    time: ["range", "selectedSnapshots"],
    presentations: ["tabs"],
    defaultPresentation: "tabs",
    tabsRequired: true,
    calculations: ["actual", ...CHANGE_CALCULATIONS, "ranking"],
  },
  dumbbell: {
    // The Range chart's two marks ARE the two periods, so a second change
    // transform on top of them would plot a difference of a difference.
    time: ["twoPeriods"],
    presentations: ["rows"],
    defaultPresentation: "rows",
    tabsRequired: false,
    calculations: ["actual"],
  },
  dotPlot: {
    time: ["range", "snapshot", "none"],
    presentations: ["combined", "tabs"],
    defaultPresentation: "combined",
    tabsRequired: false,
    calculations: ["actual", "ranking"],
  },
  forest: {
    // Lower and upper bounds are measure roles. Forest does not inherit
    // Range's two-period rule.
    time: ["snapshot", "none"],
    presentations: ["rows"],
    defaultPresentation: "rows",
    tabsRequired: false,
    calculations: ["actual"],
  },
  scatter: {
    time: ["snapshot", "none"],
    presentations: ["combined", "tabs"],
    defaultPresentation: "combined",
    tabsRequired: false,
    calculations: ["actual", "ranking"],
  },
  bubble: {
    time: ["snapshot", "none"],
    presentations: ["combined", "tabs"],
    defaultPresentation: "combined",
    tabsRequired: false,
    calculations: ["actual", "ranking"],
  },
  pie: {
    time: ["snapshot", "selectedSnapshots"],
    presentations: ["slices", "tabs"],
    defaultPresentation: "slices",
    tabsRequired: false,
    calculations: ["actual", "averageSelectedYears"],
  },
  symbolMap: {
    time: ["snapshot", "selectedSnapshots"],
    presentations: ["tabs"],
    defaultPresentation: "tabs",
    tabsRequired: true,
    calculations: ["actual", "ranking"],
  },
  dataTable: {
    // A table can show anything the backend returns, including the aggregation
    // rules a chart never offers as a control.
    time: TIME_CONTRACTS,
    presentations: ["rows"],
    defaultPresentation: "rows",
    tabsRequired: false,
    calculations: ALL_CALCULATIONS,
  },
};

describe("Workstream A capability matrix", () => {
  it("declares the complete hand-written capability matrix for every chart id", async () => {
    // Every registered chart is in the table, and the table invents nothing.
    expect(Object.keys(CAPABILITY_MATRIX).sort()).toEqual([...CHART_TYPE_IDS].sort());

    for (const [id, expected] of Object.entries(CAPABILITY_MATRIX)) {
      const capability = await capabilitiesFor(id);

      expect([...capability.time.contracts].sort(), `${id}.time`).toEqual(
        [...expected.time].sort(),
      );
      expect([...capability.comparison.presentations].sort(), `${id}.presentations`).toEqual(
        [...expected.presentations].sort(),
      );
      expect(capability.comparison.default, `${id}.defaultPresentation`).toBe(
        expected.defaultPresentation,
      );
      expect(capability.comparison.tabsRequired, `${id}.tabsRequired`).toBe(
        expected.tabsRequired,
      );
      expect([...capability.calculations].sort(), `${id}.calculations`).toEqual(
        [...expected.calculations].sort(),
      );

      // Geography and appearance behaviour is declared, not inferred from the
      // chart id at the call site.
      expect(capability.geography, `${id}.geography`).toEqual(
        expect.objectContaining({ requiresStableIds: expect.any(Boolean) }),
      );
      expect(capability.appearance, `${id}.appearance`).toEqual(
        expect.objectContaining({ colorEncoding: getChartType(id).colorEncoding }),
      );
    }
  });

  it("uses only the declared time-contract vocabulary", async () => {
    for (const id of CHART_TYPE_IDS) {
      const capability = await capabilitiesFor(id);
      expect(capability.time.contracts.length, id).toBeGreaterThan(0);
      for (const contract of capability.time.contracts) {
        expect(TIME_CONTRACTS, `${id}: ${contract}`).toContain(contract);
      }
    }
  });

  it("treats forest endpoints as measures rather than periods", async () => {
    const forest = await capabilitiesFor("forest");
    const dumbbell = await capabilitiesFor("dumbbell");

    // The Range chart's endpoints are two periods...
    expect(dumbbell.time.contracts).toEqual(["twoPeriods"]);
    expect(dumbbell.intervalEndpoints).toBe("period");

    // ...but a forest plot's interval is an estimate with a lower and an upper
    // bound. It must not inherit the two-period rule just because both charts
    // draw a span.
    expect(forest.time.contracts).not.toContain("twoPeriods");
    expect(forest.intervalEndpoints).toBe("measure");
    expect(forest.measureRoles).toEqual(
      expect.arrayContaining(["estimate", "lowerBound", "upperBound"]),
    );
  });

  it("requires tabs for choropleth map heatmap and symbol map comparisons", async () => {
    // On these three the colour IS the value, so a second comparison drawn in
    // the same frame would have to overload the scale with identity.
    for (const id of ["choroplethMap", "heatmap", "symbolMap"]) {
      const capability = await capabilitiesFor(id);
      expect(capability.comparison.presentations, id).toEqual(["tabs"]);
      expect(capability.comparison.tabsRequired, id).toBe(true);
      expect(capability.comparison.default, id).toBe("tabs");
    }

    // ...and Line is the counter-case: tabs are available but never forced.
    const line = await capabilitiesFor("line");
    expect(line.comparison.tabsRequired).toBe(false);
    expect(line.comparison.default).toBe("combined");
  });

  it("never offers a change calculation to the Range chart", async () => {
    const dumbbell = await capabilitiesFor("dumbbell");
    for (const calculation of CHANGE_CALCULATIONS) {
      expect(dumbbell.calculations, calculation).not.toContain(calculation);
    }
  });

  it("offers ranking only where the backend can order the marks", async () => {
    const ranked = [];
    for (const id of CHART_TYPE_IDS) {
      const capability = await capabilitiesFor(id);
      if (capability.calculations.includes("ranking")) ranked.push(id);
    }
    expect(ranked.sort()).toEqual(
      ["bar", "bubble", "choroplethMap", "dataTable", "dotPlot", "heatmap", "scatter", "symbolMap"].sort(),
    );
  });

  it("offers the selected-year average only where a year tab set exists", async () => {
    const averaged = [];
    for (const id of CHART_TYPE_IDS) {
      const capability = await capabilitiesFor(id);
      if (capability.calculations.includes("averageSelectedYears")) averaged.push(id);
    }
    // Donut is the approved case; the data table shows whatever it is given.
    expect(averaged.sort()).toEqual(["dataTable", "pie"]);
  });
});
