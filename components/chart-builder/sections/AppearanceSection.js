"use client";

/**
 * AppearanceSection.js — palette, legend, spacing, footnote, and the styling a
 * particular chart type needs.
 *
 * Ordered as the mockup draws it: the chart-conditional Color binding, Color
 * Palette, Legend Position, the two line spacings, Footnote. Everything after
 * Footnote is chart-type-conditional, so a default line chart shows Color with
 * the shared appearance controls and a diverging bar or forest plot grows the
 * extras it actually needs. That ordering is a contract, not a preference — the
 * tested one — because it is what keeps the common case from being buried under
 * options nine charts out of ten ignore.
 *
 * Typography moved to its own section; the tooltip template arrived here from
 * Labels.
 *
 * Props:
 *   None (local controls receive appearance values and an onChange callback).
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *
 * UI Kit reference:
 *   - Implements the select, switch, popover, and number-input patterns
 */

/* eslint-disable react/prop-types */

import React from "react";

import { Plus, Trash2 } from "lucide-react";

import PalettePicker from "@/components/chart-builder/PalettePicker";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { useAdvancedMode } from "@/components/chart-builder/advancedMode";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import {
  CATALOG_ROLE_FOR_BINDING,
  getChartType,
} from "@/lib/visualization/chartRegistry";
import { isMeasure, supportsRole } from "@/lib/visualization/fieldTypes";
import { bindableFields } from "@/lib/visualization/inlineMapping";
import { paletteKindFor, resolveToken } from "@/lib/visualization/palettes";
import { RAMP_SHADE_GROUPS } from "@/lib/visualization/ppicRamps";

const NONE = "__none__";
const GROUPED_LABEL_INDENT_MAX = 200;

// ── Line spacing ─────────────────────────────────────────────────────

