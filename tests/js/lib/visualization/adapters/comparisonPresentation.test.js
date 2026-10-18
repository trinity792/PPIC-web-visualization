/**
 * Workstream E - lib/visualization/adapters/, maps.
 *
 * Since renderer plan O the Plotly adapters draw only the two maps (and hand the
 * data table its rows); every other chart draws with visx from a chart model,
 * and the rules those charts share are in `models/presentationRules.test.js`.
 *
 * Tabs are presentation. Switching one shows a different slice of observations
 * that are already loaded; it never redefines the question and never triggers a
 * request.
 */

import { describe, expect, it } from "vitest";

import { adaptObservations } from "@/lib/visualization/adapters";
import { OBSERVATION_STATUS, VALUE_KINDS } from "@/lib/visualization/observationContract";

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

const base = {
  comparisons: COMPARISONS,
  labels: {},
  appearance: {},
  format: {},
};

describe("maps", () => {
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
