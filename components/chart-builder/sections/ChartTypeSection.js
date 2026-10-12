"use client";

/**
 * ChartTypeSection.js — the sidebar's chart-type grid.
 *
 * Two columns of icon tiles — a small chart drawing over the label
 * (`chartTypeIcons.js`) — in the order the owner's October 2026 mockup lists
 * them. The order is declared here rather than read from the registry because
 * it is a design decision, not a data one; any registered type missing from
 * the list still appears, appended, so a new chart type is never silently
 * unreachable.
 *
 * Only the first four available tiles show until the reader asks for more
 * ("Show more (N)"); the rest stay one click away. The grid opens, and
 * re-opens, on its own whenever the selected chart is one of the hidden tiles,
 * so a selection is never out of sight. The expanded state is not remembered
 * between visits (owner, 2026-10-12).
 *
 * A chart family (`CHART_FAMILIES` in the registry) is ONE tile: Scatter
 * stands for the scatter, bubble, and dot plot charts (owner, 2026-10-05), and
 * Maps for the choropleth and symbol maps (owner, 2026-10-12).
 * Choosing it opens the first variant this surface can draw, and a Variant
 * control under the grid switches between them. Each variant stays its own
 * chart type, so choosing one dispatches SET_CHART_TYPE exactly as a tile
 * does. A variant this surface cannot draw (scatter and bubble on a module,
 * which has one outcome measure) omits the unavailable variants.
 *
 * Both editor shells render this one grid: the wizard's retired Chart Type
 * *step* once grouped the tiles into named families, and Workstream F kept
 * that layout briefly as a `grouped` prop, but the standalone tool now reads
 * exactly like the module workbench, so the families are gone and the tile
 * set, its order, and its availability filtering have a single answer.
 *
 * Props:
 *   None (reads useChartConfig()).
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *   - lib/visualization/chartRegistry.js (labels, families, and the registered id set)
 *   - The editor model's chartChoices (which types this question can draw, and why not)
 *
 * UI Kit reference:
 *   - Implements the "Chart Type tile" pattern in the Editor Sidebar showcase
 */

import React, { useId, useState } from "react";

import { ChevronDown, ChevronUp } from "lucide-react";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { ChartTypeIcon, hasChartTypeIcon } from "@/components/chart-builder/sections/chartTypeIcons";
import GraphTabs from "@/components/charts/GraphTabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import { isChartTypeAvailable } from "@/lib/visualization/chartAvailability";
import {
  CHART_FAMILIES,
  CHART_TYPE_IDS,
  chartFamilyOf,
  getChartType,
} from "@/lib/visualization/chartRegistry";

// Mockup order, reading left-to-right across the two columns. The first four
// — Line, Bar, Range ("dumbbell"), Maps — are the ones shown before "Show
// more" (owner, 2026-10-12). "map" is the Maps family's tile (choropleth,
// symbols); "scatter" is the Scatter family's tile (scatter, bubble, dot plot).
const TILE_ORDER = [
  "line",
  "bar",
  "dumbbell",
  "map",
  "forest",
  "scatter",
  "pie",
  "heatmap",
  "dataTable",
];

// How many tiles show before "Show more". Counted over the tiles this schema
// can draw, so an unavailable top tile (Maps on a module with no geometry)
// lets the next one move up rather than leaving a gap.
const VISIBLE_TILES = 4;

/**
 * One tile per chart type, or per family: a family's id stands for all of its
 * variants. A tile is offered when any chart it stands for is available.
 */
function tileFor(id) {
  const family = Object.hasOwn(CHART_FAMILIES, id) ? CHART_FAMILIES[id] : chartFamilyOf(id);
  if (family) {
    return { id: family.id, label: family.label, purpose: family.purpose, ids: family.variants.map((variant) => variant.id), family };
  }
  const chart = getChartType(id);
  return { id, label: chart.label, purpose: chart.purpose, ids: [id], family: null };
}

/**
 * Declared order first, then any registered type the list forgot, filtered by
 * what this schema can actually draw (`isChartTypeAvailable`: registration,
 * the module's `supportedChartTypes`, and whether a map type has any
 * geometry to join to). Without the availability
 * check, a descriptor dropped from `TILE_ORDER` alone would reappear here as a
 * stray appended tile, and a map type would be offered on a module that holds
 * no geometry for it. A family's variants are never appended on their own.
 */
function orderedTiles(schema) {
  const known = new Set(TILE_ORDER);
  const inFamily = (id) => Boolean(chartFamilyOf(id));
  const ids = [...TILE_ORDER, ...CHART_TYPE_IDS.filter((id) => !known.has(id) && !inFamily(id))];
  return ids
    .map((id) => {
      const tile = tileFor(id);
      return { ...tile, ids: tile.ids.filter((chartId) => isChartTypeAvailable(chartId, schema)) };
    })
    .filter((tile) => tile.ids.length > 0);
}

