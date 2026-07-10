"use client";

/**
 * MultiChartToolbar.js — workspace controls for chart grids and history.
 *
 * Props:
 *   None — reads workspace/history state from ChartConfigProvider.
 *
 * Data sources:
 *   - components/chart-builder/chartConfigStore.js workspace state
 *
 * UI Kit reference:
 *   - Button, Select, and ToggleGroup primitives; no bespoke control surface.
 */

import React from "react";

import { Plus, Redo2, Trash2, Undo2 } from "lucide-react";

import {
  CHART_LAYOUTS,
  MAX_CHARTS,
  useChartConfig,
} from "@/components/chart-builder/chartConfigStore";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/components/ui/utils";

const LAYOUT_LABELS = Object.freeze({
  "1x1": "Single",
  "1x2": "Side by side",
  "2x1": "Stacked",
  "2x2": "Grid",
});

function layoutCapacity(layout) {
  if (layout === "2x2") return 4;
  if (layout === "1x2" || layout === "2x1") return 2;
  return 1;
}

export default function MultiChartToolbar() {
  const { canRedo, canUndo, dispatch, schema, workspace } = useChartConfig();
  const charts = workspace?.charts || [];
  const activeId = workspace?.activeChartId || charts[0]?.id;
  const hasData = !schema.inlineOnly || charts.some((chart) => chart.config.data?.inline);
  const canAdd = hasData && charts.length < MAX_CHARTS;
  const layoutOptions = CHART_LAYOUTS.filter(
    (layout) => layoutCapacity(layout) >= charts.length,
  );

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => dispatch({ type: "ADD_CHART" })}
          disabled={!canAdd}
          title={!hasData ? "Import or load data before adding another chart." : undefined}
        >
          <Plus aria-hidden="true" />
          Add chart
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => dispatch({ type: "REMOVE_CHART", chartId: activeId })}
          disabled={charts.length <= 1}
        >
          <Trash2 aria-hidden="true" />
          Remove
        </Button>
        <Select
          value={workspace?.layout || "1x1"}
          onValueChange={(layout) => dispatch({ type: "SET_CHART_LAYOUT", layout })}
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue aria-label="Grid layout" />
          </SelectTrigger>
          <SelectContent>
            {layoutOptions.map((layout) => (
              <SelectItem key={layout} value={layout}>
                {LAYOUT_LABELS[layout]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ToggleGroup
        type="single"
        value={activeId}
        onValueChange={(chartId) =>
          chartId && dispatch({ type: "SET_ACTIVE_CHART", chartId })
        }
        className="min-w-0"
        aria-label="Chart being edited"
      >
        {charts.map((chart, index) => (
          <ToggleGroupItem
            key={chart.id}
            value={chart.id}
            className={cn("h-8 px-3 text-xs", chart.id === activeId && "font-semibold")}
          >
            {index + 1}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Undo"
          className="size-8"
          disabled={!canUndo}
          onClick={() => dispatch({ type: "UNDO" })}
        >
          <Undo2 aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Redo"
          className="size-8"
          disabled={!canRedo}
          onClick={() => dispatch({ type: "REDO" })}
        >
          <Redo2 aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}
