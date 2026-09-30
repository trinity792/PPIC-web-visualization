import React from "react";

import VisualizationV3Fixture from "./visualization-v3-fixture";

import { CHART_TYPE_IDS } from "@/lib/visualization/chartRegistry";

// Every drawable chart type; the data table has no picture to compare.
const CHARTS = new Set(CHART_TYPE_IDS.filter((id) => id !== "dataTable"));
const WIDTH_LIMITS = Object.freeze({ min: 280, max: 1200 });

function widthParam(raw) {
  const width = Number(raw);
  return Number.isFinite(width)
    ? Math.min(WIDTH_LIMITS.max, Math.max(WIDTH_LIMITS.min, Math.round(width)))
    : null;
}

export default async function VisualizationV3FixturePage({ searchParams }) {
  const params = await searchParams;
  const chart = CHARTS.has(params?.chart) ? params.chart : "line";
  return (
    <VisualizationV3Fixture
      chart={chart}
      renderer={typeof params?.renderer === "string" ? params.renderer : null}
      scenario={typeof params?.scenario === "string" ? params.scenario : null}
      width={widthParam(params?.width)}
      embedded={params?.embed === "1"}
    />
  );
}
