"use client";
/* eslint-disable react/prop-types */
import React from "react";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { Section } from "./Section";
import { COLORS, BASE_PLOTLY_COLORS } from "@/lib/constants";
import {
  DEFAULT_PLOTLY_CONFIG,
  PLOTLY_FONT_FAMILY,
  PLOTLY_GRID_COLOR,
  PLOTLY_SURFACE,
  legendFor,
} from "@/lib/visualization/plotlyDefaults";

const CHART_HEIGHT = 256;

// Hand-built showcase figures reuse the production Plotly defaults so they read
// as one family with the live charts: the shared config (mode bar hidden here),
// surfaces, the bottom-legend rule (with its overlap-clearing anchor), and a
// slightly lighter/smaller label than the production text token.
const baseConfig = { ...DEFAULT_PLOTLY_CONFIG, displayModeBar: false };

const baseLayout = {
  // Bottom margin reserves room for the legendFor("bottom") anchor (y: -0.3).
  margin: { t: 12, r: 16, b: 72, l: 48 },
  font: { family: PLOTLY_FONT_FAMILY, size: 12, color: COLORS.gray5 },
  ...PLOTLY_SURFACE,
  ...legendFor("bottom"),
  hoverlabel: { font: { family: PLOTLY_FONT_FAMILY, size: 13 } },
};

/* ---------- shared card + property primitives ---------- */

