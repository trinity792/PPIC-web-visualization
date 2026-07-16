/**
 * RegionalOnTrackBars.js — diverging bar chart of median On Track Score by region.
 *
 * A jurisdiction's On Track Score is pace-adjusted progress (1.0 = on pace to
 * meet its allocation). This shows each region's median across its jurisdictions,
 * diverging from a 1.0 center line so a viewer sees at a glance where jurisdictions
 * are keeping pace (right of center) versus falling behind (left). An income-level
 * toggle re-reads the precomputed per-level data client-side (no refetch), so the
 * Very Low / Low tiers where jurisdictions most often fall short are one click away.
 *
 * Props:
 *   levels  {string[]}                        — income-level order for the toggle
 *   byLevel {Object<string, Array<{region,value,count}>>} — per-level region medians
 *
 * Data sources:
 *   - Via props from queryRegionalOnTrack() in lib/data/rhna_progress.js
 *
 * UI Kit reference:
 *   - Composes the "Chart Container" card with a segmented control
 */

"use client";

/* eslint-disable react/prop-types */

import React, { useState } from "react";

import GraphTabs from "@/components/charts/GraphTabs";

// Diverging scale domain; the 1.0 center maps to 50%.
const DOMAIN_MAX = 2;
const CENTER_PERCENT = (1 / DOMAIN_MAX) * 100;

// Status buckets → PPIC palette tokens (globals.css), matching the four-quadrant rule.
function bucketColor(value) {
  if (value == null) return "var(--ppic-navy-blue-50)";
  if (value >= 1.0) return "var(--ppic-blue-300)";
  if (value >= 0.7) return "var(--ppic-teal-500)";
  if (value >= 0.5) return "var(--ppic-orange-100)";
  return "var(--ppic-orange-300)";
}

function positionPercent(value) {
  const clamped = Math.max(0, Math.min(DOMAIN_MAX, value));
  return (clamped / DOMAIN_MAX) * 100;
}

export default function RegionalOnTrackBars({ levels = [], byLevel = {} }) {
  const [level, setLevel] = useState(levels.includes("Total") ? "Total" : levels[0]);
  const rows = byLevel[level] || [];

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <p className="font-medium">Median on-track score by region</p>
        <p className="text-xs text-muted-foreground">
          Pace-adjusted progress toward the allocation; 1.0 = on pace. Latest snapshot, current cycle.
        </p>
      </div>

      <div className="px-4 pt-3">
        <GraphTabs
          options={levels}
          value={level}
          onValueChange={setLevel}
          label="Income level"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data for this income level.</p>
        ) : (
          rows.map((row) => {
            const value = row.value;
            const pos = value == null ? CENTER_PERCENT : positionPercent(value);
            const left = Math.min(pos, CENTER_PERCENT);
            const width = Math.abs(pos - CENTER_PERCENT);
            return (
              <div key={row.region} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2">
                <span className="truncate text-xs" title={row.region}>
                  {row.region}
                </span>
                <div className="relative h-5 rounded bg-muted/50">
                  {/* 1.0 center reference line */}
                  <div
                    className="absolute top-0 h-full w-px bg-foreground/40"
                    style={{ left: `${CENTER_PERCENT}%` }}
                  />
                  <div
                    className="absolute top-0.5 h-4 rounded-sm"
                    style={{
                      left: `${left}%`,
                      width: `${Math.max(width, 0.5)}%`,
                      backgroundColor: bucketColor(value),
                    }}
                  />
                </div>
                <span className="text-right text-xs tabular-nums text-muted-foreground">
                  {value == null ? "—" : value.toFixed(2)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t px-4 py-2 text-[0.7rem] text-muted-foreground">
        Bars left of the center line are behind pace; bars right are on or ahead of pace.
      </div>
    </div>
  );
}
