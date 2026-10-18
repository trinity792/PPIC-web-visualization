/**
 * Presentation rules every chart model keeps, whichever library draws it.
 *
 * Ported from the Plotly adapter tests (`adapters/comparisonPresentation.test.js`)
 * when renderer plan O removed the non-map Plotly adapters. A model may group,
 * order, or pivot validated observations. It may not calculate: no change, no
 * average, no rank, and no filling of a missing value. Tabs are presentation:
 * switching one shows a different slice of loaded observations and never
 * changes a comparison's color.
 */

import { describe, expect, it } from "vitest";

import { buildChartModel } from "@/lib/visualization/models";
import { OBSERVATION_STATUS, VALUE_KINDS } from "@/lib/visualization/observationContract";
import { officialComparisonScheme, seriesColor } from "@/lib/visualization/palettes";

const COMPARISONS = [
  { id: "cmp_latina", label: "San Francisco Latina Women", color: "Orange" },
  { id: "cmp_white_women", label: "San Francisco White Women", color: "Navy" },
];

const observation = (overrides = {}) => ({
  comparisonId: "cmp_latina",
  comparisonLabel: "San Francisco Latina Women",
  measureId: "Population",
  measureLabel: "Population",
  unit: "people",
  period: 2025,
  geographyId: "06075",
  geographyLabel: "San Francisco",
  categoryId: null,
  categoryLabel: null,
  value: 50000,
  status: OBSERVATION_STATUS.AVAILABLE,
  valueKind: VALUE_KINDS.OBSERVED,
  calculation: { id: "actual", params: {} },
  includedPeriods: null,
  source: "DoF P-3",
  ...overrides,
});

const white = (overrides = {}) =>
  observation({
    comparisonId: "cmp_white_women",
    comparisonLabel: "San Francisco White Women",
    ...overrides,
  });

const lineObservations = () => [
  observation({ period: 2020, value: 40000 }),
  observation({ period: 2025, value: 50000 }),
  observation({ period: 2030, value: 60000, valueKind: VALUE_KINDS.PROJECTED }),
  white({ period: 2020, value: 60000 }),
  white({ period: 2025, value: 63000 }),
  white({ period: 2030, value: 66000, valueKind: VALUE_KINDS.PROJECTED }),
];

function model(chartType, input = {}) {
  const appearance = input.appearance || {};
  return buildChartModel({
    comparisons: COMPARISONS,
    labels: {},
    format: {},
    ...input,
    chartType,
    appearance,
    presentation: { comparisonPresentation: "combined", ...input.presentation, appearance },
  });
}

describe("line", () => {
  it("switches to comparison tabs without changing the question or the colors", () => {
    const combined = model("line", { observations: lineObservations() });
    const tabbed = model("line", {
      observations: lineObservations(),
      presentation: { comparisonPresentation: "tabs", activeTab: "cmp_white_women" },
    });

    expect(tabbed.series.map((series) => series.label)).toEqual(["San Francisco White Women"]);
    const combinedWhite = combined.series.find(
      (series) => series.label === "San Francisco White Women",
    );
    expect(tabbed.series[0].color).toBe(combinedWhite.color);
  });

  it("applies a selected categorical palette without a new data question", () => {
    const appearance = { palette: "ui-kit-blue" };
    const lines = model("line", {
      comparisons: COMPARISONS.map(({ id, label }) => ({ id, label })),
      observations: lineObservations(),
      appearance,
    });

    expect(lines.series.map((series) => series.color)).toEqual([
      seriesColor(appearance, lines.series[0].label, 0),
      seriesColor(appearance, lines.series[1].label, 1),
    ]);
  });

  it("keeps an explicit comparison color above the selected palette", () => {
    const appearance = { palette: "ui-kit-blue" };
    const lines = model("line", {
      comparisons: [
        { ...COMPARISONS[0], color: "Violet" },
        { ...COMPARISONS[1], color: null },
      ],
      observations: lineObservations(),
      appearance,
    });

    expect(lines.series[0].color).toBe("#693692");
    expect(lines.series[1].color).toBe(seriesColor(appearance, lines.series[1].label, 1));
  });

  it("names a series by place only when the chart spans several places", () => {
    const comparisons = [
      { id: "cmp_latina", label: "Latina Women", dimensions: { "Race/Ethnicity": "Hispanic", Sex: "Female" } },
      { id: "cmp_white_women", label: "White Women", dimensions: { "Race/Ethnicity": "White", Sex: "Female" } },
    ];
    const latina = [2020, 2025].flatMap((period, index) => [
      observation({ comparisonLabel: "Latina Women", period, value: 40 + index * 10 }),
      observation({
        comparisonLabel: "Latina Women",
        geographyId: "06037",
        geographyLabel: "Los Angeles",
        period,
        value: 2400 + index * 120,
      }),
    ]);
    const whiteRows = latina.map((row) => ({
      ...row,
      comparisonId: "cmp_white_women",
      comparisonLabel: "White Women",
      value: row.value * 2,
    }));
    const labels = (input) => model("line", input).series.map((series) => series.label);

    expect(labels({ comparisons: comparisons.slice(0, 1), observations: latina })).toEqual([
      "San Francisco Latina Women",
      "Los Angeles Latina Women",
    ]);
    expect(labels({ comparisons, observations: [...latina, ...whiteRows] })).toEqual([
      "San Francisco Latina Women",
      "Los Angeles Latina Women",
      "San Francisco White Women",
      "Los Angeles White Women",
    ]);
    expect(
      labels({
        comparisons,
        observations: [...latina, ...whiteRows].filter((row) => row.geographyLabel === "San Francisco"),
      }),
    ).toEqual(["Latina Women", "White Women"]);
  });

  it("sizes the automatic official palette to every drawn place line", () => {
    const observations = Array.from({ length: 9 }, (_, index) =>
      [2020, 2025].map((period) =>
        observation({
          comparisonLabel: "Black Women",
          geographyId: `region_${index + 1}`,
          geographyLabel: `Region ${index + 1}`,
          period,
          value: 1000 + index + period,
        }),
      ),
    ).flat();
    const lines = model("line", {
      comparisons: [{ id: "cmp_latina", label: "Black Women", dimensions: { "Race/Ethnicity": "Black", Sex: "Female" } }],
      observations,
    });

    expect(lines.series.map((series) => series.color)).toEqual(officialComparisonScheme(9));
  });
});

