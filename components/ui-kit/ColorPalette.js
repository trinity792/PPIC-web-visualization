/**
 * ColorPalette.js — PPIC brand, data, neutral, and site color specimens.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Color tokens from lib/constants.js
 *
 * UI Kit reference:
 *   - Documents the canonical "Color Palette" foundation
 */

/* eslint-disable react/prop-types */

import React from "react";

import { Section } from "@/components/ui-kit/Section";

import { COLORS } from "@/lib/constants";

const orange = [
  { name: "orange-50", hex: COLORS.orange1 },
  { name: "orange-100", hex: COLORS.orange2 },
  { name: "orange-200", hex: COLORS.primaryOrange },
  { name: "orange-300", hex: COLORS.orange3 },
  { name: "orange-400", hex: COLORS.orange4 },
  { name: "orange-500", hex: COLORS.orange5 },
  { name: "orange-600", hex: COLORS.orange6 },
  { name: "orange-700", hex: COLORS.orange7 },
];

const blue = [
  { name: "blue-50", hex: COLORS.blue1 },
  { name: "blue-100", hex: COLORS.blue2 },
  { name: "blue-200", hex: COLORS.blue3 },
  { name: "blue-300", hex: COLORS.blue4 },
  { name: "blue-400", hex: COLORS.blue5 },
  { name: "blue-500", hex: COLORS.blue6 },
  { name: "blue-600", hex: COLORS.blue7 },
];

const neutral = [
  { name: "neutral-50", hex: COLORS.gray1 },
  { name: "neutral-100", hex: COLORS.gray2 },
  { name: "neutral-200", hex: COLORS.gray3 },
  { name: "neutral-300", hex: COLORS.gray4 },
  { name: "neutral-400", hex: COLORS.gray5 },
  { name: "neutral-500", hex: COLORS.gray6 },
  { name: "neutral-600", hex: COLORS.gray7 },
];

const site = [
  { name: "Navy", hex: COLORS.navyBlue },
  { name: "Steel", hex: COLORS.steelBlue },
  { name: "Ink", hex: COLORS.darkGray },
  { name: "Rust", hex: COLORS.burntOrange },
  { name: "Mist", hex: COLORS.lightGray },
];

function isDark(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

export function ColorPalette() {
  return (
    <Section
      id="color"
      eyebrow="Foundations"
      title="Color"
      description="A warm orange brand ramp anchors the identity, paired with a data-blue scale for visualizations and a cool neutral scale for surfaces and text. Reference these as CSS variables (e.g. var(--ppic-orange-300))."
    >
      <div className="grid gap-8 lg:grid-cols-3">
        <Ramp label="Orange · Brand" swatches={orange} />
        <Ramp label="Blue · Data" swatches={blue} />
        <Ramp label="Neutral · Surface" swatches={neutral} />
      </div>

      <p className="mb-3 mt-8 font-sans text-[13px] uppercase tracking-[0.16em] text-neutral-700">
        Site accents
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {site.map((s) => (
          <div
            key={s.name}
            className="overflow-hidden rounded-xl border border-ppic-border"
          >
            <div className="h-24" style={{ backgroundColor: s.hex }} />
            <div className="bg-white px-3 py-2">
              <p className="font-sans text-[13px] text-neutral-800">{s.name}</p>
              <p className="font-sans text-xs uppercase text-neutral-500">
                {s.hex}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function Ramp({ label, swatches }) {
  return (
    <div>
      <p className="mb-3 font-sans text-[13px] uppercase tracking-[0.16em] text-neutral-700">
        {label}
      </p>
      <div className="overflow-hidden rounded-xl border border-ppic-border">
        {swatches.map((swatch) => (
          <div
            key={swatch.name}
            className="flex items-center justify-between px-4 py-3"
            style={{
              backgroundColor: swatch.hex,
              color: isDark(swatch.hex) ? COLORS.white : COLORS.darkGray,
            }}
          >
            <span className="font-sans text-[13px]">{swatch.name}</span>
            <span className="font-sans text-xs uppercase tracking-wide opacity-90">
              {swatch.hex}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
