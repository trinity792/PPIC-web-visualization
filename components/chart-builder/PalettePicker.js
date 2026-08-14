"use client";

/**
 * PalettePicker.js — palette select plus advanced per-item legend controls.
 *
 * Props:
 *   seriesNames {string[]} — last-loaded discrete legend names (defaults to
 *                            []: only the palette select renders until data
 *                            has loaded)
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

import { Eye, EyeOff, RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useAdvancedMode } from "@/components/chart-builder/advancedMode";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import {
  DEFAULT_PALETTE,
  PALETTES,
  palettesOfKind,
  resolveToken,
} from "@/lib/visualization/palettes";

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

// Where `rampFor` lands when the active palette declares no stops of its own.
// Mirrors its `legacyRampScale`, so the select never names a palette the
// renderer is not using.
const FALLBACK_RAMP = Object.freeze({
  sequential: "sequential-blues",
  diverging: "diverging-redblue",
});

const COLLAPSED_ITEM_LIMIT = 5;

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
  const { config, dispatch } = useChartConfig();
  const { advanced } = useAdvancedMode();
  const [expanded, setExpanded] = React.useState(false);
  const [query, setQuery] = React.useState("");
  // The palette is a common choice; editing individual legend entries is a
  // denser expert workflow. Keep the whole per-series list — rename,
  // visibility, and color overrides — in Advanced Mode once a load has
  // reported a discrete legend.
  const showLegendItems = advanced && seriesNames.length > 0;
  const rampMode = kind !== "categorical";
  const options = palettesOfKind(kind).map((id) => [id, PALETTES[id]]);
  // `appearance.palette` is one key shared by every chart type, so a reader who
  // set a categorical palette on a line and then switched to a choropleth is
  // holding an id this list does not contain. Showing it blank would be a lie
  // about a control that is doing something; show the legacy ramp `rampFor`
  // actually falls back to, which is what the chart is drawing.
  const active = config.appearance.palette || DEFAULT_PALETTE;
  const selected = options.some(([id]) => id === active)
    ? active
    : rampMode
      ? FALLBACK_RAMP[kind]
      : DEFAULT_PALETTE;
  const hasOverflow = seriesNames.length > COLLAPSED_ITEM_LIMIT;
  const activeQuery = hasOverflow ? query.trim().toLocaleLowerCase() : "";
  const legendLabels = config.appearance.legendLabels || {};
  const matchingNames = activeQuery
    ? seriesNames.filter((seriesName) =>
        `${seriesName} ${legendLabels[seriesName] || ""}`
          .toLocaleLowerCase()
          .includes(activeQuery),
      )
    : seriesNames;
  const visibleNames =
    activeQuery || expanded
      ? matchingNames
      : matchingNames.slice(0, COLLAPSED_ITEM_LIMIT);

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="appearance-palette">Color palette</Label>
        <Select
          value={selected}
          onValueChange={(palette) => dispatch({ type: "SET_PALETTE", palette })}
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

      {showLegendItems ? (
        <div className="grid gap-2">
          <Label>Legend items</Label>
          {hasOverflow ? (
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                aria-label="Search legend items"
                placeholder="Search legend items"
                className="pl-8"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            {visibleNames.map((seriesName) => (
              <LegendItemRow key={seriesName} seriesName={seriesName} />
            ))}
            {activeQuery && !visibleNames.length ? (
              <p className="py-2 text-sm text-muted-foreground">
                No legend items found.
              </p>
            ) : null}
          </div>
          {hasOverflow && !activeQuery ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded
                ? "Show less"
                : `Show more (${seriesNames.length - COLLAPSED_ITEM_LIMIT})`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function LegendItemRow({ seriesName }) {
  const { config, dispatch } = useChartConfig();
  const override = config.appearance.seriesColors?.[seriesName];
  const labelOverride = config.appearance.legendLabels?.[seriesName] || "";
  const hidden = (config.appearance.hiddenSeries || []).includes(seriesName);

  function setColor(token) {
    dispatch({ type: "SET_SERIES_COLOR", seriesName, token });
  }

  function toggleHidden() {
    dispatch({ type: "SET_SERIES_VISIBILITY", seriesName, hidden: !hidden });
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1.5">
      <Input
        value={labelOverride}
        aria-label={`Legend label for ${seriesName}`}
        placeholder={seriesName}
        title={`Original label: ${seriesName}`}
        className={`h-8 min-w-0 flex-1 ${hidden ? "text-muted-foreground line-through" : ""}`}
        onChange={(event) =>
          dispatch({
            type: "SET_LEGEND_LABEL",
            seriesName,
            label: event.target.value,
          })
        }
      />
      <button
        type="button"
        onClick={toggleHidden}
        aria-pressed={hidden}
        aria-label={hidden ? `Show ${seriesName}` : `Hide ${seriesName}`}
        title={hidden ? "Show in chart" : "Hide from chart"}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {hidden ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </button>
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
