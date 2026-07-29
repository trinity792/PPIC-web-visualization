"use client";

/**
 * ChartContainerFooter.js — the chart card's action bar.
 *
 * A segmented View Chart / View Data toggle on the left, and the two export
 * dropdowns on the right. Both exports stay disabled until the preview reports
 * `ready`, because there is no figure or table to write until then.
 *
 * Deliberately takes preview state as props rather than calling `usePreview()`:
 * the footer is a presentational bar, and keeping it context-free lets it mount
 * anywhere (including tests) without a PreviewProvider.
 *
 * Props:
 *   viewMode         {"chart"|"data"} — which body the container is showing
 *   onViewModeChange {Function}       — called with the next view mode
 *   status           {string}         — preview status ("ready" enables export)
 *   graphDivRef      {Object|null}    — forwarded to ExportChartButton
 *   loaded           {Object|null}    — forwarded to both export buttons
 *   previews         {Array|null}     — forwarded to both export buttons
 *   graphDivRefs     {Object|null}    — forwarded to ExportChartButton
 *
 * Data sources:
 *   - Via props from ChartContainer
 *
 * UI Kit reference:
 *   - Implements the segmented pill toggle and the brand action-button pair
 */

/* eslint-disable react/prop-types */

import React from "react";

import {
  ExportChartButton,
  ExportDataButton,
} from "@/components/chart-builder/ExportMenu";
import { cn } from "@/components/ui/utils";

const VIEW_MODES = [
  { id: "chart", label: "View Chart" },
  { id: "data", label: "View Data" },
];

export default function ChartContainerFooter({
  viewMode = "chart",
  onViewModeChange,
  status = "loading",
  graphDivRef = null,
  loaded = null,
  previews = null,
  graphDivRefs = null,
}) {
  const ready = status === "ready";

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div
        role="group"
        aria-label="Chart or data view"
        className="inline-flex items-center gap-1 rounded-full bg-muted p-1"
      >
        {VIEW_MODES.map((mode) => {
          const active = viewMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              aria-pressed={active}
              onClick={() => onViewModeChange?.(mode.id)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-ppic-orange-300 text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
              )}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ExportChartButton
          graphDivRef={graphDivRef}
          loaded={loaded}
          previews={previews}
          graphDivRefs={graphDivRefs}
          disabled={!ready}
        />
        <ExportDataButton loaded={loaded} previews={previews} disabled={!ready} />
      </div>
    </div>
  );
}