function GraphCard({ title, chart, properties }) {
  return (
    <div
      className="rounded-2xl border bg-white p-6 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)]"
      style={{ borderColor: COLORS.gray2 }}
    >
      <h3 className="text-neutral-900" style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>
        {title}
      </h3>
      <div className="mt-3 w-full">{chart}</div>
      <dl className="mt-4 space-y-1.5 border-t pt-4" style={{ borderColor: COLORS.gray1 }}>
        {properties.map((p) => (
          <div key={p.label} className="flex items-start gap-3 text-[13px]" style={{ fontFamily: "var(--font-sans)" }}>
            <dt className="w-32 shrink-0 uppercase tracking-[0.1em] text-neutral-500">{p.label}</dt>
            <dd className="flex flex-wrap items-center gap-2 text-neutral-800">{p.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Swatch({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-3.5 rounded-[3px]" style={{ backgroundColor: color }} />
      {label && <span className="text-neutral-700">{label}</span>}
    </span>
  );
}

/* ---------- data ---------- */

const donutData = [
  { name: "Bay Area", value: 7.7 },
  { name: "Southern California", value: 23.8 },
  { name: "Central Valley", value: 4.3 },
  { name: "Sacramento", value: 2.5 },
  { name: "Other", value: 1.2 },
];

const lineData = [
  { year: "2018", owners: 54.9, renters: 45.1 },
  { year: "2019", owners: 55.3, renters: 44.7 },
  { year: "2020", owners: 55.9, renters: 44.1 },
  { year: "2021", owners: 56.0, renters: 44.0 },
  { year: "2022", owners: 55.6, renters: 44.4 },
  { year: "2023", owners: 55.8, renters: 44.2 },
  { year: "2024", owners: 56.4, renters: 43.6 },
];

const scatterA = [
  { income: 62, cost: 410 }, { income: 71, cost: 520 }, { income: 80, cost: 610 },
  { income: 88, cost: 690 }, { income: 95, cost: 760 }, { income: 104, cost: 880 },
  { income: 112, cost: 940 },
];
const scatterB = [
  { income: 58, cost: 360 }, { income: 66, cost: 440 }, { income: 74, cost: 500 },
  { income: 83, cost: 560 }, { income: 90, cost: 640 }, { income: 99, cost: 700 },
];

const dumbbellData = [
  { region: "Bay Area", start: 712, end: 1180 },
  { region: "Southern CA", start: 540, end: 860 },
  { region: "Central Valley", start: 290, end: 470 },
  { region: "Sacramento", start: 360, end: 590 },
];

/* ---------- plotly figures ---------- */

const donutFigure = {
  data: [
    {
      type: "pie",
      hole: 0.55,
      labels: donutData.map((d) => d.name),
      values: donutData.map((d) => d.value),
      sort: false,
      direction: "clockwise",
      textinfo: "none",
      marker: { colors: BASE_PLOTLY_COLORS, line: { color: "white", width: 1 } },
      hovertemplate: "%{label}: %{value}M<extra></extra>",
    },
  ],
  layout: { ...baseLayout, margin: { t: 12, r: 12, b: 72, l: 12 } },
};

const lineFigure = {
  data: [
    {
      type: "scatter",
      mode: "lines+markers",
      name: "Owners",
      x: lineData.map((d) => d.year),
      y: lineData.map((d) => d.owners),
      line: { color: COLORS.blue3, width: 2.5, shape: "spline" },
      marker: { size: 6 },
      hovertemplate: "%{x}: %{y}%<extra>Owners</extra>",
    },
    {
      type: "scatter",
      mode: "lines+markers",
      name: "Renters",
      x: lineData.map((d) => d.year),
      y: lineData.map((d) => d.renters),
      line: { color: COLORS.orange3, width: 2.5, shape: "spline" },
      marker: { size: 6 },
      hovertemplate: "%{x}: %{y}%<extra>Renters</extra>",
    },
  ],
  layout: {
    ...baseLayout,
    xaxis: { showgrid: false, linecolor: COLORS.gray3, ticks: "outside", tickcolor: COLORS.gray3 },
    yaxis: { gridcolor: PLOTLY_GRID_COLOR, zeroline: false, ticksuffix: "%" },
  },
};

const scatterFigure = {
  data: [
    {
      type: "scatter",
      mode: "markers",
      name: "Coastal",
      x: scatterA.map((d) => d.income),
      y: scatterA.map((d) => d.cost),
      marker: { color: COLORS.blue3, size: 9 },
      hovertemplate: "%{x}k income · %{y}k cost<extra>Coastal</extra>",
    },
    {
      type: "scatter",
      mode: "markers",
      name: "Inland",
      x: scatterB.map((d) => d.income),
      y: scatterB.map((d) => d.cost),
      marker: { color: COLORS.orange3, size: 9 },
      hovertemplate: "%{x}k income · %{y}k cost<extra>Inland</extra>",
    },
  ],
  layout: {
    ...baseLayout,
    // This chart has an x-axis title, so reserve extra bottom margin on top of the
    // shared bottom-legend anchor so the legend clears the axis title/ticks.
    margin: { ...baseLayout.margin, b: 104 },
    xaxis: { gridcolor: PLOTLY_GRID_COLOR, zeroline: false, ticksuffix: "k", title: { text: "Income", font: { size: 12 } } },
    yaxis: { gridcolor: PLOTLY_GRID_COLOR, zeroline: false, ticksuffix: "k" },
  },
};

const dumbbellFigure = {
  data: [
    // Connecting segments (one polyline broken by nulls between regions).
    {
      type: "scatter",
      mode: "lines",
      x: dumbbellData.flatMap((d) => [d.start, d.end, null]),
      y: dumbbellData.flatMap((d) => [d.region, d.region, null]),
      line: { color: COLORS.gray3, width: 3 },
      hoverinfo: "skip",
      showlegend: false,
    },
    {
      type: "scatter",
      mode: "markers",
      name: "2014",
      x: dumbbellData.map((d) => d.start),
      y: dumbbellData.map((d) => d.region),
      marker: { color: COLORS.blue3, size: 13, line: { color: "white", width: 2 } },
      hovertemplate: "%{y}: %{x}k<extra>2014</extra>",
    },
    {
      type: "scatter",
      mode: "markers",
      name: "2024",
      x: dumbbellData.map((d) => d.end),
      y: dumbbellData.map((d) => d.region),
      marker: { color: COLORS.orange3, size: 13, line: { color: "white", width: 2 } },
      hovertemplate: "%{y}: %{x}k<extra>2024</extra>",
    },
  ],
  layout: {
    ...baseLayout,
    margin: { t: 12, r: 16, b: 72, l: 96 },
    xaxis: { gridcolor: PLOTLY_GRID_COLOR, zeroline: false, ticksuffix: "k" },
    yaxis: { automargin: true, ticksuffix: "  " },
  },
};

/* ---------- section ---------- */

export function GraphsShowcase() {
  return (
    <Section
      id="graphs"
      eyebrow="Components"
      title="Example Graphs"
      description="Chart types styled with the PPIC data palette, rendered with Plotly. Categorical series cycle through BASE_PLOTLY_COLORS; comparison pairs lead with blue (baseline) and orange (current)."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Donut */}
        <GraphCard
          title="Donut · Population share by region"
          chart={
            <PlotlyChart
              data={donutFigure.data}
              layout={donutFigure.layout}
              config={baseConfig}
              height={CHART_HEIGHT}
            />
          }
          properties={[
            { label: "Type", value: "Donut / arc" },
            { label: "Hole", value: "0.55" },
            { label: "Slice colors", value: "BASE_PLOTLY_COLORS" },
            { label: "Engine", value: "Plotly pie" },
          ]}
        />

        {/* Dumbbell */}
        <GraphCard
          title="Dumbbell · Median cost 2014 → 2024"
          chart={
            <PlotlyChart
              data={dumbbellFigure.data}
              layout={dumbbellFigure.layout}
              config={baseConfig}
              height={CHART_HEIGHT}
            />
          }
          properties={[
            { label: "Type", value: "Dumbbell / range" },
            {
              label: "Endpoints",
              value: (
                <>
                  <Swatch color={COLORS.blue3} label="2014" />
                  <Swatch color={COLORS.orange3} label="2024" />
                </>
              ),
            },
            { label: "Connector", value: <Swatch color={COLORS.gray3} label="gray3" /> },
            { label: "Engine", value: "Plotly scatter" },
          ]}
        />

        {/* Line */}
        <GraphCard
          title="Line · Owner vs renter share"
          chart={
            <PlotlyChart
              data={lineFigure.data}
              layout={lineFigure.layout}
              config={baseConfig}
              height={CHART_HEIGHT}
            />
          }
          properties={[
            { label: "Type", value: "Multi-series line" },
            {
              label: "Series",
              value: (
                <>
                  <Swatch color={COLORS.blue3} label="Owners" />
                  <Swatch color={COLORS.orange3} label="Renters" />
                </>
              ),
            },
            { label: "Stroke", value: "2.5px · spline" },
            { label: "Grid", value: "Horizontal only" },
          ]}
        />

        {/* Scatter */}
        <GraphCard
          title="Scatter · Income vs housing cost"
          chart={
            <PlotlyChart
              data={scatterFigure.data}
              layout={scatterFigure.layout}
              config={baseConfig}
              height={CHART_HEIGHT}
            />
          }
          properties={[
            { label: "Type", value: "Scatter / XY" },
            {
              label: "Series",
              value: (
                <>
                  <Swatch color={COLORS.blue3} label="Coastal" />
                  <Swatch color={COLORS.orange3} label="Inland" />
                </>
              ),
            },
            { label: "Axes", value: "Income (k) × Cost (k)" },
            { label: "Markers", value: "9px" },
          ]}
        />
      </div>
    </Section>
  );
}
