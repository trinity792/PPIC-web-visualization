"use client";

/**
 * GeographySection.js — geographic level, which places to draw, and how they are
 * ranked and ordered.
 *
 * The mockup's "Geographic Level" block, which absorbs three controls that used
 * to live apart: the level selector (was in Encodings), the explicit place
 * selection (was a comma-separated "selected places" layer), and — for chart
 * types whose categories *are* places — the ordering and Top/Bottom N controls
 * (were in Comparisons). Decision 3: for every other chart type those belong to
 * `CategoriesSection` instead. A place row has one inclusion control: its
 * checkbox. It does not also carry a visibility switch.
 *
 * Selection writes the first-class `filters.locations` array. V3 line charts
 * treat an empty selection as unfinished authoring state; level-wide maps and
 * legacy ranked views retain their existing all-place behavior.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *   - components/chart-builder/useLocationOptions.js (GET ?view=locations)
 *
 * UI Kit reference:
 *   - Implements the select, checkbox-list, and draggable list-row patterns
 */

import React, { useMemo, useState } from "react";

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  geometrySubsetFor,
  requiresGeometry,
} from "@/lib/visualization/chartAvailability";
import { useAdvancedMode } from "@/components/chart-builder/advancedMode";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import useLocationOptions from "@/components/chart-builder/useLocationOptions";
import CategoriesSection from "@/components/chart-builder/sections/CategoriesSection";
import {
  CategoryList,
  RankingControls,
  orderedCategories,
} from "@/components/chart-builder/sections/categoryControls";

// How many places show before "Show more".
const COLLAPSED_LOCATION_COUNT = 7;

/**
 * Chart types whose categories are the places themselves, so ordering and
 * ranking belong in this section rather than in Categories.
 *
 * A diverging bar needs no entry of its own (Workstream B): it retired to a
 * `bar` variant flag, so its `chartType` is "bar" and already matches here.
 */
const PLACE_CATEGORY_CHART_TYPES = new Set(["line", "bar"]);

/** Whether a schema offers any geography at all (bring-your-own-data does not). */
export function hasGeographicSubsets(config, schema) {
  return Object.keys(schema?.subsets || {}).length > 0;
}

