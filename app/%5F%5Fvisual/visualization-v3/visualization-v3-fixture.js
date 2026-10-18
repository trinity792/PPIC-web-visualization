"use client";

/**
 * visualization-v3-fixture.js — the screenshot tests' test-only chart page.
 *
 * Draws one chart from fixed test data, with no network calls, through the
 * same ChartFrame and ChartRenderer the editor uses, so the picture is the
 * same every run. ChartRenderer's `data-chart-ready` mark tells Playwright
 * when drawing is done, whichever library drew it.
 *
 * Every request reads `tests/fixtures/visualization-v3/rendererVisual.js`
 * (scenario "default" when none is named). The four legacy Plotly baselines
 * and their pinned input were retired in renderer plan O, when Plotly stopped
 * drawing anything but maps.
 *
 * Props:
 *   chart     {string}      — chart type id
 *   scenario  {string|null} — rendererVisualScenario name; null means "default"
 *   width     {number|null} — exact plot container width in px
 *   embedded  {boolean}     — embed mode: no Plotly modebar
 *
 * Data sources:
 *   - tests/fixtures/visualization-v3/rendererVisual.js
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
import { rendererVisualScenario } from "@/tests/fixtures/visualization-v3/rendererVisual";

const STATIC_PLOTLY_CONFIG = Object.freeze({
  displayModeBar: false,
  responsive: false,
  staticPlot: true,
});
const PLOT_HEIGHT = 560;

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
  scenario = null,
  width = null,
  embedded = false,
}) {
  const input = useMemo(
    () => rendererVisualScenario(chart, scenario || "default"),
    [chart, scenario],
  );
  const renderer = rendererFor(chart);
  const { result, error } = useMemo(() => drawFixture(input, renderer), [input, renderer]);
  const visx = result?.renderer === "visx";

  return (
    <main className="min-h-screen bg-white p-8">
      <section className="mx-auto max-w-5xl">
        <div
          data-testid="visual-fixture-plot"
          data-chart={chart}
          data-scenario={scenario || undefined}
          className="border border-neutral-200 bg-white p-4"
          style={width ? { width } : undefined}
        >
          {error ? <p role="alert">{error.message}</p> : null}
          {/* Maps sit in the PPIC frame as in the editor (owner, 2026-10-12). */}
          {result ? (
            <ChartFrame
              labels={input.labels}
              appearance={input.appearance}
              observations={input.observations}
              // The renderer scenarios are projections rows.
              sourceCitations={DEMOGRAPHIC_PROJECTIONS_SCHEMA.sourceCitations}
              summary={(visx ? result.model?.summary : result.summary) ?? null}
              legend={(visx ? result.model?.key : result.key) ?? null}
              height={PLOT_HEIGHT}
              fitContent={visx && Boolean(result.model?.fitContent)}
              aspectRatio={visx ? null : result.aspectRatio ?? null}
            >
              {({ width: drawingWidth, height }) => (
                <ChartRenderer
                  result={result}
                  width={drawingWidth}
                  height={height}
                  embedded={embedded}
                />
              )}
            </ChartFrame>
          ) : null}
        </div>
      </section>
    </main>
  );
}
