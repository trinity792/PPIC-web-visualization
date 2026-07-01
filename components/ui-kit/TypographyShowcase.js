/**
 * TypographyShowcase.js — PPIC type roles, specimens, and scale metadata.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Static typography specimens defined in this file
 *
 * UI Kit reference:
 *   - Documents the canonical "Typography" foundation
 */

/* eslint-disable react/prop-types */

import React from "react";

import { Caption, Panel, Section } from "@/components/ui-kit/Section";

export function TypographyShowcase() {
  return (
    <Section
      id="type"
      eyebrow="Foundations"
      title="Typography"
      description="Orbitron carries the PPIC wordmark, Georgia delivers editorial headlines and the big statistical numerals, Source Sans 3 handles UI headings and body, and Inter covers labels and controls. Each specimen lists its size, weight, line spacing, and tracking."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <Row
            family="Inter"
            role="Super heading / eyebrow"
            sample="FOUNDATIONS · COMPONENTS · PATTERNS"
            className="font-sans text-xs font-semibold uppercase leading-[1.4] tracking-[0.22em]"
            size="12px"
            weight={600}
            lineHeight="1.40"
            tracking="0.22em"
          />
          <Row
            family="Orbitron"
            role="Wordmark / Logo"
            sample="PPIC"
            className="font-display text-[52px] font-black leading-none tracking-[0.08em]"
            size="52px"
            weight={900}
            lineHeight="1.00"
            tracking="0.08em"
          />
          <Row
            family="Georgia"
            role="Display headline"
            sample="California Population & Housing Trends"
            className="font-serif text-[34px] leading-[1.15]"
            size="34px"
            lineHeight="1.15"
          />
          <Row
            family="Georgia"
            role="Big stat numeral"
            sample="39.5M"
            className="font-serif text-[56px] leading-none"
            size="56px"
            lineHeight="1.00"
          />
        </Panel>

        <Panel>
          <Row
            family="Source Sans 3"
            role="Section heading"
            sample="Data Sources"
            className="font-heading text-[28px] leading-[1.2] tracking-[0.06em]"
            size="28px"
            lineHeight="1.20"
            tracking="0.06em"
          />
          <Row
            family="Source Sans 3"
            role="Body / paragraph"
            sample="Net migration and total housing units across California regions, 2013–2026."
            className="font-body text-base leading-[1.6]"
            size="16px"
            lineHeight="1.60"
          />
          <Row
            family="Inter"
            role="Label / caption"
            sample="X Axis: Year · Y Axis: Total Population"
            className="font-sans text-[13px] leading-[1.4] tracking-[0.04em]"
            size="13px"
            lineHeight="1.40"
            tracking="0.04em"
          />
        </Panel>
      </div>

      <Caption>Type scale — eyebrow 12 · display 52 · h1 34 · h2 28 · body 16 · caption 13</Caption>
    </Section>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function Row({
  family,
  role,
  sample,
  className,
  size,
  weight = 400,
  lineHeight = "normal",
  tracking = "0",
}) {
  return (
    <div className="border-b border-ppic-neutral-50 py-5 last:border-b-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-sans text-[13px] uppercase tracking-[0.16em] text-ppic-brand">
          {family}
        </span>
        <span className="font-sans text-xs uppercase tracking-wide text-neutral-500">
          {role}
        </span>
      </div>
      <p className={`text-neutral-900 ${className}`}>{sample}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-sans text-xs text-neutral-500">
        <span>Size {size}</span>
        <span>Weight {weight}</span>
        <span>Line spacing {lineHeight}</span>
        <span>Tracking {tracking}</span>
      </div>
    </div>
  );
}