export function LineSpacingControls({ lineAxes, appearance, onChange }) {
  const axes = new Set(lineAxes || []);
  if (!axes.size) return null;

  const spacingControl = (axis, key) => (
    <div className="grid gap-2" key={key}>
      <Label htmlFor={`appearance-${key}`}>{axis} Line Spacing (px)</Label>
      <div className="flex items-center gap-2">
        <Input
          id={`appearance-${key}`}
          type="number"
          inputMode="numeric"
          min="0"
          max="100"
          step="1"
          value={appearance[key] ?? ""}
          placeholder="Auto"
          onChange={(event) => {
            const raw = event.target.value;
            const value = Number(raw);
            onChange(
              key,
              raw === "" || !Number.isFinite(value)
                ? undefined
                : Math.min(100, Math.max(0, Math.round(value))),
            );
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 px-2.5 text-xs"
          disabled={appearance[key] == null}
          onClick={() => onChange(key, undefined)}
        >
          Auto
        </Button>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      {axes.has("horizontal")
        ? spacingControl("Horizontal", "horizontalLinePadding")
        : null}
      {axes.has("vertical")
        ? spacingControl("Vertical", "verticalLinePadding")
        : null}
    </div>
  );
}

// ── Grouped row labels ───────────────────────────────────────────────

function usesGroupedRowLabels(config) {
  if (!config.bindings?.group) return false;
  if (["dumbbell", "dotPlot", "forest"].includes(config.chartType)) return true;
  if (config.chartType !== "bar") return false;
  return config.appearance?.diverging
    ? config.appearance?.orientation !== "vertical"
    : config.appearance?.orientation === "horizontal";
}

function GroupedRowLabelControls({ appearance, onChange }) {
  const rows = [
    {
      name: "Group",
      alignmentKey: "groupLabelAlignment",
      alignmentDefault: "left",
      indentKey: "groupLabelIndent",
    },
    {
      name: "Variable",
      alignmentKey: "variableLabelAlignment",
      alignmentDefault: "right",
      indentKey: "variableLabelIndent",
    },
  ];

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-3">
      <p className="text-sm font-medium">Grouped row labels</p>
      {rows.map(({ name, alignmentKey, alignmentDefault, indentKey }) => (
        <div className="grid grid-cols-2 gap-3" key={name}>
          <div className="grid gap-2">
            <Label htmlFor={`appearance-${alignmentKey}`}>
              {name} alignment
            </Label>
            <Select
              value={appearance[alignmentKey] || alignmentDefault}
              onValueChange={(value) => onChange(alignmentKey, value)}
            >
              <SelectTrigger id={`appearance-${alignmentKey}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`appearance-${indentKey}`}>
              {name} indentation (px)
            </Label>
            <Input
              id={`appearance-${indentKey}`}
              type="number"
              inputMode="numeric"
              min="0"
              max={String(GROUPED_LABEL_INDENT_MAX)}
              step="1"
              value={appearance[indentKey] ?? 0}
              onChange={(event) => {
                const value = Number(event.target.value);
                onChange(
                  indentKey,
                  Number.isFinite(value)
                    ? Math.min(
                        GROUPED_LABEL_INDENT_MAX,
                        Math.max(0, Math.round(value)),
                      )
                    : 0,
                );
              }}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Indentation moves labels inward from their selected alignment edge.
      </p>
    </div>
  );
}

// ── Diverging-bar styling ────────────────────────────────────────────

// Brand tokens offered for threshold bucket colors — the on-track dashboard
// scale plus a few extras. Not a free color wheel: every option is a brand token.
const BUCKET_TOKENS = [
  "blue3",
  "teal5",
  "orange1",
  "orange3",
  "navyBlue",
  "steelBlue",
  "burntOrange",
  "complementGreen",
  "gray5",
];

// The dashboard's on-track bucket set, applied when threshold coloring is
// switched on. Mirrors RegionalOnTrackBars' bucketColor thresholds.
const DEFAULT_COLOR_BUCKETS = [
  { at: 1.0, color: "blue3" },
  { at: 0.7, color: "teal5" },
  { at: 0.5, color: "orange1" },
  { at: null, color: "orange3" },
];

/**
 * A hand-picked diverging ramp: three stops (low / middle / high) or five,
 * each chosen from the guide's published shades.
 *
 * Deliberately not a colour wheel, and deliberately not the ten main colours
 * either: every one of those is saturated, so a three-point scheme built from
 * them could never have the light middle a diverging ramp needs - the official
 * choropleth colorway's own midpoint is a near-white shade. Drawing from the
 * ramp stops makes the published scheme reproducible by hand.
 */
function DivergingStopsControls() {
  const { config, dispatch } = useChartConfig();
  const { appearance } = config;
  const stops = Array.isArray(appearance.divergingStops) ? appearance.divergingStops : null;
  const setStops = (next) =>
    dispatch({ type: "SET_APPEARANCE", key: "divergingStops", value: next });

  // Seeded from the official colorway rather than from nothing, so turning the
  // control on shows a working ramp the reader edits instead of a blank one
  // they have to assemble before the chart draws anything.
  const seed = (count) =>
    count === 3
      ? ["#8F3811", "#ECE8E7", "#0F4880"]
      : ["#8F3811", "#E9632A", "#ECE8E7", "#44AFD0", "#0F4880"];

  const positionLabel = (index, count) => {
    if (index === 0) return "Bottom";
    if (index === count - 1) return "Upper";
    if (count === 3) return "Middle";
    return ["Bottom", "Lower middle", "Middle", "Upper middle", "Upper"][index];
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="appearance-custom-diverging">Custom diverging colors</Label>
        <Switch
          id="appearance-custom-diverging"
          checked={Boolean(stops)}
          onCheckedChange={(checked) => setStops(checked ? seed(3) : undefined)}
        />
      </div>

      {stops ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="appearance-diverging-count">Points</Label>
            <Select
              value={String(stops.length)}
              onValueChange={(value) => setStops(seed(Number(value)))}
            >
              <SelectTrigger id="appearance-diverging-count">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 (bottom, middle, upper)</SelectItem>
                <SelectItem value="5">5</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            {stops.map((hex, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5"
              >
                <span className="flex-1 text-xs text-muted-foreground">
                  {positionLabel(index, stops.length)}
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Choose the ${positionLabel(index, stops.length).toLowerCase()} color`}
                      className="size-5 shrink-0 rounded-full border"
                      style={{ backgroundColor: hex }}
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2">
                    <div className="grid gap-2">
                      {RAMP_SHADE_GROUPS.map((group) => (
                        <div key={group.name} className="grid gap-1">
                          <p className="text-[11px] text-muted-foreground">{group.name}</p>
                          <div className="flex flex-wrap gap-1">
                            {group.shades.map((shade) => (
                              <button
                                key={shade}
                                type="button"
                                aria-label={shade}
                                className="size-5 rounded-full border"
                                style={{ backgroundColor: shade }}
                                onClick={() =>
                                  setStops(
                                    stops.map((current, i) => (i === index ? shade : current)),
                                  )
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Dashboard-style styling for the diverging bar: a fixed value range, a
 * background track rail, minimal axis chrome, and threshold ("traffic-light")
 * bucket colors.
 */
function DivergingStyleControls() {
  const { config, dispatch } = useChartConfig();
  const { appearance } = config;
  const setAppearance = (key, value) =>
    dispatch({ type: "SET_APPEARANCE", key, value });

  const buckets = Array.isArray(appearance.colorBuckets) ? appearance.colorBuckets : null;
  const setBuckets = (next) => setAppearance("colorBuckets", next.length ? next : undefined);
  const updateBucket = (index, patch) =>
    setBuckets(buckets.map((bucket, i) => (i === index ? { ...bucket, ...patch } : bucket)));

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="appearance-track-rail">Track rail</Label>
        <Switch
          id="appearance-track-rail"
          checked={Boolean(appearance.trackRail)}
          onCheckedChange={(checked) => setAppearance("trackRail", checked)}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="appearance-minimal-axis">Minimal axis</Label>
        <Switch
          id="appearance-minimal-axis"
          checked={Boolean(appearance.minimalAxis)}
          onCheckedChange={(checked) => setAppearance("minimalAxis", checked)}
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="appearance-threshold-colors">Threshold colors</Label>
          <Switch
            id="appearance-threshold-colors"
            checked={Boolean(buckets)}
            onCheckedChange={(checked) =>
              setBuckets(checked ? DEFAULT_COLOR_BUCKETS : [])
            }
          />
        </div>
        {buckets ? (
          <div className="grid gap-1.5">
            {buckets.map((bucket, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5"
              >
                <span className="text-xs text-muted-foreground">≥</span>
                <Input
                  aria-label={`Threshold ${index + 1}`}
                  type="number"
                  inputMode="decimal"
                  className="h-7"
                  placeholder="catch-all"
                  value={bucket.at == null ? "" : String(bucket.at)}
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    updateBucket(index, { at: raw === "" ? null : Number(raw) });
                  }}
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Choose a color for threshold ${index + 1}`}
                      className="size-5 shrink-0 rounded-full border"
                      style={{ backgroundColor: resolveToken(bucket.color) }}
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="end">
                    <div className="grid grid-cols-5 gap-1.5">
                      {BUCKET_TOKENS.map((token) => (
                        <button
                          key={token}
                          type="button"
                          aria-label={token}
                          aria-pressed={bucket.color === token}
                          onClick={() => updateBucket(index, { color: token })}
                          className="size-6 rounded-full border"
                          style={{ backgroundColor: resolveToken(token) }}
                        />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <button
                  type="button"
                  aria-label={`Remove threshold ${index + 1}`}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setBuckets(buckets.filter((_, i) => i !== index))}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setBuckets([...buckets, { at: 0, color: "gray5" }])}
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Add threshold
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Color each bar by value thresholds (e.g. on-pace vs. behind) instead
            of the above/below-center split.
          </p>
        )}
      </div>
    </>
  );
}

/**
 * Manual value-axis scaling for a diverging bar (Workstream B). Lifted out of
 * `DivergingStyleControls` and placed directly beneath the reference-line
 * input: an explicit range now applies whether or not the track rail is on,
 * so this is authoring the axis scale, not a dashboard-styling nicety.
 */
function ValueAxisRangeControls() {
  const { config, dispatch } = useChartConfig();
  const { appearance } = config;
  const setAppearance = (key, value) =>
    dispatch({ type: "SET_APPEARANCE", key, value });

  const range = Array.isArray(appearance.valueRange) ? appearance.valueRange : [];
  const setRange = (index, raw) => {
    const next = [
      range[0] == null ? "" : range[0],
      range[1] == null ? "" : range[1],
    ];
    next[index] = raw === "" ? null : Number(raw);
    // Clear the whole setting once both ends are blank (back to auto range).
    if (next[0] == null && next[1] == null) setAppearance("valueRange", undefined);
    else setAppearance("valueRange", next);
  };

  return (
    <div className="grid gap-2">
      <Label>Value axis range (manual)</Label>
      <div className="flex items-center gap-2">
        <Input
          aria-label="Range minimum"
          type="number"
          inputMode="decimal"
          placeholder="auto"
          value={range[0] == null ? "" : String(range[0])}
          onChange={(event) => setRange(0, event.target.value.trim())}
        />
        <span className="text-muted-foreground">to</span>
        <Input
          aria-label="Range maximum"
          type="number"
          inputMode="decimal"
          placeholder="auto"
          value={range[1] == null ? "" : String(range[1])}
          onChange={(event) => setRange(1, event.target.value.trim())}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Leaving both blank fits the axis to the data.
      </p>
    </div>
  );
}

// ── Section ──────────────────────────────────────────────────────────

export default function AppearanceSection() {
  const { config, dispatch, schema } = useChartConfig();
  const chart = getChartType(config.chartType);
  const appearance = config.appearance || {};
  const setAppearance = (key, value) =>
    dispatch({ type: "SET_APPEARANCE", key, value });

  const { advanced } = useAdvancedMode();
  const isRangeFamily = ["dumbbell", "dotPlot", "forest"].includes(config.chartType);
  const isSymbolMap = config.chartType === "symbolMap";
  // The Color scale (sequential/diverging) select belongs to the types that
  // are always scale-driven; a symbol map reaches its ramp through the
  // gradient switch instead.
  const isAlwaysScale = getChartType(config.chartType)?.colorEncoding === "scale";
  // Whether a colour ramp is in play, and which one — read off the chart type's
  // own `colorEncoding` rather than a list of ids here, so a newly registered
  // scale-driven type is offered ramp palettes by declaring itself.
  const paletteKind = paletteKindFor(config.chartType, appearance);
  const rampInPlay = paletteKind !== "categorical";
  const showsColorBinding = chart?.colorBindingSection === "appearance";
  const colorFields = showsColorBinding
    ? Object.entries(bindableFields(schema, config)).filter(([, field]) => {
        if (!(chart.roleConstraints.color || []).includes(field.kind)) return false;
        return (
          !isMeasure(field) ||
          supportsRole(field, CATALOG_ROLE_FOR_BINDING.color)
        );
      })
    : [];

  return (
    <div className="grid gap-4">
      {showsColorBinding ? (
        <div className="grid gap-2">
          <Label htmlFor="binding-color">Color</Label>
          <Select
            value={config.bindings?.color || NONE}
            onValueChange={(field) =>
              dispatch({
                type: "SET_BINDING",
                role: "color",
                field: field === NONE ? null : field,
              })
            }
          >
            <SelectTrigger id="binding-color">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not set</SelectItem>
              {colorFields.map(([name, field]) => (
                <SelectItem key={name} value={name}>
                  {field.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* ---- The shared appearance controls, in order ---- */}
      <PalettePicker
        seriesNames={config.legendNames || config.seriesNames || []}
        kind={paletteKind}
      />

      <div className="grid gap-2">
        <Label htmlFor="appearance-legend">Legend Position</Label>
        <Select
          value={appearance.legendPosition || "right"}
          onValueChange={(value) => setAppearance("legendPosition", value)}
        >
          <SelectTrigger id="appearance-legend">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="right">Right</SelectItem>
            <SelectItem value="bottom">Bottom</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <LineSpacingControls
        lineAxes={chart?.lineAxes}
        appearance={appearance}
        onChange={setAppearance}
      />

      <div className="grid gap-2">
        <Label htmlFor="appearance-footnote">Footnote</Label>
        <Textarea
          id="appearance-footnote"
          value={config.labels?.footnote || ""}
          placeholder="Optional source note shown beneath the chart"
          onChange={(event) =>
            dispatch({ type: "SET_LABEL", key: "footnote", value: event.target.value })
          }
        />
      </div>

      {/* ---- Everything below here is chart-type-conditional ---- */}

      {chart?.roleConstraints?.group && config.bindings?.group ? (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="appearance-group-gap">Space between groups</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Number(appearance.groupGap ?? 0.75).toFixed(2)}
            </span>
          </div>
          <Slider
            id="appearance-group-gap"
            min={0}
            max={3}
            step={0.25}
            value={[Number(appearance.groupGap ?? 0.75)]}
            onValueChange={([value]) => setAppearance("groupGap", value)}
            aria-label="Space between groups"
          />
        </div>
      ) : null}

      {usesGroupedRowLabels(config) ? (
        <GroupedRowLabelControls
          appearance={appearance}
          onChange={setAppearance}
        />
      ) : null}

      {config.chartType === "line" ? (
        <div className="grid gap-2">
          <Label htmlFor="appearance-markers">Markers</Label>
          <Select
            value={appearance.markerMode || "auto"}
            onValueChange={(value) => setAppearance("markerMode", value)}
          >
            <SelectTrigger id="appearance-markers">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatic</SelectItem>
              <SelectItem value="on">On</SelectItem>
              <SelectItem value="off">Off</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* Orientation moved to OutcomeSection (Workstream A): it is the one
          degree of freedom the Outcome section still asks about explicitly,
          alongside the category/measure choice it otherwise infers. The
          Diverging bars switch lives there too, beside orientation
          (Workstream B). */}

      {/* Diverging bars pivot around a reference value (0 by default; set 1.0 for
          a pace ratio, a survey-neutral midpoint, etc.). Gated on the
          `diverging` flag rather than a chart type (Workstream B: Bar absorbs
          Diverging Bar). */}
      {config.appearance?.diverging ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="appearance-center">Center reference</Label>
            <Input
              id="appearance-center"
              type="number"
              inputMode="decimal"
              placeholder="e.g. 0 or 1.0"
              value={appearance.center == null ? "" : String(appearance.center)}
              onChange={(event) => {
                const raw = event.target.value.trim();
                setAppearance("center", raw === "" ? 0 : Number(raw));
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="appearance-reference-value">Reference line</Label>
            <Input
              id="appearance-reference-value"
              type="number"
              inputMode="decimal"
              placeholder="Same as center reference"
              value={appearance.referenceValue == null ? "" : String(appearance.referenceValue)}
              onChange={(event) => {
                const raw = event.target.value.trim();
                setAppearance("referenceValue", raw === "" ? null : Number(raw));
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="appearance-reference-label">Reference line label</Label>
            <Input
              id="appearance-reference-label"
              type="text"
              placeholder="Optional"
              value={appearance.referenceLabel || ""}
              onChange={(event) => setAppearance("referenceLabel", event.target.value)}
            />
          </div>
          <ValueAxisRangeControls />
          <DivergingStyleControls />
        </>
      ) : null}

      {isAlwaysScale ? (
        <div className="grid gap-2">
          <Label htmlFor="appearance-color-scale">Color scale</Label>
          <Select
            value={appearance.colorScale || "sequential"}
            onValueChange={(value) => setAppearance("colorScale", value)}
          >
            <SelectTrigger id="appearance-color-scale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sequential">Sequential</SelectItem>
              <SelectItem value="diverging">Diverging</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* Workstream C: a second, redundant colour encoding of the measure a
          symbol map's marker area already carries — off keeps today's
          single-palette-colour behaviour exactly. */}
      {isSymbolMap ? (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="appearance-symbol-gradient">Color gradient</Label>
          <Switch
            id="appearance-symbol-gradient"
            checked={Boolean(appearance.symbolGradient)}
            onCheckedChange={(checked) => setAppearance("symbolGradient", checked)}
          />
        </div>
      ) : null}

      {/* Hand-picked diverging stops, behind Advanced Mode: a default reader
          picks a published ramp, and only someone deliberately composing one
          needs five swatch pickers on screen. */}
      {rampInPlay && paletteKind === "diverging" && advanced ? (
        <DivergingStopsControls />
      ) : null}

      {/* Shown wherever a ramp is actually in play: a heatmap, a choropleth,
          or a symbol map with its gradient on. */}
      {rampInPlay ? (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="appearance-invert-scale">Invert color scale</Label>
          <Switch
            id="appearance-invert-scale"
            checked={Boolean(appearance.invertScale)}
            onCheckedChange={(checked) => setAppearance("invertScale", checked)}
          />
        </div>
      ) : null}

      {isRangeFamily ? (
        <>
          {advanced ? (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="appearance-hide-x-axis">Hide X-Axis</Label>
              <Switch
                id="appearance-hide-x-axis"
                checked={appearance.showValueAxis === false}
                onCheckedChange={(checked) => setAppearance("showValueAxis", !checked)}
              />
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="appearance-point-labels">Show point values</Label>
            <Switch
              id="appearance-point-labels"
              checked={Boolean(appearance.showPointLabels)}
              onCheckedChange={(checked) => setAppearance("showPointLabels", checked)}
            />
          </div>
          {config.chartType === "dumbbell" && appearance.showPointLabels ? (
            <div className="flex items-center justify-between gap-3 pl-4">
              <Label
                htmlFor="appearance-point-labels-first-line"
                className="text-sm font-normal"
              >
                First Line Only
              </Label>
              <Switch
                id="appearance-point-labels-first-line"
                checked={Boolean(appearance.pointLabelsFirstLineOnly)}
                onCheckedChange={(checked) =>
                  setAppearance("pointLabelsFirstLineOnly", checked)
                }
              />
            </div>
          ) : null}
        </>
      ) : null}

      {/* Per-series value labels for the dot plot — turn the master "Show point
          values" on, then hide individual series (e.g. show only "Women").
          Keyed on the last-rendered series names. */}
      {config.chartType === "dotPlot" &&
      appearance.showPointLabels &&
      (config.seriesNames || []).length ? (
        <div className="grid gap-2 rounded-lg border bg-card p-3">
          <span className="text-sm font-medium">Show values for</span>
          {(config.seriesNames || []).map((name) => {
            const perSeries = appearance.pointLabelSeries || {};
            return (
              <div key={name} className="flex items-center justify-between gap-3">
                <Label htmlFor={`point-label-${name}`} className="text-sm font-normal">
                  {name}
                </Label>
                <Switch
                  id={`point-label-${name}`}
                  checked={perSeries[name] !== false}
                  onCheckedChange={(checked) =>
                    setAppearance("pointLabelSeries", { ...perSeries, [name]: checked })
                  }
                />
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Forest plot: how the CI ends and the estimate marker render, plus the
          line of no effect. */}
      {config.chartType === "forest" ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="appearance-endpoint-style">Interval ends</Label>
            <Select
              value={appearance.endpointStyle || "caps"}
              onValueChange={(value) => setAppearance("endpointStyle", value)}
            >
              <SelectTrigger id="appearance-endpoint-style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="caps">Vertical bars</SelectItem>
                <SelectItem value="dots">Dots</SelectItem>
                <SelectItem value="diamonds">Diamonds</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="appearance-point-style">Estimate marker</Label>
            <Select
              value={appearance.pointStyle || "square"}
              onValueChange={(value) => setAppearance("pointStyle", value)}
            >
              <SelectTrigger id="appearance-point-style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="square">Square</SelectItem>
                <SelectItem value="diamond">Diamond</SelectItem>
                <SelectItem value="dot">Dot</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="appearance-no-effect">Line of no effect</Label>
            <Input
              id="appearance-no-effect"
              type="number"
              inputMode="decimal"
              placeholder="e.g. 0 or 1 (blank to hide)"
              value={
                appearance.noEffectValue == null
                  ? ""
                  : String(appearance.noEffectValue)
              }
              onChange={(event) => {
                const raw = event.target.value.trim();
                setAppearance("noEffectValue", raw === "" ? null : Number(raw));
              }}
            />
          </div>
        </>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="appearance-watermark">PPIC watermark</Label>
        <Switch
          id="appearance-watermark"
          checked={Boolean(appearance.watermark)}
          onCheckedChange={(checked) => setAppearance("watermark", checked)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="appearance-tooltip">Tooltip template</Label>
        <Textarea
          id="appearance-tooltip"
          value={config.labels?.tooltip || ""}
          placeholder="Leave blank for the chart default"
          onChange={(event) =>
            dispatch({ type: "SET_LABEL", key: "tooltip", value: event.target.value })
          }
        />
      </div>
    </div>
  );
}
