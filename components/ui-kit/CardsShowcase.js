"use client";

/**
 * CardsShowcase.js — statistic and chart-card patterns for PPIC dashboards.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Static demonstration statistics and trend series defined in this file
 *
 * UI Kit reference:
 *   - Documents the "Stat Card" and "Chart Container" patterns
 */

/* eslint-disable react/prop-types */

import React from "react";

import { ArrowRight } from "lucide-react";

import PlotlyChart from "@/components/charts/PlotlyChart";
import { Section } from "@/components/ui-kit/Section";

import { COLORS, UI_KIT_CHART_HEIGHT } from "@/lib/constants";
import {
  DEFAULT_PLOTLY_CONFIG,
  PLOTLY_FONT_FAMILY,
  PLOTLY_GRID_COLOR,
  PLOTLY_SURFACE,
} from "@/lib/visualization/plotlyDefaults";

const stats = [
  { label: "Median House Cost", value: "873.5k" },
  { label: "Total State Population", value: "39.5M" },
  { label: "Median Household Size", value: "2.9" },
];

const trend = [
  { year: "2018", housing: 14.1, population: 39.4 },
  { year: "2019", housing: 14.2, population: 39.5 },
  { year: "2020", housing: 14.3, population: 39.5 },
  { year: "2021", housing: 14.4, population: 39.2 },
  { year: "2022", housing: 14.5, population: 39.0 },
  { year: "2023", housing: 14.6, population: 38.9 },
  { year: "2024", housing: 14.7, population: 39.1 },
  { year: "2025", housing: 14.8, population: 39.3 },
  { year: "2026", housing: 14.9, population: 39.5 },
];

const chartConfig = { ...DEFAULT_PLOTLY_CONFIG, displayModeBar: false };

const trendFigure = {
  data: [
    {
      type: "scatter",
      mode: "lines",
      name: "Total Housing Units",
      x: trend.map(({ year }) => year),
      y: trend.map(({ housing }) => housing),
      line: { color: COLORS.orange3, width: 2 },
      hovertemplate: "%{x}: %{y}M units<extra></extra>",
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Total Population",
      x: trend.map(({ year }) => year),
      y: trend.map(({ population }) => population),
      yaxis: "y2",
      line: { color: COLORS.blue5, width: 2 },
      hovertemplate: "%{x}: %{y}M people<extra></extra>",
    },
  ],
  layout: {
    ...PLOTLY_SURFACE,
    showlegend: false,
    margin: { t: 8, r: 44, b: 32, l: 40 },
    font: { family: PLOTLY_FONT_FAMILY, size: 12, color: COLORS.gray5 },
    xaxis: {
      showgrid: false,
      linecolor: COLORS.gray3,
      tickcolor: COLORS.gray3,
    },
    yaxis: {
      range: [14, 15],
      gridcolor: PLOTLY_GRID_COLOR,
      tickfont: { color: COLORS.orange3 },
      zeroline: false,
    },
    yaxis2: {
      overlaying: "y",
      side: "right",
      range: [38.5, 40],
      showgrid: false,
      tickfont: { color: COLORS.blue5 },
      zeroline: false,
    },
  },
};

export function CardsShowcase() {
  return (
    <Section
      id="cards"
      eyebrow="Components"
      title="Cards & Charts"
      description="Big-number stat cards surface headline figures, while chart cards pair a Georgia title, a 'See More' pill, and a data visualization built on the blue/orange data colors."
    >
      <div className="grid gap-5 sm:grid-cols-3">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-ppic-border bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.08)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-serif text-2xl text-neutral-900">
              Population & Housing Trends
            </h3>
            <div className="mt-2 flex items-center gap-5 font-sans text-[13px] text-neutral-600">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-5 rounded-full bg-ppic-brand"
                />
                Total Housing Units
              </span>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-5 rounded-full bg-ppic-blue-400"
                />
                Total Population
              </span>
            </div>
          </div>
          <SeeMore />
        </div>

        <PlotlyChart
          data={trendFigure.data}
          layout={trendFigure.layout}
          config={chartConfig}
          height={UI_KIT_CHART_HEIGHT}
        />
        <p className="sr-only">
          From 2018 to 2026, housing units rise from 14.1 to 14.9 million while
          population changes from 39.4 to 39.5 million.
        </p>
      </div>
    </Section>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl bg-ppic-card px-7 py-8 text-center shadow-[0px_4px_4px_0px_rgba(0,0,0,0.12)]">
      <p className="font-heading text-lg text-neutral-700">{label}</p>
      <p className="mt-2 font-serif text-[56px] leading-none text-neutral-900">
        {value}
      </p>
    </div>
  );
}

function SeeMore() {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-full border border-black bg-ppic-blue-50 px-4 py-1 font-heading text-[13px] text-ppic-neutral-600 hover:brightness-95"
    >
      See More <ArrowRight aria-hidden="true" className="size-3.5" />
    </button>
  );
}
