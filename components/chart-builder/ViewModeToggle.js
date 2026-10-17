"use client";

/**
 * ViewModeToggle.js — the segmented pill that switches a chart card between
 * its views: View Chart / View Data on a topic chart (ChartContainerFooter),
 * View Chart / Edit Data in the Visualization Tool's Edit step.
 *
 * Props:
 *   modes     {Array<{id, label}>} — the views, left to right
 *   value     {string}             — the active view's id
 *   onChange  {(id) => void}
 *   label     {string}             — the group's accessible name
 *
 * UI Kit reference:
 *   - Segmented control: muted track, the active segment in PPIC orange
 */

import React from "react";

import { cn } from "@/components/ui/utils";

export default function ViewModeToggle({ modes, value, onChange, label = "Chart or data view" }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-muted p-1"
    >
      {modes.map((mode) => {
        const active = value === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange?.(mode.id)}
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
  );
}
