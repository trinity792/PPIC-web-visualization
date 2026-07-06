"use client";

/**
 * SeverityChip.js — colored-dot status chip for a run's severity.
 *
 * Generalizes the inline status-chip markup used in DocumentCard and the design
 * system's PatternsShowcase (a rounded pill with a small colored dot).
 *
 * Props:
 *   severity {"success"|"recovered"|"error"}
 */

/* eslint-disable react/prop-types */

import React from "react";

import { severityMeta } from "@/lib/logs/presentation";

export default function SeverityChip({ severity }) {
  const meta = severityMeta(severity);
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-ppic-neutral-50 px-3 py-1 text-xs whitespace-nowrap text-ppic-neutral-600">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: meta.color }}
        aria-hidden="true"
      />
      {meta.label}
    </span>
  );
}
