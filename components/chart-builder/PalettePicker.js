"use client";

/**
 * PalettePicker.js — named-palette select plus per-series color override rows.
 *
 * Props:
 *   seriesNames {string[]} — last-loaded trace/series names, for the
 *                            per-series override rows (defaults to []: only
 *                            the palette select renders until data has loaded)
 *
 * Data sources:
 *   - Chart configuration from ChartConfigProvider
 *   - Named palettes and brand color tokens from lib/visualization/palettes.js
 *
 * UI Kit reference:
 *   - Implements graph-editor Select and Popover swatch-grid patterns
 */

/* eslint-disable react/prop-types */

import React from "react";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { DEFAULT_PALETTE, PALETTES, resolveToken } from "@/lib/visualization/palettes";
import { isVisible } from "@/lib/visualization/settingsTiers";

// A curated subset of brand tokens offered as per-series overrides: the
// 10-token default cycle plus a few extras. Deliberately NOT a free color
// wheel — every option is a brand token.
const SWATCH_TOKENS = [
  "blue3",
  "orange3",
  "navyBlue",
  "steelBlue",
  "burntOrange",
  "blue5",
  "orange2",
  "gray5",
  "blue2",
  "orange4",
  "complementGreen",
  "teal7",
  "gray7",
  "officialOrange",
  "officialNavy",
  "officialBlue",
  "officialGreen",
  "officialViolet",
  "officialDarkGray",
];

const CATEGORICAL_PALETTES = Object.entries(PALETTES).filter(
  ([, palette]) => palette.kind === "categorical",
);

export default function PalettePicker({ seriesNames = [] }) {
  const { config, dispatch } = useChartConfig();
  const showPalette = isVisible("palette", config.tier);
  const showSeriesColors = isVisible("seriesColors", config.tier) && seriesNames.length > 0;

  if (!showPalette && !showSeriesColors) return null;

  return (
    <div className="grid gap-3">
      {showPalette ? (
        <div className="grid gap-2">
          <Label htmlFor="appearance-palette">Color palette</Label>
          <Select
            value={config.appearance.palette || DEFAULT_PALETTE}
            onValueChange={(palette) => dispatch({ type: "SET_PALETTE", palette })}
          >
            <SelectTrigger id="appearance-palette">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORICAL_PALETTES.map(([id, palette]) => (
                <SelectItem key={id} value={id}>
                  {palette.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {showSeriesColors ? (
        <div className="grid gap-2">
          <Label>Series colors</Label>
          <div className="grid gap-1.5">
            {seriesNames.map((seriesName) => (
              <SeriesColorRow key={seriesName} seriesName={seriesName} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function SeriesColorRow({ seriesName }) {
  const { config, dispatch } = useChartConfig();
  const override = config.appearance.seriesColors?.[seriesName];

  function setColor(token) {
    dispatch({ type: "SET_SERIES_COLOR", seriesName, token });
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm">{seriesName}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Choose a color for ${seriesName}`}
            className="size-5 shrink-0 rounded-full border"
            style={{ backgroundColor: override ? resolveToken(override) : undefined }}
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="end">
          <div className="grid grid-cols-5 gap-1.5">
            {SWATCH_TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                aria-label={token}
                aria-pressed={override === token}
                onClick={() => setColor(token)}
                className="size-6 rounded-full border"
                style={{ backgroundColor: resolveToken(token) }}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full gap-1.5"
            onClick={() => setColor(null)}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            Reset to palette
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
