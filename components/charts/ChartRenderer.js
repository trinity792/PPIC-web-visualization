"use client";

/**
 * ChartRenderer.js — draws one tagged chart result with the library that
 * produced it: PlotlyChart for a "plotly" result, or the chart type's visx
 * component for a "visx" result.
 *
 * It is the one place that knows which component draws which renderer, and the
 * one place that says a chart has finished drawing: its container carries
 * `data-chart-ready="true"` once Plotly reports its graph div, or once a visx
 * drawing has committed. The screenshot tests wait for that mark, whichever
 * library drew the chart. A visx drawing that throws shows the same
 * "Visualization could not be loaded" message as a failed adapter, never a
 * blank area, and is never marked ready.
 *
 * Props:
 *   result     {Object}        — a tagged preview result: { renderer, chartType,
 *                                 data, layout, config } for Plotly, or
 *                                 { renderer, chartType, model } for visx. An
 *                                 untagged result is treated as Plotly.
 *   width      {number}        — exact drawing width for a visx chart, from ChartFrame
 *   height     {number}        — drawing height in pixels
 *   embedded   {boolean}       — read-only iframe output: hides Plotly's modebar
 *   className  {string}        — optional classes for the Plotly container
 *   summary    {string|null}   — optional screen-reader description (Plotly)
 *   onGraphDiv {function|null} — receives Plotly's graph div, for image export
 *
 * Data sources:
 *   - Via props from parent (PreviewPane, the screenshot fixture page)
 *
 * UI Kit reference:
 *   - Implements the reusable "Chart Container" rendering wrapper
 */

import React from "react";

import { AlertCircle } from "lucide-react";

import PlotlyChart from "@/components/charts/PlotlyChart";
import BarChart from "@/components/charts/visx/BarChart";
import LineChart from "@/components/charts/visx/LineChart";
import RangeChart from "@/components/charts/visx/RangeChart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { CHART_HEIGHTS } from "@/lib/constants";

/**
 * chartType → visx component. Each Stage 3 chart workstream adds its drawing
 * here, alongside its model builder and its `VISX_CHART_TYPES` entry.
 */
const VISX_CHARTS = Object.freeze({
  line: LineChart,
  bar: BarChart,
  dumbbell: RangeChart,
});

// ── Helpers ──────────────────────────────────────────────────────────

function RenderingError({ message }) {
  return (
    <Alert variant="destructive" className="max-w-xl">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Visualization could not be loaded</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <p>Source: chart renderer</p>
        <p>Try refreshing or adjust the editor selections.</p>
      </AlertDescription>
    </Alert>
  );
}

/** Catches a visx drawing that throws, so the pane shows an error, not nothing. */
class DrawingBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previous) {
    // A new result gets a fresh attempt without remounting a healthy drawing.
    if (this.state.error && previous.result !== this.props.result) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) return <RenderingError message={this.state.error.message} />;
    return this.props.children;
  }
}

/** Mounts after its sibling drawing commits; never mounts if the drawing threw. */
function DrawnSignal({ result, onDrawn }) {
  React.useEffect(() => {
    onDrawn(result);
  }, [onDrawn, result]);
  return null;
}

// ── Component ────────────────────────────────────────────────────────

export default function ChartRenderer({
  result,
  width = 0,
  height = CHART_HEIGHTS.default,
  embedded = false,
  className = "min-w-0 w-full",
  summary = null,
  onGraphDiv = null,
}) {
  // Ready is tracked per result, so new data clears the mark until it is drawn.
  const [drawnResult, setDrawnResult] = React.useState(null);
  const ready = drawnResult !== null && drawnResult === result;
  const renderer = result?.renderer || "plotly";

  let drawing;
  if (renderer === "visx") {
    const VisxChart = Object.hasOwn(VISX_CHARTS, result.chartType ?? "")
      ? VISX_CHARTS[result.chartType]
      : null;
    drawing = VisxChart ? (
      <DrawingBoundary result={result}>
        <VisxChart model={result.model} width={width} height={height} />
        <DrawnSignal result={result} onDrawn={setDrawnResult} />
      </DrawingBoundary>
    ) : (
      <RenderingError message={`No visx drawing is registered for ${result.chartType}.`} />
    );
  } else {
    drawing = (
      <PlotlyChart
        data={result?.data}
        layout={result?.layout}
        // Embeds are read-only output: hide Plotly's modebar (zoom/pan/etc.)
        // so the shared chart shows no interactive editor controls.
        config={embedded ? { ...result?.config, displayModeBar: false } : result?.config}
        height={height}
        className={className}
        summary={summary}
        onGraphDiv={(graphDiv) => {
          setDrawnResult(result);
          onGraphDiv?.(graphDiv);
        }}
      />
    );
  }

  return (
    <div
      className="min-w-0 w-full"
      data-renderer={renderer}
      data-chart-ready={ready ? "true" : undefined}
    >
      {drawing}
    </div>
  );
}
