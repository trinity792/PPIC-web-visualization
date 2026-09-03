/**
 * Workstream E - value ramps stay separate from comparison colours.
 *
 * Belongs to `toPlotly.palette.test.js` and folds back into it once
 * `lib/visualization/adapters/` exists. Split out only so an unwritten module
 * does not stop the live palette-plumbing tests from collecting.
 */

import { describe, expect, it } from "vitest";

/**
 * Workstream E - value ramps stay separate from comparison colours.
 *
 * A choropleth and a heatmap spend colour on the value itself. If the
 * comparison palette leaked into their scale, a reader would be looking at a
 * legend whose colours mean "which group" and a map whose colours mean "how
 * many" - drawn from the same ten hues.
 */
const v3Palettes = () => import("@/lib/visualization/palettes");
const v3Adapters = () => import("@/lib/visualization/adapters");

describe("Workstream E scale charts", () => {
  it("uses official sequential and diverging ramps for scale charts", async () => {
    const { rampFor: v3RampFor } = await v3Palettes();
    const { PPIC_SEQUENTIAL, PPIC_CHOROPLETH_DIVERGENT } = await import(
      "@/lib/visualization/ppicRamps"
    );

    expect(v3RampFor({ palette: "ppic-sequential" }, { kind: "sequential" })).toEqual(
      PPIC_SEQUENTIAL,
    );
    expect(v3RampFor({ palette: "ppic-diverging" }, { kind: "diverging" })).toEqual(
      PPIC_CHOROPLETH_DIVERGENT,
    );
  });

  it("does not consume categorical comparison colours as a value ramp", async () => {
    const { adaptObservations } = await v3Adapters();
    const { officialComparisonScheme } = await v3Palettes();

    const figure = adaptObservations({
      chartType: "choroplethMap",
      comparisons: [{ id: "cmp_a", label: "A" }],
      observations: [
        {
          comparisonId: "cmp_a",
          comparisonLabel: "A",
          measureId: "Population",
          measureLabel: "Population",
          unit: "people",
          period: 2025,
          geographyId: "06075",
          geographyLabel: "San Francisco",
          categoryId: null,
          categoryLabel: null,
          value: 50000,
          status: "available",
          valueKind: "observed",
          calculation: { id: "actual", params: {} },
          includedPeriods: null,
          source: "DoF P-3",
        },
      ],
      geometry: { type: "FeatureCollection", features: [] },
      presentation: { comparisonPresentation: "tabs", activeTab: "cmp_a" },
      labels: {},
      appearance: {},
      format: {},
    });

    const categorical = new Set(officialComparisonScheme(10).map((hex) => hex.toLowerCase()));
    const scaleColors = (figure.data[0].colorscale || []).map(([, color]) =>
      String(color).toLowerCase(),
    );
    expect(scaleColors.length).toBeGreaterThan(0);
    // The ramp is a ramp. It is not the first two entries of the group scheme.
    expect(scaleColors.filter((color) => categorical.has(color))).toEqual([]);
  });
});
