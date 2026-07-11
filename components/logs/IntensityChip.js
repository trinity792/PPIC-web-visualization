"use client";

/**
 * IntensityChip.js — colored-dot chip for a changelog entry's impact intensity.
 *
 * The changelog counterpart to SeverityChip: a rounded pill with a small colored
 * dot whose color/label come from intensityMeta() (low / moderate / high).
 *
 * Props:
 *   intensity {"low"|"moderate"|"high"}
 *
 * UI Kit reference:
 *   - Reuses the shared "Status Chip" pill pattern (see SeverityChip).
 */

/* eslint-disable react/prop-types */

import React from "react";

import { intensityMeta } from "@/lib/changelog/presentation";

export default function IntensityChip({ intensity }) {
  const meta = intensityMeta(intensity);
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-ppic-neutral-50 px-3 py-1 text-xs whitespace-nowrap text-ppic-neutral-600">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: meta.color }}
        aria-hidden="true"
      />
      {meta.label} impact
    </span>
  );
}
