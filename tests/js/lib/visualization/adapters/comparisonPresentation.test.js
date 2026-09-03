/**
 * Workstream E - lib/visualization/adapters/.
 *
 * One adapter per chart family. An adapter may group, order, or pivot validated
 * observations into Plotly traces. It may not calculate: no change, no average,
 * no index, no rank, and no filling of a missing value. Everything numeric
 * arrived already decided by the backend, and an adapter that recomputes is an
 * adapter that can disagree with the table and the export sitting next to it.
 *
 * Tabs are presentation. Switching one shows a different slice of observations
 * that are already loaded; it never redefines the question and never triggers a
 * request.
 */

import { describe, expect, it } from "vitest";

import { adaptObservations } from "@/lib/visualization/adapters";
import { displayTableFromObservations } from "@/lib/export/exportTable";
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

const lineObservations = () => [
  observation({ period: 2020, value: 40000 }),
  observation({ period: 2025, value: 50000 }),
  observation({ period: 2030, value: 60000, valueKind: VALUE_KINDS.PROJECTED }),
  observation({
    comparisonId: "cmp_white_women",
    comparisonLabel: "San Francisco White Women",
    period: 2020,
    value: 60000,
  }),
  observation({
    comparisonId: "cmp_white_women",
    comparisonLabel: "San Francisco White Women",
    period: 2025,
    value: 63000,
  }),
  observation({
    comparisonId: "cmp_white_women",
    comparisonLabel: "San Francisco White Women",
    period: 2030,
    value: 66000,
    valueKind: VALUE_KINDS.PROJECTED,
  }),
];

const base = {
  comparisons: COMPARISONS,
  labels: {},
  appearance: {},
  format: {},
};

