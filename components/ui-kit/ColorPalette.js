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

import { ChevronDownIcon } from "lucide-react";

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

const teal = [
  { name: "teal-50", hex: COLORS.teal1 },
  { name: "teal-100", hex: COLORS.teal2 },
  { name: "teal-200", hex: COLORS.teal3 },
  { name: "teal-300", hex: COLORS.teal4 },
  { name: "teal-400", hex: COLORS.teal5 },
  { name: "teal-500", hex: COLORS.teal6 },
  { name: "teal-600", hex: COLORS.teal7 },
  { name: "teal-700", hex: COLORS.teal8 },
];

const navyBlue = [
  { name: "navy-blue-50", hex: COLORS.navyBlue1 },
  { name: "navy-blue-100", hex: COLORS.navyBlue2 },
  { name: "navy-blue-200", hex: COLORS.navyBlue3 },
  { name: "navy-blue-300", hex: COLORS.navyBlue4 },
  { name: "navy-blue-400", hex: COLORS.navyBlue5 },
  { name: "navy-blue-500", hex: COLORS.navyBlue6 },
  { name: "navy-blue-600", hex: COLORS.navyBlue7 },
];

const steelBlue = [
  { name: "steel-blue-50", hex: COLORS.steelBlue1 },
  { name: "steel-blue-100", hex: COLORS.steelBlue2 },
  { name: "steel-blue-200", hex: COLORS.steelBlue3 },
  { name: "steel-blue-300", hex: COLORS.steelBlue4 },
  { name: "steel-blue-400", hex: COLORS.steelBlue5 },
  { name: "steel-blue-500", hex: COLORS.steelBlue6 },
  { name: "steel-blue-600", hex: COLORS.steelBlue7 },
];

const complementGreen = [
  { name: "complement-green-50", hex: COLORS.complementGreen1 },
  { name: "complement-green-100", hex: COLORS.complementGreen2 },
  { name: "complement-green-200", hex: COLORS.complementGreen3 },
  { name: "complement-green-300", hex: COLORS.complementGreen4 },
  { name: "complement-green-400", hex: COLORS.complementGreen5 },
  { name: "complement-green-500", hex: COLORS.complementGreen6 },
  { name: "complement-green-600", hex: COLORS.complementGreen7 },
  { name: "complement-green-700", hex: COLORS.complementGreen8 },
];

const burntOrange = [
  { name: "burnt-orange-50", hex: COLORS.burntOrange1 },
  { name: "burnt-orange-100", hex: COLORS.burntOrange2 },
  { name: "burnt-orange-200", hex: COLORS.burntOrange3 },
  { name: "burnt-orange-300", hex: COLORS.burntOrange4 },
  { name: "burnt-orange-400", hex: COLORS.burntOrange5 },
  { name: "burnt-orange-500", hex: COLORS.burntOrange6 },
  { name: "burnt-orange-600", hex: COLORS.burntOrange7 },
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
  { name: "Ink", hex: COLORS.darkGray },
  { name: "Mist", hex: COLORS.lightGray },
];

const palettes = [
  {
    label: "Orange · Brand",
    mainColor: COLORS.primaryOrange,
    swatches: orange,
  },
  { label: "Blue · Data", mainColor: COLORS.dataBlue, swatches: blue },
  { label: "Teal · Data", mainColor: COLORS.dataTeal, swatches: teal },
  {
    label: "Navy Blue · Accent",
    mainColor: COLORS.navyBlue,
    swatches: navyBlue,
  },
  {
    label: "Steel Blue · Accent",
    mainColor: COLORS.steelBlue,
    swatches: steelBlue,
  },
  {
    label: "Complement Green · Accent",
    mainColor: COLORS.complementGreen,
    swatches: complementGreen,
  },
  {
    label: "Burnt Orange · Accent",
    mainColor: COLORS.burntOrange,
    swatches: burntOrange,
  },
  { label: "Neutral · Surface", mainColor: COLORS.neutral, swatches: neutral },
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
      description="The orange brand ramp anchors the identity, supported by data and accent scales plus a cool neutral scale for surfaces and text. Reference these as CSS variables (e.g. var(--ppic-orange-300))."
    >
      <div className="grid items-start gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {palettes.map((palette) => (
          <Palette key={palette.label} {...palette} />
        ))}
      </div>

      <p className="mb-3 mt-8 font-sans text-[13px] uppercase tracking-[0.16em] text-neutral-700">
        Standalone site colors
      </p>
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        {site.map((s) => (
          <div
            key={s.name}
            className="overflow-hidden rounded-xl border border-ppic-border"
          >
            <ColorSpecimen name={s.name} hex={s.hex} />
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function Palette({ label, mainColor, swatches }) {
  return (
    <details className="group overflow-hidden rounded-xl border border-ppic-border bg-white">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <ColorSpecimen
          name={label}
          hex={mainColor}
          action={
            <span className="flex items-center gap-1 font-sans text-xs text-neutral-500">
              View ramp
              <ChevronDownIcon
                aria-hidden="true"
                className="size-4 transition-transform group-open:rotate-180"
              />
            </span>
          }
        />
      </summary>
      <div className="border-t border-ppic-border">
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
    </details>
  );
}

function ColorSpecimen({ name, hex, action = null }) {
  return (
    <>
      <div className="h-24" style={{ backgroundColor: hex }} />
      <div className="flex items-center justify-between gap-3 bg-white px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-sans text-[13px] text-neutral-800">
            {name}
          </p>
          <p className="font-sans text-xs uppercase text-neutral-500">{hex}</p>
        </div>
        {action}
      </div>
    </>
  );
}
