"use client";

import React, { useMemo, useState } from "react";

import PlotlyChart from "@/components/charts/PlotlyChart";
import { adaptObservations } from "@/lib/visualization/adapters";
import { COMPONENTS_OF_CHANGE_ROWS } from "@/tests/fixtures/visualization-v3/componentsOfChange";
import { PROJECTIONS_ROWS } from "@/tests/fixtures/visualization-v3/projections";

const COMPARISONS = Object.freeze([
  { id: "cmp_latina", label: "San Francisco Latina Women" },
  { id: "cmp_white", label: "San Francisco White Women" },
  { id: "cmp_latino", label: "San Francisco Latino Men" },
  { id: "cmp_black", label: "San Francisco Black Women" },
]);

const DIMENSIONS = Object.freeze({
  cmp_latina: ["Hispanic", "Female"],
  cmp_white: ["White", "Female"],
  cmp_latino: ["Hispanic", "Male"],
  cmp_black: ["Black", "Female"],
});

const COMPARISON_MARGIN = Object.freeze({ l: 90, r: 30, t: 30, b: 70 });
const HEATMAP_MARGIN = Object.freeze({ l: 80, r: 80, t: 100, b: 80 });

function observation(comparison, row, extras = {}) {
  const value = row.Population ?? row.value;
  return {
    comparisonId: comparison.id,
    comparisonLabel: comparison.label,
    measureId: row.measureId || "Population",
    measureLabel: row.measureId || "Population",
    unit: row.measureId === "Births" ? "count" : "people",
    period: row.Year,
    geographyId: row.Location,
    geographyLabel: row.Location,
    categoryId: null,
    categoryLabel: null,
    value: row.status === "available" ? value : null,
    status: row.status,
    valueKind: row.valueKind,
    calculation: { id: "actual", params: {} },
    includedPeriods: null,
    source: row.Source,
    ...extras,
  };
}

function lineObservations() {
  return COMPARISONS.flatMap((comparison) => {
    const [race, sex] = DIMENSIONS[comparison.id];
    return PROJECTIONS_ROWS.filter(
      (row) =>
        row.Location === "San Francisco" &&
        row["Race/Ethnicity"] === race &&
        row.Sex === sex &&
        row["Age Group"] === "All Ages" &&
        row.Source === "DoF P-3",
    ).map((row) => observation(comparison, row));
  });
}

function barObservations() {
  const rows = COMPONENTS_OF_CHANGE_ROWS.filter(
    (row) => row.measureId === "Births" && row.Source === "DoF",
  );
  return COMPARISONS.flatMap((comparison, comparisonIndex) =>
    rows
      .filter((row) => row.Year === (comparisonIndex % 2 ? 2020 : 2025))
      .map((row) =>
        observation(comparison, row, {
          value: row.status === "available" ? row.value * (1 + comparisonIndex * 0.08) : null,
          categoryId: row.Location,
          categoryLabel: row.Location,
        }),
      ),
  );
}

function rangeObservations() {
  const comparison = COMPARISONS[0];
  return COMPONENTS_OF_CHANGE_ROWS.filter(
    (row) => row.measureId === "Births" && row.Source === "DoF",
  ).map((row) =>
    observation(comparison, row, {
      categoryId: row.Location,
      categoryLabel: row.Location,
    }),
  );
}

function heatmapObservations() {
  const comparison = COMPARISONS[0];
  return PROJECTIONS_ROWS.filter(
    (row) =>
      row.Location === "San Francisco" &&
      row["Race/Ethnicity"] === "Hispanic" &&
      row.Sex === "Female" &&
      ["0-4", "5-9"].includes(row["Age Group"]),
  ).map((row) =>
    observation(comparison, row, {
      categoryId: row["Age Group"],
      categoryLabel: row["Age Group"],
    }),
  );
}

function fixtureFor(chart) {
  if (chart === "bar") {
    return { observations: barObservations(), comparisons: COMPARISONS };
  }
  if (chart === "dumbbell") {
    return { observations: rangeObservations(), comparisons: [COMPARISONS[0]] };
  }
  if (chart === "heatmap") {
    return { observations: heatmapObservations(), comparisons: [COMPARISONS[0]] };
  }
  return { observations: lineObservations(), comparisons: COMPARISONS };
}

export default function VisualizationV3Fixture({ chart }) {
  const [ready, setReady] = useState(false);
  const fixture = useMemo(() => fixtureFor(chart), [chart]);
  // Keep every visual baseline's geometry explicit. Plotly's heatmap default
  // reserves more room for its colour scale than the comparison charts do;
  // spelling that margin out prevents an adapter-level layout merge from
  // silently changing the approved matrix and legend placement.
  const fixtureMargin = chart === "heatmap" ? HEATMAP_MARGIN : COMPARISON_MARGIN;
  const presentation = {
    comparisonPresentation: chart === "heatmap" ? "tabs" : "combined",
    activeTab: fixture.comparisons[0].id,
  };
  const figure = useMemo(
    () =>
      adaptObservations({
        chartType: chart,
        ...fixture,
        presentation,
        labels: {},
        appearance: {
          layout: {
            autosize: true,
            font: { family: "Arial, sans-serif", size: 14, color: "#191918" },
            margin: fixtureMargin,
            paper_bgcolor: "#FFFFFF",
            plot_bgcolor: "#FFFFFF",
            xaxis: { gridcolor: "#DDDDDD", zeroline: false },
            yaxis: { gridcolor: "#DDDDDD", zeroline: false },
          },
        },
        format: {},
      }),
    [chart, fixture, fixtureMargin],
  );

  return (
    <main className="min-h-screen bg-white p-8">
      <section className="mx-auto max-w-5xl">
        {chart === "heatmap" ? (
          <div role="tablist" aria-label="Comparisons" className="mb-3 flex gap-2">
            <button type="button" role="tab" aria-selected="true">
              {fixture.comparisons[0].label}
            </button>
          </div>
        ) : null}
        <div
          data-testid="visual-fixture-plot"
          data-chart={chart}
          data-plot-ready={ready ? "true" : "false"}
          className="border border-neutral-200 bg-white p-4"
        >
          <PlotlyChart
            data={figure.data}
            layout={figure.layout}
            config={{ displayModeBar: false, responsive: false, staticPlot: true }}
            height={560}
            summary={`${chart} visualization fixture`}
            onGraphDiv={() => setReady(true)}
          />
        </div>
      </section>
    </main>
  );
}
