/**
 * ChartAnatomyShowcase.js — the guide's chart-structure guidance: the anatomy of
 * chart elements, size specs, line weights, global style tips, and legend/key
 * layout rules.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Official PPIC Data Visualization Style Guide v1.0 (Chart Structure /
 *     Key Structure, pp.18–21)
 *
 * UI Kit reference:
 *   - Documents the "Chart Anatomy" and "Key / Legend" foundations
 */

/* eslint-disable react/prop-types */

import React from "react";

import { Panel, Section } from "@/components/ui-kit/Section";

const ELEMENTS = [
  "Figure (eyebrow)",
  "Title",
  "Subtitle",
  "X-axis title",
  "Y-axis title",
  "X-axis label",
  "Y-axis label",
  "Key / legend",
  "Data label",
  "Source",
  "Notes",
];

const STYLE_TIPS = [
  "The y-axis should start at zero (rare, deliberate exceptions aside).",
  "Axis labels are always horizontal — long labels favor a horizontal bar chart.",
  "Avoid vertical grid lines; directly label each bar or data point instead.",
  "Only add grid lines above seven data points, spaced no more than 20px apart.",
  "Keep titles short; push qualifiers (years, dollars) into the subtitle.",
  "Not every chart needs a figure title — use it only when the content calls for it.",
  "Allow 48px of spacing between each chart component for readability.",
  "Sources and notes sit in their own module at the bottom, hex #EFF0F2.",
];

const KEY_RULES = [
  "Place the key to the right of the chart, or beneath it, per the layout.",
  "Order swatches lightest to darkest for readable hierarchy.",
  "Indicators are ≤ 20px × 20px, square — use 20px circles only if a tool forces it.",
];

export function ChartAnatomyShowcase() {
  return (
    <Section
      id="chart-anatomy"
      eyebrow="Charts"
      title="Chart Anatomy"
      description="The elements that can make up a PPIC chart, plus the sizing, line-weight, and layout rules that keep every figure consistent. Not every chart uses every element."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Elements + specs */}
        <Panel>
          <Heading>Elements</Heading>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
            {ELEMENTS.map((el) => (
              <li
                key={el}
                className="flex items-center gap-2 font-body text-[14px] text-neutral-800"
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-ppic-brand"
                />
                {el}
              </li>
            ))}
          </ul>

          <Heading className="mt-6">Specs & line weight</Heading>
          <dl className="mt-3 space-y-2 font-sans text-[14px]">
            <SpecRow term="Standard widths">950px · 650px · 330px</SpecRow>
            <SpecRow term="Data line">2px, in the series color</SpecRow>
            <SpecRow term="Graph line">1px, #6C7075</SpecRow>
            <SpecRow term="Row / grid line">1px, #EFF0F2</SpecRow>
            <SpecRow term="Avoid">Dashed or dotted data lines</SpecRow>
          </dl>
        </Panel>

        {/* Style tips */}
        <Panel>
          <Heading>Style tips</Heading>
          <ul className="mt-3 space-y-2.5">
            {STYLE_TIPS.map((tip) => (
              <li
                key={tip}
                className="flex gap-2.5 font-body text-[14px] leading-relaxed text-neutral-800"
              >
                <span aria-hidden="true" className="mt-[3px] text-ppic-brand">
                  ✓
                </span>
                {tip}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Key / legend */}
      <Panel className="mt-6">
        <Heading>Key / legend structure</Heading>
        <div className="mt-4 grid gap-6 md:grid-cols-[1fr_1.4fr]">
          <ul className="space-y-2.5">
            {KEY_RULES.map((rule) => (
              <li
                key={rule}
                className="flex gap-2.5 font-body text-[14px] leading-relaxed text-neutral-800"
              >
                <span aria-hidden="true" className="mt-[3px] text-ppic-brand">
                  •
                </span>
                {rule}
              </li>
            ))}
          </ul>

          <div className="grid gap-4 sm:grid-cols-3">
            <LegendSample label="Primary" layout="col" />
            <LegendSample label="Alternate" layout="grid" />
            <LegendSample label="Secondary" layout="row" />
          </div>
        </div>
      </Panel>
    </Section>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function Heading({ children, className = "" }) {
  return (
    <h3 className={`font-heading text-lg font-semibold text-neutral-900 ${className}`}>
      {children}
    </h3>
  );
}

function SpecRow({ term, children }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-32 shrink-0 uppercase tracking-[0.08em] text-neutral-500">
        {term}
      </dt>
      <dd className="text-neutral-800">{children}</dd>
    </div>
  );
}

// Lightest → darkest gradation, per the key guidance.
const SHADES = ["#EFF0F2", "#DDDDDD", "#AFAEAD", "#7B7B77"];

function LegendSample({ label, layout }) {
  const items = SHADES.map((hex, i) => (
    <span key={hex} className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-4 rounded-[3px] border border-ppic-border"
        style={{ backgroundColor: hex }}
      />
      <span className="font-sans text-[11px] text-neutral-600">Item {i + 1}</span>
    </span>
  ));

  const layoutClass =
    layout === "row"
      ? "flex flex-wrap gap-2"
      : layout === "grid"
        ? "grid grid-cols-2 gap-1.5"
        : "flex flex-col gap-1.5";

  return (
    <div className="rounded-lg border border-ppic-border bg-white p-3">
      <p className="mb-2 font-sans text-[11px] uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </p>
      <p className="mb-2 font-heading text-[13px] font-semibold text-neutral-800">
        Key title
      </p>
      <div className={layoutClass}>{items}</div>
    </div>
  );
}
