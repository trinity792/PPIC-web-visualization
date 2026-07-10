/**
 * ChartTypesShowcase.js — per-chart-type usage guidance from the guide: when to
 * reach for each type ("Application") and the rules that govern it ("Style
 * tips"), covering bar/column (vertical + horizontal), stacked column, line,
 * pie, area, and the choropleth map.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Official PPIC Data Visualization Style Guide v1.0 (Charts / Maps, pp.22–29)
 *   - components/ui-kit/ppicSpec.js (choropleth divergent colorway)
 *
 * UI Kit reference:
 *   - Documents the "Chart Types" usage guidance
 */

/* eslint-disable react/prop-types */

import React from "react";

import { Section } from "@/components/ui-kit/Section";
import { PPIC_CHOROPLETH_DIVERGENT, PPIC_SEQUENTIAL } from "@/components/ui-kit/ppicSpec";

const TYPES = [
  {
    name: "Bar / column · vertical",
    application:
      "One variable — compare values across observations, show relative amounts, or split one variable into grouped or stacked subgroups.",
    tips: [
      "Y-axis starts at zero.",
      "Put axis labels in the subtitle; keep any shown labels horizontal.",
      "Avoid vertical grid lines — label bars directly or via the key.",
      "Bars ≥ 10px wide; use the 10px minimum for more than three bars per group.",
    ],
  },
  {
    name: "Bar / column · horizontal",
    application:
      "Easiest for a set of data across a range of values, especially with long category names.",
    tips: [
      "Right-align category labels, centered vertically on each bar.",
      "Use only a single color range.",
    ],
  },
  {
    name: "Stacked column",
    application:
      "Show the composition of groups when the data is not a continuous time series; a 100% stacked area covers composition over time.",
    tips: [
      "Y-axis starts at zero.",
      "Directly label series when possible; otherwise use the key.",
      "Avoid individual data labels; keep to three or four categories.",
      "Shade sequential series darkest → lightest.",
    ],
  },
  {
    name: "Line",
    application:
      "Show the trend in one variable over time, or several variables / observations as multiple lines on the same scale.",
    tips: [
      "Y-axis starts at zero.",
      "Label series directly in the line color; use a legend only if lines crowd.",
      "Avoid data markers, dashed, and dotted lines.",
      "Keep to three or four lines; shade sequential series lightest → darkest.",
    ],
  },
  {
    name: "Pie",
    application:
      "Show the relative relationship between two or three things, or parts that add to 100% (may need a 'none' / 'other' slice).",
    tips: [
      "Works best with fewer than four or five slices.",
      "Label each slice directly; use a 1pt ledger line when a label runs long.",
      "Category descriptions use body copy (Proxima Nova 18pt).",
    ],
  },
  {
    name: "Area",
    application:
      "Like a stacked column over time — show the part-to-whole relationship of categories plus totals.",
    tips: [
      "Key order matches the chart, lightest → darkest.",
      "Use a high-contrast categorical scheme for comparisons.",
      "A curved area graphic can reinforce color hierarchy.",
    ],
  },
];

export function ChartTypesShowcase() {
  return (
    <Section
      id="chart-guide"
      eyebrow="Charts"
      title="Chart Types"
      description="When to reach for each chart type and the rules that keep it on-brand. Pair this guidance with the rendered specimens in Example Graphs below."
    >
      <div className="grid gap-5 md:grid-cols-2">
        {TYPES.map((t) => (
          <TypeCard key={t.name} {...t} />
        ))}

        {/* Choropleth map — carries its own colorways */}
        <div className="rounded-2xl border border-ppic-border bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.06)] md:col-span-2">
          <h3 className="font-heading text-lg font-semibold text-neutral-900">
            Choropleth map
          </h3>
          <p className="mt-2 font-body text-[14px] leading-relaxed text-neutral-700">
            Represent a variable&apos;s magnitude across enumeration units (counties,
            states). Follow the same color rules as other graphics, keep to three or
            four classes, and shade lightest → darkest.
          </p>

          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 font-sans text-[13px] uppercase tracking-[0.1em] text-neutral-500">
                Sequential · brand orange ramp
              </p>
              <RampBar stops={PPIC_SEQUENTIAL[0].stops} />
              <p className="mt-2 font-body text-[13px] leading-relaxed text-neutral-600">
                The default for magnitude maps.
              </p>
            </div>
            <div>
              <p className="mb-2 font-sans text-[13px] uppercase tracking-[0.1em] text-neutral-500">
                Divergent · negative ↔ positive
              </p>
              <RampBar
                stops={[
                  ...PPIC_CHOROPLETH_DIVERGENT.negative,
                  ...PPIC_CHOROPLETH_DIVERGENT.positive,
                ]}
              />
              <p className="mt-2 font-body text-[13px] leading-relaxed text-neutral-600">
                For positive and negative leanings around a midpoint.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function TypeCard({ name, application, tips }) {
  return (
    <div className="rounded-2xl border border-ppic-border bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.06)]">
      <h3 className="font-heading text-lg font-semibold text-neutral-900">{name}</h3>
      <p className="mt-2 font-body text-[14px] leading-relaxed text-neutral-700">
        <span className="font-semibold text-neutral-800">Use it to </span>
        {application}
      </p>
      <ul className="mt-3 space-y-1.5 border-t border-ppic-neutral-50 pt-3">
        {tips.map((tip) => (
          <li
            key={tip}
            className="flex gap-2 font-body text-[13px] leading-relaxed text-neutral-700"
          >
            <span aria-hidden="true" className="mt-[2px] text-ppic-brand">
              ›
            </span>
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RampBar({ stops }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-ppic-border">
      {stops.map((stop) => (
        <span key={stop} className="h-10 flex-1" style={{ backgroundColor: stop }} />
      ))}
    </div>
  );
}
