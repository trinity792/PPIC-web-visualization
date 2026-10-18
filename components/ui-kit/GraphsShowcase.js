"use client";

/**
 * GraphsShowcase.js — chart-type specimens drawn with the production renderers,
 * and their visual properties.
 *
 * Each specimen goes through the same model builders, ChartFrame, and
 * ChartRenderer as the editor (renderer plan O), so the UI Kit shows exactly
 * what users get. The key swatches below each chart are read from the built
 * model, so they cannot drift from the drawing.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Static demonstration datasets defined in this file
 *
 * UI Kit reference:
 *   - Documents the "Chart Container" pattern and supported chart types
 */

import React from "react";

import { Section } from "@/components/ui-kit/Section";
import SpecimenChart, {
  specimenObservation,
  specimenResult,
} from "@/components/ui-kit/SpecimenChart";

import { UI_KIT_CHART_HEIGHT } from "@/lib/constants";

/**
 * ======================================================================
 * Demonstration data
 * ======================================================================
 */

const donutData = [
  { name: "Bay Area", value: 7.7 },
  { name: "Southern California", value: 23.8 },
  { name: "Central Valley", value: 4.3 },
  { name: "Sacramento", value: 2.5 },
  { name: "Other", value: 1.2 },
];

const lineData = [
  { year: 2018, owners: 54.9, renters: 45.1 },
  { year: 2019, owners: 55.3, renters: 44.7 },
  { year: 2020, owners: 55.9, renters: 44.1 },
  { year: 2021, owners: 56.0, renters: 44.0 },
  { year: 2022, owners: 55.6, renters: 44.4 },
  { year: 2023, owners: 55.8, renters: 44.2 },
  { year: 2024, owners: 56.4, renters: 43.6 },
];

const scatterData = {
  coastal: [
    { income: 62, cost: 410 }, { income: 71, cost: 520 }, { income: 80, cost: 610 },
    { income: 88, cost: 690 }, { income: 95, cost: 760 }, { income: 104, cost: 880 },
    { income: 112, cost: 940 },
  ],
  inland: [
    { income: 58, cost: 360 }, { income: 66, cost: 440 }, { income: 74, cost: 500 },
    { income: 83, cost: 560 }, { income: 90, cost: 640 }, { income: 99, cost: 700 },
  ],
};

const dumbbellData = [
  { region: "Bay Area", start: 712, end: 1180 },
  { region: "Southern CA", start: 540, end: 860 },
  { region: "Central Valley", start: 290, end: 470 },
  { region: "Sacramento", start: 360, end: 590 },
];

// ── Specimens (built once; the data never changes) ────────────────────

const population = { id: "population", label: "Population" };
const donut = specimenResult({
  chartType: "pie",
  comparisons: [population],
  observations: donutData.map(({ name, value }) =>
    specimenObservation({
      comparison: population,
      measure: "Population (millions)",
      period: 2024,
      place: name,
      value,
    }),
  ),
  appearance: { hole: 0.55 },
});

const medianCost = { id: "cost", label: "Median cost" };
const dumbbell = specimenResult({
  chartType: "dumbbell",
  comparisons: [medianCost],
  observations: dumbbellData.flatMap(({ region, start, end }) =>
    [[2014, start], [2024, end]].map(([period, value]) =>
      specimenObservation({
        comparison: medianCost,
        measure: "Median cost ($k)",
        period,
        place: region,
        value,
      }),
    ),
  ),
});

const owners = { id: "owners", label: "Owners" };
const renters = { id: "renters", label: "Renters" };
const line = specimenResult({
  chartType: "line",
  comparisons: [owners, renters],
  observations: lineData.flatMap(({ year, ...shares }) =>
    [owners, renters].map((comparison) =>
      specimenObservation({
        comparison,
        measure: "Share of households",
        unit: "percent",
        period: year,
        place: "California",
        value: shares[comparison.id],
      }),
    ),
  ),
});

