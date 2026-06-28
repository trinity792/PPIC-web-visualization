/* eslint-disable react/prop-types */
import React from "react";
import { Section } from "./Section";

const orange = [
  { name: "orange-50", hex: "#FED4BF" },
  { name: "orange-100", hex: "#FC9C69" },
  { name: "orange-200", hex: "#E36A36" },
  { name: "orange-300", hex: "#E36A18" },
  { name: "orange-400", hex: "#B25210" },
  { name: "orange-500", hex: "#7F3808" },
  { name: "orange-600", hex: "#4C1F03" },
  { name: "orange-700", hex: "#1E0801" },
];

const blue = [
  { name: "blue-50", hex: "#B5DBFD" },
  { name: "blue-100", hex: "#66B7FC" },
  { name: "blue-200", hex: "#1891E3" },
  { name: "blue-300", hex: "#106FB0" },
  { name: "blue-400", hex: "#084D7C" },
  { name: "blue-500", hex: "#022A47" },
  { name: "blue-600", hex: "#000B18" },
];

const neutral = [
  { name: "neutral-50", hex: "#EDEFF0" },
  { name: "neutral-100", hex: "#C2C9CC" },
  { name: "neutral-200", hex: "#9BA3A8" },
  { name: "neutral-300", hex: "#7B8285" },
  { name: "neutral-400", hex: "#595F61" },
  { name: "neutral-500", hex: "#383B3D" },
  { name: "neutral-600", hex: "#191B1C" },
];

const site = [
  { name: "Navy", hex: "#2D4059" },
  { name: "Steel", hex: "#759CBF" },
  { name: "Ink", hex: "#0D0D0D" },
  { name: "Rust", hex: "#BF471B" },
  { name: "Mist", hex: "#F2F2F2" },
];

function isDark(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

function Ramp({ label, swatches }) {
  return (
    <div>
      <p
        className="mb-3 text-[13px] uppercase tracking-[0.16em] text-neutral-700"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {label}
      </p>
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--ppic-border)" }}>
        {swatches.map((s) => (
          <div
            key={s.name}
            className="flex items-center justify-between px-4 py-3"
            style={{
              backgroundColor: s.hex,
              color: isDark(s.hex) ? "#ffffff" : "#0d0d0d",
            }}
          >
            <span className="text-[13px]" style={{ fontFamily: "var(--font-sans)" }}>
              {s.name}
            </span>
            <span
              className="text-[12px] uppercase tracking-wide opacity-90"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {s.hex}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
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

      <p
        className="mb-3 mt-8 text-[13px] uppercase tracking-[0.16em] text-neutral-700"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        Site accents
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {site.map((s) => (
          <div
            key={s.name}
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--ppic-border)" }}
          >
            <div className="h-24" style={{ backgroundColor: s.hex }} />
            <div className="bg-white px-3 py-2">
              <p className="text-[13px] text-neutral-800" style={{ fontFamily: "var(--font-sans)" }}>
                {s.name}
              </p>
              <p className="text-[12px] uppercase text-neutral-500" style={{ fontFamily: "var(--font-sans)" }}>
                {s.hex}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