describe("Line", () => {
  it("builds one named Line trace per comparison", () => {
    const figure = adaptObservations({
      ...base,
      chartType: "line",
      observations: lineObservations(),
      presentation: { comparisonPresentation: "combined" },
    });

    expect(figure.data).toHaveLength(2);
    // The trace name is the resolved comparison label - the same string the
    // table, the CSV, and the accessible description use. Not "trace 0", not
    // the dimension values joined with a slash.
    expect(figure.data.map((trace) => trace.name)).toEqual([
      "San Francisco Latina Women",
      "San Francisco White Women",
    ]);
    expect(figure.data[0].x).toEqual([2020, 2025, 2030]);
    expect(figure.data[0].y).toEqual([40000, 50000, 60000]);
    // A combined line with more than one comparison always shows a legend, or
    // the labels the adapter just resolved never reach the reader.
    expect(figure.layout.showlegend).toBe(true);
  });

  it("keeps a comparison's identity on its trace", () => {
    const figure = adaptObservations({
      ...base,
      chartType: "line",
      observations: lineObservations(),
      presentation: { comparisonPresentation: "combined" },
    });
    expect(figure.data.map((trace) => trace.meta.comparisonId)).toEqual([
      "cmp_latina",
      "cmp_white_women",
    ]);
  });

  it("leaves a gap where a value is unavailable", () => {
    const figure = adaptObservations({
      ...base,
      chartType: "line",
      observations: [
        observation({ period: 2020, value: 40000 }),
        observation({ period: 2025, value: null, status: OBSERVATION_STATUS.SUPPRESSED }),
        observation({ period: 2030, value: 60000 }),
      ],
      presentation: { comparisonPresentation: "combined" },
    });

    // null, not 0 and not a bridged line: a suppressed year is a hole in the
    // series and drawing through it invents a trend.
    expect(figure.data[0].y).toEqual([40000, null, 60000]);
    expect(figure.data[0].connectgaps).toBe(false);
  });

  it("switches to comparison tabs without changing the question or the colours", () => {
    const combined = adaptObservations({
      ...base,
      chartType: "line",
      observations: lineObservations(),
      presentation: { comparisonPresentation: "combined" },
    });
    const tabbed = adaptObservations({
      ...base,
      chartType: "line",
      observations: lineObservations(),
      presentation: { comparisonPresentation: "tabs", activeTab: "cmp_white_women" },
    });

    expect(tabbed.data).toHaveLength(1);
    expect(tabbed.data[0].name).toBe("San Francisco White Women");
    // Same comparison, same colour, whichever presentation it is shown in.
    const combinedWhite = combined.data.find((trace) => trace.name === "San Francisco White Women");
    expect(tabbed.data[0].line.color).toBe(combinedWhite.line.color);
  });

  it("treats geography as a separate series dimension with concise labels", () => {
    const demographicComparisons = [
      {
        id: "cmp_latina",
        label: "Latina Women",
        dimensions: { "Race/Ethnicity": "Hispanic", Sex: "Female" },
      },
      {
        id: "cmp_white_women",
        label: "White Women",
        dimensions: { "Race/Ethnicity": "White", Sex: "Female" },
      },
    ];
    const multiLocation = [
      observation({
        comparisonLabel: "Latina Women",
        period: 2020,
        value: 40,
      }),
      observation({
        comparisonLabel: "Latina Women",
        geographyId: "06037",
        geographyLabel: "Los Angeles",
        period: 2020,
        value: 2400,
      }),
      observation({
        comparisonLabel: "Latina Women",
        period: 2025,
        value: 50,
      }),
      observation({
        comparisonLabel: "Latina Women",
        geographyId: "06037",
        geographyLabel: "Los Angeles",
        period: 2025,
        value: 2520,
      }),
    ];

    const oneDemographic = adaptObservations({
      ...base,
      comparisons: demographicComparisons.slice(0, 1),
      chartType: "line",
      observations: multiLocation,
      presentation: { comparisonPresentation: "combined" },
    });
    expect(oneDemographic.data.map((trace) => trace.name)).toEqual([
      "San Francisco Latina Women",
      "Los Angeles Latina Women",
    ]);
    expect(oneDemographic.data.map((trace) => trace.y)).toEqual([
      [40, 50],
      [2400, 2520],
    ]);

    const whiteRows = multiLocation.map((row) => ({
      ...row,
      comparisonId: "cmp_white_women",
      comparisonLabel: "White Women",
      value: row.value * 2,
    }));
    const twoByTwo = adaptObservations({
      ...base,
      comparisons: demographicComparisons,
      chartType: "line",
      observations: [...multiLocation, ...whiteRows],
      presentation: { comparisonPresentation: "combined" },
    });
    expect(twoByTwo.data.map((trace) => trace.name)).toEqual([
      "San Francisco Latina Women",
      "Los Angeles Latina Women",
      "San Francisco White Women",
      "Los Angeles White Women",
    ]);

    const oneLocation = adaptObservations({
      ...base,
      comparisons: demographicComparisons,
      chartType: "line",
      observations: [...multiLocation, ...whiteRows].filter(
        (row) => row.geographyLabel === "San Francisco",
      ),
      presentation: { comparisonPresentation: "combined" },
    });
    expect(oneLocation.data.map((trace) => trace.name)).toEqual([
      "Latina Women",
      "White Women",
    ]);
  });

  it("sizes the automatic official palette to all rendered geographic lines", () => {
    const regions = Array.from({ length: 9 }, (_, index) => ({
      id: `region_${index + 1}`,
      label: `Region ${index + 1}`,
    }));
    const observations = regions.flatMap((region, regionIndex) =>
      [2020, 2025].map((period) =>
        observation({
          comparisonLabel: "Black Women",
          geographyId: region.id,
          geographyLabel: region.label,
          period,
          value: 1000 + regionIndex + period,
        }),
      ),
    );
    const figure = adaptObservations({
      ...base,
      comparisons: [
        {
          id: "cmp_latina",
          label: "Black Women",
          dimensions: { "Race/Ethnicity": "Black", Sex: "Female" },
        },
      ],
      chartType: "line",
      observations,
      presentation: { comparisonPresentation: "combined" },
    });

    expect(figure.data).toHaveLength(9);
    expect(figure.data.map((trace) => trace.line.color)).toEqual(
      officialComparisonScheme(9),
    );
  });

  it("draws a one-period derived result as a marker", () => {
    const figure = adaptObservations({
      ...base,
      comparisons: [{ id: "cmp_latina", label: "Latina Women" }],
      chartType: "line",
      observations: [
        observation({
          comparisonLabel: "Latina Women",
          period: 2070,
          value: -25,
          valueKind: VALUE_KINDS.DERIVED,
          calculation: {
            id: "percentChange",
            params: { startYear: 2020, endYear: 2070 },
          },
          includedPeriods: [2020, 2070],
        }),
      ],
      presentation: { comparisonPresentation: "combined" },
    });

    expect(figure.data[0]).toMatchObject({
      mode: "markers",
      x: [2070],
      y: [-25],
    });
  });

  it("applies a selected categorical palette without a new data question", () => {
    const automaticComparisons = COMPARISONS.map(({ id, label }) => ({ id, label }));
    const appearance = {
      palette: "ui-kit-blue",
      comparisonColors: {
        cmp_latina: "#CA4F1A",
        cmp_white_women: "#293B54",
      },
    };
    const figure = adaptObservations({
      ...base,
      comparisons: automaticComparisons,
      chartType: "line",
      observations: lineObservations(),
      presentation: { comparisonPresentation: "combined" },
      appearance,
    });

    expect(figure.data.map((trace) => trace.line.color)).toEqual([
      seriesColor(appearance, figure.data[0].name, 0),
      seriesColor(appearance, figure.data[1].name, 1),
    ]);
  });

  it("keeps an explicit comparison color above the selected palette", () => {
    const comparisons = [
      { ...COMPARISONS[0], color: "Violet" },
      { ...COMPARISONS[1], color: null },
    ];
    const appearance = { palette: "ui-kit-blue" };
    const figure = adaptObservations({
      ...base,
      comparisons,
      chartType: "line",
      observations: lineObservations(),
      presentation: { comparisonPresentation: "combined" },
      appearance,
    });

    expect(figure.data[0].line.color).toBe("#693692");
    expect(figure.data[1].line.color).toBe(
      seriesColor(appearance, figure.data[1].name, 1),
    );
  });

  it("turns line markers on and off and preserves markers for one-point results", () => {
    const withMarkers = adaptObservations({
      ...base,
      chartType: "line",
      observations: lineObservations(),
      presentation: { comparisonPresentation: "combined" },
      appearance: { markerMode: "on" },
    });
    const withoutMarkers = adaptObservations({
      ...base,
      chartType: "line",
      observations: lineObservations(),
      presentation: { comparisonPresentation: "combined" },
      appearance: { markerMode: "off" },
    });
    const onePoint = adaptObservations({
      ...base,
      comparisons: COMPARISONS.slice(0, 1),
      chartType: "line",
      observations: [observation()],
      presentation: { comparisonPresentation: "combined" },
      appearance: { markerMode: "off" },
    });

    expect(withMarkers.data.every((trace) => trace.mode === "lines+markers")).toBe(true);
    expect(withoutMarkers.data.every((trace) => trace.mode === "lines")).toBe(true);
    expect(onePoint.data[0].mode).toBe("markers");
  });

  it("passes line spacing to the shared responsive Plotly wrapper", () => {
    const figure = adaptObservations({
      ...base,
      chartType: "line",
      observations: lineObservations(),
      presentation: { comparisonPresentation: "combined" },
      appearance: { horizontalLinePadding: 8, verticalLinePadding: 12 },
    });

    expect(figure.layout.meta.ppicLinePadding).toEqual({
      horizontal: 8,
      vertical: 12,
      horizontalCount: 2,
      verticalCount: 3,
    });
  });
});

