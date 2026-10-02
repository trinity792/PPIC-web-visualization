"use client";

/**
 * visualization-v3-fixture.js — the screenshot tests' test-only chart page.
 *
 * Draws one chart from fixed test data, with no network calls, through the
 * same ChartRenderer the editor uses, so the picture is the same every run.
 * ChartRenderer's `data-chart-ready` mark tells Playwright when drawing is done,
 * whichever library drew it.
 *
 * The four approved baselines (line, bar, dumbbell, heatmap with no scenario)
 * keep their original input and pinned Plotly layout. Every other request reads
 * `tests/fixtures/visualization-v3/rendererVisual.js`.
 *
 * Props:
 *   chart     {string}      — chart type id
 *   renderer  {string|null} — preview request ("visx" | "plotly"); ignored when embedded
 *   scenario  {string|null} — rendererVisualScenario name; null keeps the legacy fixture
 *   width     {number|null} — exact plot container width in px
 *   embedded  {boolean}     — embed mode: the renderer request is ignored
 *
 * Data sources:
 *   - tests/fixtures/visualization-v3/ (projections, components of change, renderer scenarios)
 *
 * UI Kit reference:
 *   - None — test-only page
 */

import React, { useMemo } from "react";

import ChartFrame from "@/components/charts/ChartFrame";
import ChartRenderer from "@/components/charts/ChartRenderer";

import { adaptObservations } from "@/lib/visualization/adapters";
import { rendererFor } from "@/lib/visualization/chartRegistry";
import { buildChartModel } from "@/lib/visualization/models";
import { DEMOGRAPHIC_PROJECTIONS_SCHEMA } from "@/lib/visualization/moduleSchemas/demographicProjections";
import { COMPONENTS_OF_CHANGE_ROWS } from "@/tests/fixtures/visualization-v3/componentsOfChange";
import { PROJECTIONS_ROWS } from "@/tests/fixtures/visualization-v3/projections";
import { rendererVisualScenario } from "@/tests/fixtures/visualization-v3/rendererVisual";

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

const LEGACY_CHARTS = new Set(["line", "bar", "dumbbell", "heatmap"]);
const STATIC_PLOTLY_CONFIG = Object.freeze({
  displayModeBar: false,
  responsive: false,
  staticPlot: true,
});
const PLOT_HEIGHT = 560;

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

function legacyInput(chart) {
  const fixture = fixtureFor(chart);
  // Keep every visual baseline's geometry explicit. Plotly's heatmap default
  // reserves more room for its colour scale than the comparison charts do;
  // spelling that margin out prevents an adapter-level layout merge from
  // silently changing the approved matrix and legend placement.
  const fixtureMargin = chart === "heatmap" ? HEATMAP_MARGIN : COMPARISON_MARGIN;
  return {
    chartType: chart,
    ...fixture,
    presentation: {
      comparisonPresentation: chart === "heatmap" ? "tabs" : "combined",
      activeTab: fixture.comparisons[0].id,
    },
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
  };
}

/** The tagged result the editor would draw, or the error it would show. */
function drawFixture(input, renderer) {
  try {
    if (renderer === "visx") {
      return { result: { renderer, chartType: input.chartType, model: buildChartModel(input) } };
    }
    return {
      result: {
        ...adaptObservations(input),
        config: STATIC_PLOTLY_CONFIG,
        renderer,
        chartType: input.chartType,
      },
    };
  } catch (error) {
    return { error };
  }
}

export default function VisualizationV3Fixture({
  chart,
  renderer: requestedRenderer = null,
  scenario = null,
  width = null,
  embedded = false,
}) {
  const legacy = !scenario && LEGACY_CHARTS.has(chart);
  const input = useMemo(
    () => (legacy ? legacyInput(chart) : rendererVisualScenario(chart, scenario || "default")),
    [chart, legacy, scenario],
  );
  // The four approved legacy baselines are Plotly pictures; they stay Plotly
  // until a person approves a visx baseline for them.
  const renderer = rendererFor(
    chart,
    embedded ? null : requestedRenderer ?? (legacy ? "plotly" : null),
  );
  const { result, error } = useMemo(() => drawFixture(input, renderer), [input, renderer]);

  return (
    <main className="min-h-screen bg-white p-8">
      <section className="mx-auto max-w-5xl">
        {chart === "heatmap" ? (
          <div role="tablist" aria-label="Comparisons" className="mb-3 flex gap-2">
            <button type="button" role="tab" aria-selected="true">
              {input.comparisons[0].label}
            </button>
          </div>
        ) : null}
        <div
          data-testid="visual-fixture-plot"
          data-chart={chart}
          data-scenario={scenario || undefined}
          className="border border-neutral-200 bg-white p-4"
          style={width ? { width } : undefined}
        >
          {error ? <p role="alert">{error.message}</p> : null}
          {result?.renderer === "visx" ? (
            <ChartFrame
              labels={input.labels}
              appearance={input.appearance}
              observations={input.observations}
              // The renderer scenarios are projections rows.
              sourceCitations={DEMOGRAPHIC_PROJECTIONS_SCHEMA.sourceCitations}
              summary={result.model?.summary ?? null}
              legend={result.model?.key ?? null}
              height={PLOT_HEIGHT}
              fitContent={Boolean(result.model?.fitContent)}
            >
              {({ width: drawingWidth, height }) => (
                <ChartRenderer result={result} width={drawingWidth} height={height} />
              )}
            </ChartFrame>
          ) : null}
          {result && result.renderer !== "visx" ? (
            <ChartRenderer
              result={result}
              height={PLOT_HEIGHT}
              embedded={embedded}
              summary={`${chart} visualization fixture`}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
