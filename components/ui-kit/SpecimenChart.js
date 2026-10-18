"use client";

/**
 * SpecimenChart.js — draws a UI Kit example chart with the real renderers, so
 * the UI Kit shows exactly what an editor user gets.
 *
 * `specimenResult` turns a hand-written observation input into the same tagged
 * visx result PreviewContext builds (`buildChartModel`), and `SpecimenChart`
 * draws it the way PreviewPane does: ChartFrame around ChartRenderer.
 *
 * Exports:
 *   specimenObservation(fields) — one observation row with the shared defaults
 *   specimenResult(input)       — { renderer: "visx", chartType, model, frame }
 *   SpecimenChart (default)     — the framed drawing
 *
 * Props (SpecimenChart):
 *   result  {Object} — a tagged visx result from specimenResult
 *   height  {number} — drawing height in pixels
 *
 * Data sources:
 *   - Static demonstration data from the calling showcase
 *
 * UI Kit reference:
 *   - Documents the "Chart Container" pattern with the production renderers
 */

import React from "react";

import ChartFrame from "@/components/charts/ChartFrame";
import ChartRenderer from "@/components/charts/ChartRenderer";

import { UI_KIT_CHART_HEIGHT } from "@/lib/constants";
import { buildChartModel } from "@/lib/visualization/models";

// Every specimen is made-up data; the frame's source line says so.
const SPECIMEN_SOURCE = "Illustrative data";

/** One observation row, filled with the defaults a module response carries. */
export function specimenObservation({
  comparison,
  measure = "Value",
  unit = "number",
  period,
  place = null,
  value,
  role = null,
}) {
  return {
    comparisonId: comparison.id,
    comparisonLabel: comparison.label,
    measureId: measure,
    measureLabel: measure,
    unit,
    period,
    geographyId: place,
    geographyLabel: place,
    categoryId: null,
    categoryLabel: null,
    value,
    status: "available",
    valueKind: "observed",
    calculation: { id: "actual", params: {} },
    includedPeriods: null,
    source: SPECIMEN_SOURCE,
    ...(role ? { measureRole: role } : {}),
  };
}

/** The tagged visx result the editor would draw for this input. */
export function specimenResult({
  chartType,
  comparisons,
  observations,
  labels = {},
  appearance = {},
  presentation = {},
}) {
  const input = {
    chartType,
    comparisons,
    observations,
    // The showcase card carries the title, so the frame draws none.
    labels: { title: "", subtitle: "", footnote: "", ...labels },
    appearance,
    presentation: { comparisonPresentation: "combined", ...presentation, appearance },
    format: {},
  };
  return {
    renderer: "visx",
    chartType,
    model: buildChartModel(input),
    frame: { labels: input.labels, appearance, observations },
  };
}

export default function SpecimenChart({ result, height = UI_KIT_CHART_HEIGHT }) {
  return (
    <ChartFrame
      labels={result.frame.labels}
      appearance={result.frame.appearance}
      observations={result.frame.observations}
      summary={result.model?.summary ?? null}
      legend={result.model?.key ?? null}
      height={height}
      fitContent={Boolean(result.model?.fitContent)}
    >
      {({ width, height: drawingHeight }) => (
        <ChartRenderer result={result} width={width} height={drawingHeight} />
      )}
    </ChartFrame>
  );
}