/**
 * The drawing a tile shows: the selected variant's own drawing when the tile
 * is a family standing for it (Maps follows Choropleth / Symbols), else the
 * family's opening variant, else the chart's own.
 */
function iconIdFor(tile, selectedId) {
  if (!tile.family) return tile.id;
  if (tile.ids.includes(selectedId) && hasChartTypeIcon(selectedId)) return selectedId;
  return tile.family.variants[0].id;
}

function ChartTypeTile({ tile, iconId, selected, disabled = false, onSelect }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      title={tile.purpose}
      className={cn(
        "flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border px-2 py-4 text-center text-sm font-medium text-foreground transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-ppic-brand bg-ppic-orange-50/30"
          : "border-border bg-card hover:border-ppic-brand/50 hover:bg-muted/60",
      )}
    >
      <ChartTypeIcon id={iconId} />
      <span>{tile.label}</span>
    </button>
  );
}

/** The selected family's variants, with the reason any of them is unavailable. */
function VariantControl({ tile, selectedId, choiceOf, onSelect }) {
  const variants = tile.family.variants.filter((variant) => tile.ids.includes(variant.id));
  const reasons = [
    ...new Set(
      variants
        .filter((variant) => !choiceOf(variant.id).available)
        .map((variant) => choiceOf(variant.id).reason)
        .filter(Boolean),
    ),
  ];
  return (
    <div className="grid gap-1.5" data-chart-variants={tile.id}>
      <GraphTabs
        label="Variant"
        options={variants.map((variant) => ({
          value: variant.id,
          label: variant.label,
          disabled: !choiceOf(variant.id).available && variant.id !== selectedId,
        }))}
        value={selectedId}
        onValueChange={onSelect}
      />
      {reasons.map((reason) => (
        <p key={reason} className="m-0 text-xs text-muted-foreground">
          {reason}
        </p>
      ))}
    </div>
  );
}

export default function ChartTypeSection() {
  const { config, dispatch, schema, editorModel } = useChartConfig();
  const tiles = orderedTiles(schema);
  const choices = new Map((editorModel?.chartChoices || []).map((choice) => [choice.id, choice]));
  // A type the editor model says nothing about is available.
  const choiceOf = (id) => choices.get(id) || { available: true };
  const selectedId = config.presentation?.chartType || config.chartType;
  const gridId = useId();
  const select = (id) => dispatch({ type: "SET_CHART_TYPE", chartType: id });
  const selectedIndex = tiles.findIndex((tile) => tile.ids.includes(selectedId));
  const selectedTile = tiles[selectedIndex];
  const selectionHidden = selectedIndex >= VISIBLE_TILES;

  // Collapsed on every mount unless the selection sits among the hidden tiles.
  // When the selection later moves to a hidden tile from elsewhere (a preset,
  // a restored view), the grid opens again — adjusted during render, as React
  // recommends for state derived from a changed prop, rather than in an effect.
  const [expanded, setExpanded] = useState(selectionHidden);
  const [seenTileId, setSeenTileId] = useState(selectedTile?.id);
  if (selectedTile?.id !== seenTileId) {
    setSeenTileId(selectedTile?.id);
    if (selectionHidden) setExpanded(true);
  }

  const hiddenCount = Math.max(tiles.length - VISIBLE_TILES, 0);
  const shownTiles = expanded ? tiles : tiles.slice(0, VISIBLE_TILES);

  /** A family tile keeps its current variant, else opens the first one available. */
  const selectTile = (tile) => {
    if (tile.ids.includes(selectedId)) return;
    select(tile.ids.find((id) => choiceOf(id).available) ?? tile.ids[0]);
  };

  return (
    <div className="grid gap-3">
      <div id={gridId} role="group" aria-label="Chart type" className="grid grid-cols-2 gap-3">
        {shownTiles.map((tile) => (
          <ChartTypeTile
            key={tile.id}
            tile={tile}
            iconId={iconIdFor(tile, selectedId)}
            selected={tile.ids.includes(selectedId)}
            disabled={tile.ids.every((id) => !choiceOf(id).available)}
            onSelect={() => selectTile(tile)}
          />
        ))}
      </div>
      {hiddenCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls={gridId}
          onClick={() => setExpanded((current) => !current)}
          className="justify-self-center text-sm font-normal text-muted-foreground"
        >
          {expanded ? "Show less" : `Show more (${hiddenCount})`}
          {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </Button>
      ) : null}
      {selectedTile?.family ? (
        <VariantControl tile={selectedTile} selectedId={selectedId} choiceOf={choiceOf} onSelect={select} />
      ) : null}
    </div>
  );
}