describe("scale-driven charts", () => {
  const mapObservations = () => [
    observation({ geographyId: "06075", geographyLabel: "San Francisco", value: 50000 }),
    observation({ geographyId: "06037", geographyLabel: "Los Angeles", value: 2520000 }),
    observation({
      comparisonId: "cmp_white_women",
      comparisonLabel: "San Francisco White Women",
      geographyId: "06075",
      geographyLabel: "San Francisco",
      value: 63000,
    }),
    observation({
      comparisonId: "cmp_white_women",
      comparisonLabel: "San Francisco White Women",
      geographyId: "06037",
      geographyLabel: "Los Angeles",
      value: 1188000,
    }),
  ];

  const geometry = { type: "FeatureCollection", features: [] };

  it("builds one active map from all loaded comparison observations", () => {
    const figure = adaptObservations({
      ...base,
      chartType: "choroplethMap",
      observations: mapObservations(),
      geometry,
      presentation: { comparisonPresentation: "tabs", activeTab: "cmp_white_women" },
    });

    // Both comparisons are loaded; the tab decides which one is drawn. No new
    // request, and nothing about the other comparison is discarded.
    expect(figure.data).toHaveLength(1);
    expect(figure.data[0].locations).toEqual(["06075", "06037"]);
    expect(figure.data[0].z).toEqual([63000, 1188000]);
    expect(figure.data[0].meta.comparisonId).toBe("cmp_white_women");
    expect(figure.layout.geo).toEqual({ fitbounds: "locations", visible: false });
  });

  it("joins geometry by the stable geography id, never by a display label", () => {
    const figure = adaptObservations({
      ...base,
      chartType: "choroplethMap",
      observations: mapObservations(),
      geometry,
      presentation: { comparisonPresentation: "tabs", activeTab: "cmp_latina" },
    });
    expect(figure.data[0].locations).toEqual(["06075", "06037"]);
    expect(figure.data[0].locations).not.toContain("San Francisco");
  });

  it("builds one active Heatmap comparison", () => {
    const figure = adaptObservations({
      ...base,
      chartType: "heatmap",
      observations: [
        observation({ period: 2020, categoryId: "0-4", categoryLabel: "0-4", value: 2500 }),
        observation({ period: 2025, categoryId: "0-4", categoryLabel: "0-4", value: 3000 }),
        observation({ period: 2020, categoryId: "5-9", categoryLabel: "5-9", value: 2800 }),
        observation({ period: 2025, categoryId: "5-9", categoryLabel: "5-9", value: 3500 }),
      ],
      presentation: { comparisonPresentation: "tabs", activeTab: "cmp_latina" },
    });

    // Colour stays available for the measure. Spending it on comparison
    // identity would leave the value with nothing to be drawn in.
    expect(figure.data).toHaveLength(1);
    expect(figure.data[0].z).toEqual([
      [2500, 3000],
      [2800, 3500],
    ]);
    expect(figure.data[0].y).toEqual(["0-4", "5-9"]);
    expect(figure.data[0].colorscale).toBeDefined();
  });

  it("shows one tab axis at a time when years are also tabbed", () => {
    const figure = adaptObservations({
      ...base,
      chartType: "choroplethMap",
      observations: mapObservations(),
      geometry,
      presentation: {
        comparisonPresentation: "tabs",
        activeTab: "cmp_latina",
        primaryTabAxis: "comparison",
        activePeriod: 2025,
      },
    });

    // Two nested rows of indistinguishable tabs is not navigable. One axis is
    // primary; the other is a clearly labelled secondary selector.
    expect(figure.tabs.primary.axis).toBe("comparison");
    expect(figure.tabs.secondary.axis).toBe("period");
    expect(figure.tabs.secondary.label).toEqual(expect.any(String));
  });

  it("draws county boundaries beneath Symbol Map markers", () => {
    const countyGeometry = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { GEOID: "06075" },
          geometry: {
            type: "Polygon",
            coordinates: [[[-123, 38], [-122, 38], [-122, 37], [-123, 38]]],
          },
        },
        {
          type: "Feature",
          properties: { GEOID: "06037" },
          geometry: {
            type: "Polygon",
            coordinates: [[[-119, 35], [-118, 35], [-118, 34], [-119, 35]]],
          },
        },
      ],
    };
    const figure = adaptObservations({
      ...base,
      comparisons: COMPARISONS.slice(0, 1),
      chartType: "symbolMap",
      observations: mapObservations().slice(0, 2),
      geometry: {
        points: {
          "06075": [-122.44, 37.76],
          "06037": [-118.24, 34.05],
        },
        geojson: countyGeometry,
      },
      presentation: { comparisonPresentation: "tabs", activeTab: "cmp_latina" },
    });

    expect(figure.data).toHaveLength(2);
    expect(figure.data[0]).toMatchObject({
      type: "scattergeo",
      mode: "lines",
      hoverinfo: "skip",
      meta: { role: "geography-background" },
    });
    expect(figure.data[0].lon).toEqual([
      -123, -122, -122, -123, null,
      -119, -118, -118, -119, null,
    ]);
    expect(figure.data[0].lat).toEqual([
      38, 38, 37, 38, null,
      35, 35, 34, 35, null,
    ]);
    expect(figure.data[1]).toMatchObject({
      type: "scattergeo",
      name: "San Francisco Latina Women",
      showlegend: false,
      lon: [-122.44, -118.24],
      lat: [37.76, 34.05],
      text: ["San Francisco", "Los Angeles"],
    });
    expect(figure.layout.showlegend).toBe(false);
  });
});

