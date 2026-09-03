import React from "react";

import VisualizationV3Fixture from "./visualization-v3-fixture";

const CHARTS = new Set(["line", "bar", "dumbbell", "heatmap"]);

export default async function VisualizationV3FixturePage({ searchParams }) {
  const params = await searchParams;
  const chart = CHARTS.has(params?.chart) ? params.chart : "line";
  return <VisualizationV3Fixture chart={chart} />;
}