export default function GeographySection() {
  const { config: storedConfig, dispatch, schema } = useChartConfig();
  const v3 = storedConfig.version === 3;
  const ranking = storedConfig.question?.calculation?.params?.ranking;
  const config = v3
    ? {
        ...storedConfig,
        chartType: storedConfig.presentation?.chartType,
        filters: {
          subset: storedConfig.question?.geography?.subset,
          locations: storedConfig.question?.geography?.locations || [],
          source: storedConfig.question?.source,
          topN: ranking?.n,
        },
        appearance: {
          ...(storedConfig.presentation?.appearance || {}),
          sort: ranking?.direction === "bottom" ? "ascending" : "value",
        },
      }
    : storedConfig;
  const options = useLocationOptions(schema, config.filters);
  // Read before the early return: hook order cannot depend on the schema.
  const { advanced } = useAdvancedMode();

  if (!hasGeographicSubsets(config, schema)) return null;

  // A map-shaped chart can only draw the geometry we hold (a symbol map's
  // points are derived from the same county polygons a choropleth draws), so it
  // is pinned to the level that has one rather than offered levels that would
  // render blank. The store writes that level on the chart-type switch itself
  // (`withGeometrySubset`); this only keeps the select from offering the rest.
  const geometrySubset = geometrySubsetFor(schema);
  const subsets =
    requiresGeometry(config.chartType) && geometrySubset
      ? [geometrySubset]
      : Object.keys(schema.subsets || {});

  const reorderable = PLACE_CATEGORY_CHART_TYPES.has(config.chartType);
  const selected = config.filters?.locations || [];
  const names = reorderable
    ? orderedCategories(options.locations, config.appearance?.categoryOrder)
    : options.locations;

  function setSubset(value) {
    if (v3) {
      dispatch({
        type: "SET_GEOGRAPHY",
        geography: { ...storedConfig.question.geography, subset: value, locations: [] },
      });
    } else {
      dispatch({ type: "SET_FILTER", key: "subset", value });
    }
    // Place names do not survive a level change (a county is not a region), so
    // an explicit selection is cleared rather than silently filtering nothing.
    // The implied `category` binding (Workstream A) is not touched here: a level
    // change alters which rows a chart draws, not which column names them.
    if (!v3) dispatch({ type: "SET_FILTER", key: "locations", value: [] });
    const forcedSource = schema.subsetSource?.[value];
    if (forcedSource && schema.sources?.includes(forcedSource)) {
      dispatch(v3
        ? { type: "SET_SOURCE", source: forcedSource }
        : { type: "SET_FILTER", key: "source", value: forcedSource });
    } else if (value === "States" && schema.sources?.includes("Census")) {
      dispatch(v3
        ? { type: "SET_SOURCE", source: "Census" }
        : { type: "SET_FILTER", key: "source", value: "Census" });
    }
  }

  function toggleLocation(name, checked) {
    const next = checked
      ? [...selected, name]
      : selected.filter((item) => item !== name);
    dispatch(v3
      ? {
          type: "SET_GEOGRAPHY",
          geography: { ...storedConfig.question.geography, locations: next },
        }
      : { type: "SET_FILTER", key: "locations", value: next });
  }

  /**
   * Add or remove a whole batch at once (Select all / Clear). Works on the
   * batch it is given rather than on every location, so with a search active it
   * means "all of these matches" — which is what a control sitting directly
   * above a filtered list has to mean.
   */
  function selectMany(batch, checked) {
    const next = new Set(selected);
    for (const name of batch) {
      if (checked) next.add(name);
      else next.delete(name);
    }
    dispatch(v3
      ? {
          type: "SET_GEOGRAPHY",
          geography: { ...storedConfig.question.geography, locations: [...next] },
        }
      : { type: "SET_FILTER", key: "locations", value: [...next] });
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="geography-level">Geographic level</Label>
        <Select value={config.filters?.subset || ""} onValueChange={setSubset}>
          <SelectTrigger id="geography-level">
            <SelectValue placeholder="Choose a level" />
          </SelectTrigger>
          <SelectContent>
            {subsets.map((subset) => (
              <SelectItem key={subset} value={subset}>
                {subset}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {config.filters?.subset ? (
        <LocationPicker
          // Keyed on the level so a search typed against counties does not carry
          // over to regions, where it would silently filter a fresh list.
          key={config.filters.subset}
          status={options.status}
          names={names}
          selected={selected}
          reorderable={reorderable}
          visibilityControls={false}
          onSelect={toggleLocation}
          onSelectMany={selectMany}
          onReorder={(value) =>
            dispatch({ type: "SET_APPEARANCE", key: "categoryOrder", value })
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a geographic level to choose locations.
        </p>
      )}

      {config.filters?.subset && reorderable ? (
        // Ranked values sits behind Advanced Mode; the place list above still
        // carries ordering and checkbox selection, so hiding it costs no reach.
        advanced ? (
          <RankingControls
            idPrefix="geography-ranking"
            topN={config.filters?.topN ?? 20}
            sort={config.appearance?.sort || "value"}
            onChange={({ topN, sort }) => dispatch({ type: "SET_RANKING", topN, sort })}
          />
        ) : null
      ) : config.filters?.subset ? (
        // This chart's categories are something other than places (a pie of
        // housing types, a heatmap of age groups), so ordering, visibility, and
        // ranking belong to those values rather than to the place list above.
        <CategoriesSection />
      ) : null}
    </div>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

/**
 * The place list: a search box, a select-all control, and the rows themselves.
 *
 * Every async state is named rather than collapsed into an empty list, because a
 * blank list and a failed request must not look alike.
 */
function LocationPicker({
  status,
  names,
  selected,
  reorderable,
  onSelect,
  onSelectMany,
  onReorder,
  visibilityControls,
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return names;
    return names.filter((name) => name.toLowerCase().includes(needle));
  }, [names, query]);

  const selectedSet = new Set(selected);
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((name) => selectedSet.has(name));
  // Search only earns its space once the list is long enough to collapse. Five
  // regions do not need a filter; five hundred cities are unusable without one.
  const searchable = names.length > COLLAPSED_LOCATION_COUNT;
  const searching = query.trim() !== "";

  if (status === "loading" || status === "idle") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading locations…
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="text-sm text-destructive">
        We could not load locations for this geographic level. Try refreshing, or
        pick a different level.
      </p>
    );
  }
  if (!names.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No locations available for this geographic level.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {searchable ? (
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search locations"
            placeholder="Search locations"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-8"
          />
        </div>
      ) : null}

      {filtered.length ? (
        <div className="flex items-center justify-between gap-2 px-0.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              aria-label={
                searching
                  ? `Select all ${filtered.length} matching locations`
                  : `Select all ${filtered.length} locations`
              }
              checked={allFilteredSelected}
              onCheckedChange={(checked) =>
                onSelectMany?.(filtered, checked === true)
              }
            />
            <span>
              Select all
              <span className="ml-1 text-muted-foreground">
                ({filtered.length}
                {searching ? " matching" : ""})
              </span>
            </span>
          </label>
          {selected.length ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              // Clears the whole selection, not just the matches — otherwise a
              // filtered "Clear" would leave places selected that the reader
              // cannot see to unselect.
              onClick={() => onSelectMany?.(selected, false)}
            >
              Clear ({selected.length})
            </Button>
          ) : null}
        </div>
      ) : null}

      {filtered.length ? (
        <CategoryList
          // Keyed on the query so collapsing resets between searches: leaving a
          // list expanded from a previous filter would hide the new match count.
          key={query}
          names={filtered}
          collapsed={COLLAPSED_LOCATION_COUNT}
          selectable
          selected={selected}
          onSelect={onSelect}
          // Reordering a filtered list would write an order covering only the
          // matches, silently dropping every place the filter hid.
          reorderable={reorderable && !searching}
          visibilityControls={visibilityControls}
          onReorder={onReorder}
        />
      ) : (
        <p className="px-0.5 text-sm text-muted-foreground">
          No locations match “{query.trim()}”.
        </p>
      )}
    </div>
  );
}