describe("Donut", () => {
  it("builds a Donut average from a backend-derived row", () => {
    const derived = observation({
      value: 50000,
      valueKind: VALUE_KINDS.DERIVED,
      calculation: { id: "averageSelectedYears", params: { years: [2020, 2025, 2030] } },
      includedPeriods: [2020, 2025, 2030],
      categoryId: "Hispanic",
      categoryLabel: "Latina",
    });

    const figure = adaptObservations({
      ...base,
      chartType: "pie",
      observations: [
        derived,
        { ...derived, categoryId: "White", categoryLabel: "White", value: 63000 },
      ],
      presentation: { comparisonPresentation: "slices", hole: 0.5 },
    });

    expect(figure.data[0].values).toEqual([50000, 63000]);
    expect(figure.data[0].labels).toEqual(["Latina", "White"]);
    expect(figure.data[0].hole).toBe(0.5);
    // The adapter reads the derived row. It does not average the raw years -
    // that would produce a second implementation of the mean, one that does not
    // know a suppressed year makes the average unavailable.
    expect(figure.layout.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Average of 2020, 2025, and 2030." }),
      ]),
    );
  });

  it("uses year tabs when the reader chose tabs over the average", () => {
    const figure = adaptObservations({
      ...base,
      chartType: "pie",
      observations: [
        observation({ period: 2020, categoryId: "Hispanic", categoryLabel: "Latina", value: 40000 }),
        observation({ period: 2025, categoryId: "Hispanic", categoryLabel: "Latina", value: 50000 }),
      ],
      presentation: { comparisonPresentation: "slices", activePeriod: 2025 },
    });

    expect(figure.data[0].values).toEqual([50000]);
    expect(figure.tabs.primary.axis).toBe("period");
  });
});

