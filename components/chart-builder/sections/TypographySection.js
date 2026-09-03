"use client";

/**
 * TypographySection.js — text sizes and numeric precision.
 *
 * Split out of Appearance by the workbench overhaul: these six controls are all
 * "how big / how precise", they are edited together when preparing a chart for
 * publication, and the mockup gives them their own block.
 *
 * Every field clamps to its own range on the way into the config rather than
 * relying on the input's `min`/`max` attributes, which browsers only enforce for
 * form submission — typing 200 into a number input still fires a change event.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Chart configuration from ChartConfigProvider
 *
 * UI Kit reference:
 *   - Implements the number-input form pattern
 */

import React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";

/**
 * [appearance key, label, min, max, fallback]. Ranges are the type-scale bounds
 * the PPIC chart style allows; decimal places is a precision cap, not a size.
 */
const TYPOGRAPHY_FIELDS = [
  ["titleFontSize", "Title Size", 14, 32, 20],
  ["subtitleFontSize", "Subtitle Size", 11, 24, 18],
  ["axisFontSize", "Axis Label Size", 9, 20, 14],
  ["legendFontSize", "Legend Text Size", 10, 20, 14],
  ["dataLabelFontSize", "Data Label Size", 9, 22, 14],
  ["decimalPlaces", "Decimal Places", 0, 6, 2],
];

export default function TypographySection() {
  const { config: storedConfig, dispatch } = useChartConfig();
  const appearance = storedConfig.version === 3
    ? storedConfig.presentation?.appearance || {}
    : storedConfig.appearance || {};

  return (
    <div className="grid grid-cols-2 gap-3">
      {TYPOGRAPHY_FIELDS.map(([key, label, min, max, fallback]) => (
        <NumberField
          key={key}
          id={`typography-${key}`}
          label={label}
          min={min}
          max={max}
          value={appearance[key] ?? fallback}
          onChange={(value) => dispatch({ type: "SET_APPEARANCE", key, value })}
        />
      ))}
    </div>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function NumberField({ id, label, min, max, value, onChange }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={String(min)}
        max={String(max)}
        step="1"
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          const next = Number(raw);
          // Clearing the field restores the chart default rather than pinning 0.
          if (raw === "" || !Number.isFinite(next)) {
            onChange(undefined);
            return;
          }
          onChange(Math.min(max, Math.max(min, Math.round(next))));
        }}
      />
    </div>
  );
}
