"use client";

/**
 * PalettePicker.js — the color palette select.
 *
 * The per-series rename, hide, and color list that used to sit below it in
 * Advanced Mode was removed (renderer plan C): it never saved for version 3
 * views, and the comparison label, visibility, and color controls already do
 * that job. Saved `legendLabels`, `hiddenSeries`, and `seriesColors` are ignored.
 *
 * Props:
 *   seriesNames {string[]} — last-loaded discrete legend names; their count
 *                            names the automatic PPIC palette
 *
 * Data sources:
 *   - Chart configuration from ChartConfigProvider
 *   - Named palettes and brand color tokens from lib/visualization/palettes.js
 *
 * UI Kit reference:
 *   - Implements the graph-editor Select pattern
 */

import React from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import {
  DEFAULT_PALETTE,
  PALETTES,
  palettesOfKind,
  resolveToken,
} from "@/lib/visualization/palettes";

// Where `rampFor` lands when the active palette declares no stops of its own.
// Mirrors its `legacyRampScale`, so the select never names a palette the
// renderer is not using.
const FALLBACK_RAMP = Object.freeze({
  sequential: "sequential-blues",
  diverging: "diverging-redblue",
});

const AUTOMATIC_PPIC = "__automatic_ppic__";

/**
 * A palette's own stops, drawn as the gradient the chart will use. A named
 * Plotly scale (the legacy "RdBu") has no stops to read, so it shows a neutral
 * placeholder rather than a misleading two-colour guess.
 */
function RampSwatch({ scale }) {
  const gradient =
    typeof scale === "string"
      ? null
      : scale.map(([stop, token]) => `${resolveToken(token)} ${stop * 100}%`).join(", ");
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-8 shrink-0 rounded-sm border"
      style={
        gradient
          ? { background: `linear-gradient(to right, ${gradient})` }
          : { background: "linear-gradient(to right, #67001F, #F7F7F7, #053061)" }
      }
    />
  );
}

/**
 * Props:
 *   seriesNames {string[]} — see module doc above.
 *   kind {"categorical"|"sequential"|"diverging"} — which palettes to offer,
 *     from `paletteKindFor`. "categorical" (the default) lists the named
 *     categorical palettes; a scale-driven chart type lists the ramps of the
 *     matching kind and shows each one's gradient beside its label. The lists
 *     are disjoint on purpose: a ramp has no cycle to colour series from, and
 *     a categorical palette has no stops to interpolate.
 */
export default function PalettePicker({ seriesNames = [], kind = "categorical" }) {
  const { config: storedConfig, dispatch } = useChartConfig();
  const config = storedConfig.version === 3
    ? { ...storedConfig, appearance: storedConfig.presentation?.appearance || {} }
    : storedConfig;
  const rampMode = kind !== "categorical";
  const automatic = storedConfig.version === 3 && !rampMode;
  const automaticCount = seriesNames.length || storedConfig.seriesCount || 0;
  const automaticLabel = automaticCount
    ? `Automatic PPIC categorical · ${automaticCount} ${automaticCount === 1 ? "group" : "groups"}`
    : "Automatic PPIC categorical";
  const options = [
    ...(automatic
      ? [[AUTOMATIC_PPIC, { label: automaticLabel, kind: "categorical" }]]
      : []),
    ...palettesOfKind(kind).map((id) => [id, PALETTES[id]]),
  ];
  // `appearance.palette` is one key shared by every chart type, so a reader who
  // set a categorical palette on a line and then switched to a choropleth is
  // holding an id this list does not contain. Showing it blank would be a lie
  // about a control that is doing something; show the legacy ramp `rampFor`
  // actually falls back to, which is what the chart is drawing.
  const active = config.appearance.palette || (automatic ? AUTOMATIC_PPIC : DEFAULT_PALETTE);
  const selected = options.some(([id]) => id === active)
    ? active
    : rampMode
      ? FALLBACK_RAMP[kind]
      : DEFAULT_PALETTE;

  return (
    <div className="grid gap-2">
      <Label htmlFor="appearance-palette">Color Palette</Label>
      <Select
        value={selected}
        onValueChange={(palette) =>
          dispatch({
            type: "SET_PALETTE",
            palette: palette === AUTOMATIC_PPIC ? null : palette,
          })
        }
      >
        <SelectTrigger id="appearance-palette">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([id, palette]) => (
            <SelectItem key={id} value={id}>
              <span className="flex items-center gap-2">
                {rampMode ? <RampSwatch scale={palette.scale} /> : null}
                {palette.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
