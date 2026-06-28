/* eslint-disable react/prop-types */
import React from "react";
import { Section, Panel, Caption } from "./Section";

function Row({ family, role, sample, style }) {
  const size = typeof style.fontSize === "number" ? `${style.fontSize}px` : style.fontSize;
  const weight = style.fontWeight ?? 400;
  const lineHeight =
    style.lineHeight === undefined
      ? "normal"
      : typeof style.lineHeight === "number"
        ? style.lineHeight.toFixed(2)
        : style.lineHeight;
  const tracking = style.letterSpacing ?? "0";

  return (
    <div className="border-b py-5 last:border-b-0" style={{ borderColor: "var(--ppic-neutral-50)" }}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span
          className="text-[13px] uppercase tracking-[0.16em]"
          style={{ fontFamily: "var(--font-sans)", color: "var(--ppic-orange-300)" }}
        >
          {family}
        </span>
        <span className="text-[12px] uppercase tracking-wide text-neutral-500" style={{ fontFamily: "var(--font-sans)" }}>
          {role}
        </span>
      </div>
      <p className="text-neutral-900" style={style}>
        {sample}
      </p>
      {/* spec line — size · weight · line spacing · tracking */}
      <div
        className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-neutral-500"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <span>Size {size}</span>
        <span>Weight {weight}</span>
        <span>Line spacing {lineHeight}</span>
        <span>Tracking {tracking}</span>
      </div>
    </div>
  );
}

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
            style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, lineHeight: 1.4, letterSpacing: "0.22em", textTransform: "uppercase" }}
          />
          <Row
            family="Orbitron"
            role="Wordmark / Logo"
            sample="PPIC"
            style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 52, lineHeight: 1.0, letterSpacing: "0.08em" }}
          />
          <Row
            family="Georgia"
            role="Display headline"
            sample="California Population & Housing Trends"
            style={{ fontFamily: "var(--font-serif)", fontSize: 34, lineHeight: 1.15 }}
          />
          <Row
            family="Georgia"
            role="Big stat numeral"
            sample="39.5M"
            style={{ fontFamily: "var(--font-serif)", fontSize: 56, lineHeight: 1.0 }}
          />
        </Panel>

        <Panel>
          <Row
            family="Source Sans 3"
            role="Section heading"
            sample="Data Sources"
            style={{ fontFamily: "var(--font-heading)", fontSize: 28, lineHeight: 1.2, letterSpacing: "0.06em" }}
          />
          <Row
            family="Source Sans 3"
            role="Body / paragraph"
            sample="Net migration and total housing units across California regions, 2013–2026."
            style={{ fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.6 }}
          />
          <Row
            family="Inter"
            role="Label / caption"
            sample="X Axis: Year · Y Axis: Total Population"
            style={{ fontFamily: "var(--font-sans)", fontSize: 13, lineHeight: 1.4, letterSpacing: "0.04em" }}
          />
        </Panel>
      </div>

      <Caption>Type scale — eyebrow 12 · display 52 · h1 34 · h2 28 · body 16 · caption 13</Caption>
    </Section>
  );
}
