"use client";

/**
 * ChartContainerFooter.js — the chart card's action bar.
 *
 * A segmented View Chart / View Data toggle on the left, with topic
 * documentation and the two export dropdowns on the right. Both exports are
 * told whether the preview is `ready`, but they act on it differently: Export
 * Chart has nothing to write without a rendered figure and greys out, while
 * Export Data stays open, because the module's entire cleaned dataset does not
 * depend on the chart being built. Only its "as displayed" items wait for
 * `ready`.
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
 *   documentationHref {string|null}   — internal documentation route for the topic
 *
 * Data sources:
 *   - Via props from ChartContainer
 *
 * UI Kit reference:
 *   - Implements the segmented pill toggle and the brand action-button pair
 */

import React from "react";
import Link from "next/link";

import { BookOpen } from "lucide-react";

import {
  ExportChartButton,
  ExportDataButton,
} from "@/components/chart-builder/ExportMenu";
import { Button } from "@/components/ui/button";
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
  documentationHref = null,
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
        {documentationHref ? (
          <Button variant="outline" size="sm" asChild>
            <Link
              href={documentationHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              <BookOpen aria-hidden="true" />
              View documentation
            </Link>
          </Button>
        ) : null}
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
