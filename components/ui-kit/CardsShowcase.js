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

import React from "react";

import { ArrowRight } from "lucide-react";

import { Section } from "@/components/ui-kit/Section";
import SpecimenChart, {
  specimenObservation,
  specimenResult,
} from "@/components/ui-kit/SpecimenChart";

import { UI_KIT_CHART_HEIGHT } from "@/lib/constants";

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

// Drawn by the production line chart (renderer plan O). The visx line has one
// value axis, so both series share it, in millions.
const housing = { id: "housing", label: "Total Housing Units" };
const population = { id: "population", label: "Total Population" };
const trendChart = specimenResult({
  chartType: "line",
  comparisons: [housing, population],
  observations: trend.flatMap(({ year, ...values }) =>
    [housing, population].map((comparison) =>
      specimenObservation({
        comparison,
        measure: "Millions",
        period: Number(year),
        place: "California",
        value: values[comparison.id],
      }),
    ),
  ),
});

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
          <h3 className="font-serif text-2xl text-neutral-900">
            Population & Housing Trends
          </h3>
          <SeeMore />
        </div>

        <SpecimenChart result={trendChart} height={UI_KIT_CHART_HEIGHT} />
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