const coastal = { id: "coastal", label: "Coastal" };
const inland = { id: "inland", label: "Inland" };
const scatter = specimenResult({
  chartType: "scatter",
  comparisons: [coastal, inland],
  observations: [coastal, inland].flatMap((comparison) =>
    scatterData[comparison.id].flatMap(({ income, cost }, index) => {
      const point = { comparison, period: 2024, place: `${comparison.label} ${index + 1}` };
      return [
        specimenObservation({ ...point, measure: "Housing cost ($k)", value: cost }),
        specimenObservation({ ...point, measure: "Income ($k)", value: income, role: "x" }),
      ];
    }),
  ),
  labels: { xAxis: "Income ($k)", yAxis: "Housing cost ($k)" },
});

/**
 * ======================================================================
 * Showcase Component
 * ======================================================================
 */

export function GraphsShowcase() {
  return (
    <Section
      id="graphs"
      eyebrow="Components"
      title="Example Graphs"
      description="Chart types drawn with the same visx renderer, frame, and color rules as the editor. Comparison colors come from the official PPIC scheme; the swatches below each chart are read from the drawn chart's key."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <GraphCard
          title="Donut · Population share by region"
          summary="Southern California has the largest population share at 23.8 million; the Bay Area follows at 7.7 million."
          result={donut}
          properties={[
            { label: "Type", value: "Pie, donut variant" },
            { label: "Hole", value: "0.55 of the radius" },
            { label: "Slices", value: "Named by place, in data order" },
          ]}
        />

        <GraphCard
          title="Dumbbell · Median cost 2014 → 2024"
          summary="Median costs increase in every displayed region from 2014 to 2024."
          result={dumbbell}
          properties={[
            { label: "Type", value: "Range (dumbbell)" },
            { label: "Ends", value: "One color per end" },
            { label: "Axis", value: "Fits the data" },
          ]}
        />

        <GraphCard
          title="Line · Owner vs renter share"
          summary="The owner share rises from 54.9 percent in 2018 to 56.4 percent in 2024 while the renter share declines."
          result={line}
          properties={[
            { label: "Type", value: "Multi-series line" },
            { label: "Grid", value: "Horizontal only" },
          ]}
        />

        <GraphCard
          title="Scatter · Income vs housing cost"
          summary="The sample shows housing costs increasing with income for both coastal and inland observations."
          result={scatter}
          properties={[
            { label: "Type", value: "Scatter / XY" },
            { label: "Axes", value: "Income ($k) × Cost ($k)" },
          ]}
        />
      </div>
    </Section>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function GraphCard({ title, summary, result, properties }) {
  const keyEntries = result.model?.key?.entries || [];
  const rows = keyEntries.length
    ? [
        ...properties,
        {
          label: "Key",
          value: keyEntries.map((entry) => (
            <Swatch key={entry.id ?? entry.label} color={entry.color} label={entry.label} />
          )),
        },
        { label: "Engine", value: "visx (same as the editor)" },
      ]
    : [...properties, { label: "Engine", value: "visx (same as the editor)" }];
  return (
    <div className="rounded-2xl border border-ppic-border bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.08)]">
      <h3 className="font-serif text-[22px] text-neutral-900">{title}</h3>
      <div className="mt-3 w-full">
        <SpecimenChart result={result} height={UI_KIT_CHART_HEIGHT} />
      </div>
      <p className="sr-only">{summary}</p>
      <dl className="mt-4 space-y-1.5 border-t border-ppic-neutral-50 pt-4">
        {rows.map((property) => (
          <div
            key={property.label}
            className="flex items-start gap-3 font-sans text-[13px]"
          >
            <dt className="w-32 shrink-0 uppercase tracking-[0.1em] text-neutral-500">
              {property.label}
            </dt>
            <dd className="flex flex-wrap items-center gap-2 text-neutral-800">
              {property.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Swatch({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-3.5 rounded-[3px]"
        style={{ backgroundColor: color }}
      />
      {label && <span className="text-neutral-700">{label}</span>}
    </span>
  );
}