describe("Forest", () => {
  it("keeps a Forest interval tied to measure endpoints", () => {
    const figure = adaptObservations({
      ...base,
      chartType: "forest",
      observations: [
        observation({
          measureId: "Estimate",
          measureLabel: "Estimate",
          value: 12,
          categoryId: "Fresno",
          categoryLabel: "Fresno",
          measureRole: "estimate",
        }),
        observation({
          measureId: "Lower",
          measureLabel: "Lower bound",
          value: 10,
          categoryId: "Fresno",
          categoryLabel: "Fresno",
          measureRole: "lowerBound",
        }),
        observation({
          measureId: "Upper",
          measureLabel: "Upper bound",
          value: 14,
          categoryId: "Fresno",
          categoryLabel: "Fresno",
          measureRole: "upperBound",
        }),
      ],
      presentation: { comparisonPresentation: "rows" },
    });

    // The span is an uncertainty interval, not a change between two years. A
    // forest plot that inherits the Range chart's two-period rule labels a
    // confidence interval as a time trend.
    expect(figure.data[0].x).toEqual([12]);
    expect(figure.data[0].error_x).toMatchObject({ array: [2], arrayminus: [2] });
    expect(figure.layout.xaxis.title.text).not.toMatch(/year/i);
    expect(JSON.stringify(figure.data)).not.toContain("2020");
  });
});

