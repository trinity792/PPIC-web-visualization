"use client";

/**
 * AppearanceSection.js — palette, legend, spacing, footnote, and the styling a
 * particular chart type needs.
 *
 * Ordered as the mockup draws it: Color Palette, Legend Position, the two line
 * spacings, Footnote. Everything after Footnote is chart-type-conditional, so a
 * default line chart shows exactly the mockup's five controls and a diverging
 * bar or forest plot grows the extras it actually needs. That ordering is a
 * contract, not a preference — the tested one — because it is what keeps the
 * common case from being buried under options nine charts out of ten ignore.
 *
 * Typography moved to its own section; the tooltip template arrived here from
 * Labels.
 *
 * Props:
 *   None (LineSpacingControls takes lineAxes / appearance / onChange).
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

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { getChartType } from "@/lib/visualization/chartRegistry";
import { resolveToken } from "@/lib/visualization/palettes";

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
 * Dashboard-style styling for the diverging bar: a fixed value range, a
 * background track rail, minimal axis chrome, and threshold ("traffic-light")
 * bucket colors.
 */
function DivergingStyleControls() {
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

  const buckets = Array.isArray(appearance.colorBuckets) ? appearance.colorBuckets : null;
  const setBuckets = (next) => setAppearance("colorBuckets", next.length ? next : undefined);
  const updateBucket = (index, patch) =>
    setBuckets(buckets.map((bucket, i) => (i === index ? { ...bucket, ...patch } : bucket)));

  return (
    <>
      <div className="grid gap-2">
        <Label>Value axis range</Label>
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
      </div>
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

// ── Section ──────────────────────────────────────────────────────────

export default function AppearanceSection() {
  const { config, dispatch } = useChartConfig();
  const chart = getChartType(config.chartType);
  const appearance = config.appearance || {};
  const setAppearance = (key, value) =>
    dispatch({ type: "SET_APPEARANCE", key, value });

  const isRangeFamily = ["dumbbell", "dotPlot", "forest"].includes(config.chartType);

  return (
    <div className="grid gap-4">
      {/* ---- The mockup's five, in order ---- */}
      <PalettePicker seriesNames={config.seriesNames || []} />

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

      {["bar", "divergingBar"].includes(config.chartType) ? (
        <div className="grid gap-2">
          <Label htmlFor="appearance-orientation">Orientation</Label>
          <Select
            value={
              appearance.orientation ||
              (config.chartType === "divergingBar" ? "horizontal" : "vertical")
            }
            onValueChange={(value) => setAppearance("orientation", value)}
          >
            <SelectTrigger id="appearance-orientation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="horizontal">Horizontal</SelectItem>
              <SelectItem value="vertical">Vertical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* Diverging bars pivot around a reference value (0 by default; set 1.0 for
          a pace ratio, a survey-neutral midpoint, etc.). */}
      {config.chartType === "divergingBar" ? (
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
          <DivergingStyleControls />
        </>
      ) : null}

      {["heatmap", "choroplethMap"].includes(config.chartType) ? (
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

      {isRangeFamily ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="appearance-value-axis">Show values on plot</Label>
            <Switch
              id="appearance-value-axis"
              checked={appearance.showValueAxis !== false}
              onCheckedChange={(checked) => setAppearance("showValueAxis", checked)}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="appearance-point-labels">Show point values</Label>
            <Switch
              id="appearance-point-labels"
              checked={Boolean(appearance.showPointLabels)}
              onCheckedChange={(checked) => setAppearance("showPointLabels", checked)}
            />
          </div>
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