describe("bar", () => {
  it("draws the value it was given, without recomputing a change", () => {
    const bars = model("bar", {
      comparisons: COMPARISONS.slice(0, 1),
      observations: [
        observation({
          value: 10000,
          valueKind: VALUE_KINDS.DERIVED,
          calculation: { id: "numericChange", params: { startYear: 2020, endYear: 2025 } },
          includedPeriods: [2020, 2025],
        }),
      ],
    });

    expect(bars.bars.map((bar) => bar.value)).toEqual([10000]);
  });

  it("does not reorder a ranked result", () => {
    const bars = model("bar", {
      comparisons: COMPARISONS.slice(0, 1),
      observations: [
        observation({ categoryId: "Fresno", categoryLabel: "Fresno", value: 12000, rank: 1 }),
        observation({ categoryId: "Kern", categoryLabel: "Kern", value: 12000, rank: 2 }),
        observation({ categoryId: "Merced", categoryLabel: "Merced", value: 8000, rank: 3 }),
      ],
    });

    // The backend broke the Fresno/Kern tie by stable label. A client re-sort
    // would be free to break it the other way on the next render.
    expect(bars.categories).toEqual(["Fresno", "Kern", "Merced"]);
  });

  it("groups several selected years by place and colors the year series", () => {
    const regions = ["Bay Area", "Central Coast", "Far North"];
    const years = [2020, 2025, 2030];
    const bars = model("bar", {
      comparisons: [{ id: "cmp_latina", label: "Black Women", dimensions: {} }],
      observations: years.flatMap((period, periodIndex) =>
        regions.map((geographyLabel, regionIndex) =>
          observation({
            comparisonLabel: "Black Women",
            geographyId: `region_${regionIndex}`,
            geographyLabel,
            period,
            value: (periodIndex + 1) * 1000 + regionIndex,
          }),
        ),
      ),
      // A stale period from a previously tabbed chart must not collapse a
      // multi-year bar back to one series.
      presentation: { activePeriod: 2025 },
    });

    expect(bars.series.map((series) => series.label)).toEqual(["2020", "2025", "2030"]);
    expect(bars.series.map((series) => series.color)).toEqual(officialComparisonScheme(3));
    expect(bars.categories).toEqual(regions);
    expect(bars.bars).toHaveLength(9);
  });
});

describe("pie", () => {
  it("draws a selected-years average from the backend's derived row", () => {
    const derived = observation({
      valueKind: VALUE_KINDS.DERIVED,
      calculation: { id: "averageSelectedYears", params: { years: [2020, 2025, 2030] } },
      includedPeriods: [2020, 2025, 2030],
      categoryId: "Hispanic",
      categoryLabel: "Latina",
    });
    const pie = model("pie", {
      comparisons: COMPARISONS.slice(0, 1),
      observations: [derived, { ...derived, categoryId: "White", categoryLabel: "White", value: 63000 }],
      presentation: { comparisonPresentation: "slices" },
    });

    // The model reads the derived row. It does not average the raw years.
    expect(pie.slices.map((slice) => slice.value)).toEqual([50000, 63000]);
    expect(pie.note).toBe("Average of 2020, 2025, and 2030.");
  });
});