describe("Bar", () => {
  it("groups several selected years by geography and colors the year series", () => {
    const regions = [
      "Bay Area",
      "Central Coast",
      "Far North",
      "Inland Empire",
      "Los Angeles (Regional)",
      "North San Joaquin Valley",
      "Sacramento (Regional)",
      "San Diego (Regional)",
      "South San Joaquin Valley",
    ];
    const years = [2020, 2025, 2030];
    const observations = years.flatMap((period, periodIndex) =>
      regions.map((geographyLabel, regionIndex) =>
        observation({
          comparisonLabel: "Black Women",
          geographyId: `region_${regionIndex}`,
          geographyLabel,
          period,
          value: (periodIndex + 1) * 1000 + regionIndex,
        }),
      ),
    );
    const figure = adaptObservations({
      ...base,
      comparisons: [{ id: "cmp_latina", label: "Black Women", dimensions: {} }],
      chartType: "bar",
      observations,
      // A stale period from a previously tabbed chart must not collapse a
      // multi-year Bar back to one trace.
      presentation: { comparisonPresentation: "combined", activePeriod: 2025 },
    });

    expect(figure.data).toHaveLength(3);
    expect(figure.data.map((trace) => trace.name)).toEqual(["2020", "2025", "2030"]);
    expect(figure.data.map((trace) => trace.marker.color)).toEqual(
      officialComparisonScheme(3),
    );
    expect(figure.data.every((trace) => trace.x.length === 9)).toBe(true);
    expect(figure.data[0].x).toEqual(regions);
    expect(figure.data.map((trace) => trace.meta.period)).toEqual(years);
    expect(figure.layout).toMatchObject({ barmode: "group", showlegend: true });

    const table = displayTableFromObservations({ observations, presentation: {} });
    expect(table.rows).toHaveLength(27);
    expect(new Set(table.rows.map((row) => row[2]))).toEqual(new Set(years));
    expect(table.exportRows).toHaveLength(27);
  });
});

describe("adapters do not calculate", () => {
  it("draws the value it was given, without recomputing a change", () => {
    const change = observation({
      value: 10000,
      valueKind: VALUE_KINDS.DERIVED,
      calculation: { id: "numericChange", params: { startYear: 2020, endYear: 2025 } },
      includedPeriods: [2020, 2025],
    });

    const figure = adaptObservations({
      ...base,
      chartType: "bar",
      observations: [change],
      presentation: { comparisonPresentation: "combined" },
    });

    expect(figure.data[0].y).toEqual([10000]);
  });

  it("does not reorder a ranked result", () => {
    const ranked = [
      observation({ categoryId: "Fresno", categoryLabel: "Fresno", value: 12000, rank: 1 }),
      observation({ categoryId: "Kern", categoryLabel: "Kern", value: 12000, rank: 2 }),
      observation({ categoryId: "Merced", categoryLabel: "Merced", value: 8000, rank: 3 }),
    ];

    const figure = adaptObservations({
      ...base,
      chartType: "bar",
      observations: ranked,
      presentation: { comparisonPresentation: "combined" },
    });

    // The backend broke the Fresno/Kern tie by stable label. A client re-sort
    // would be free to break it the other way on the next render.
    expect(figure.data[0].x).toEqual(["Fresno", "Kern", "Merced"]);
  });

  it("does not fill a missing value with a neighbouring one", () => {
    const figure = adaptObservations({
      ...base,
      chartType: "bar",
      observations: [
        observation({ categoryId: "Fresno", categoryLabel: "Fresno", value: 12000 }),
        observation({
          categoryId: "Alpine",
          categoryLabel: "Alpine",
          value: null,
          status: OBSERVATION_STATUS.SUPPRESSED,
        }),
      ],
      presentation: { comparisonPresentation: "combined" },
    });

    expect(figure.data[0].y).toEqual([12000, null]);
    expect(figure.data[0].y).not.toContain(0);
  });
});
