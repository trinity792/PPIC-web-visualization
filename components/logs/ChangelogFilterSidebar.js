/**
 * ChangelogFilterSidebar.js — area, intensity, audited, and date filters for the
 * Changelog tab of the /logs page.
 *
 * The changelog variant of LogFilterSidebar: same "FILTER BY" aside with a Clear
 * action and stacked Select dropdowns, but with Area / Intensity / Manually
 * Audited selects (no technical toggle). Option lists arrive as props so they stay
 * derived from the changelog records.
 *
 * Props:
 *   areas       {string[]}   — ["All areas", ...] from getChangelogAreas()
 *   area        {string}     — selected area
 *   onArea      {(a) => void}
 *   intensities {string[]}   — ["All intensities", ...] from getChangelogIntensities()
 *   intensity   {string}     — selected intensity
 *   onIntensity {(i) => void}
 *   audited     {"all"|"audited"|"unaudited"}
 *   onAudited   {(v) => void}
 *   dateFrom / dateTo     {string}      — "YYYY-MM-DD" bounds ("" = unset)
 *   onDateFrom / onDateTo {(v) => void}
 *   intensityLabel {(value) => string}  — friendly label for an intensity option
 *   onClear     {() => void}
 *
 * UI Kit reference:
 *   - Reuses the shared "Select" pattern (matching LogFilterSidebar).
 */

/* eslint-disable react/prop-types */

import React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AUDITED_LABELS = {
  all: "All entries",
  audited: "Manually audited",
  unaudited: "Not yet audited",
};

export function ChangelogFilterSidebar({
  areas,
  area,
  onArea,
  intensities,
  intensity,
  onIntensity,
  audited,
  onAudited,
  dateFrom,
  onDateFrom,
  dateTo,
  onDateTo,
  intensityLabel,
  onClear,
}) {
  const isDirty =
    (areas.length && area !== areas[0]) ||
    (intensities.length && intensity !== intensities[0]) ||
    audited !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  return (
    <aside className="w-full shrink-0 md:w-56" style={{ fontFamily: "var(--font-sans)" }}>
      <div className="mb-4 flex items-center justify-between">
        <span style={{ color: "var(--ppic-neutral-400)", fontSize: 12, letterSpacing: "0.08em" }}>
          FILTER BY
        </span>
        {isDirty ? (
          <button type="button" onClick={onClear} style={{ color: "var(--ppic-brand)", fontSize: 12 }}>
            Clear
          </button>
        ) : null}
      </div>

      {/* Area dropdown */}
      <div className="mb-6">
        <Select value={area} onValueChange={onArea}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="All areas" />
          </SelectTrigger>
          <SelectContent>
            {areas.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Intensity dropdown */}
      <div className="mb-6">
        <Select value={intensity} onValueChange={onIntensity}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="All intensities" />
          </SelectTrigger>
          <SelectContent>
            {intensities.map((i) => (
              <SelectItem key={i} value={i}>
                {intensityLabel(i)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Manually audited dropdown */}
      <div className="mb-6">
        <div className="mb-3" style={{ color: "var(--ppic-neutral-600)", fontSize: 14 }}>
          Audit status
        </div>
        <Select value={audited} onValueChange={onAudited}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(AUDITED_LABELS).map((k) => (
              <SelectItem key={k} value={k}>
                {AUDITED_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date range */}
      <div>
        <div className="mb-3" style={{ color: "var(--ppic-neutral-600)", fontSize: 14 }}>
          Date range
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1" style={{ color: "var(--ppic-neutral-500)", fontSize: 13 }}>
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFrom(e.target.value)}
              className="h-10 rounded-lg border border-ppic-border bg-ppic-card px-2.5 text-sm text-ppic-neutral-600"
            />
          </label>
          <label className="flex flex-col gap-1" style={{ color: "var(--ppic-neutral-500)", fontSize: 13 }}>
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateTo(e.target.value)}
              className="h-10 rounded-lg border border-ppic-border bg-ppic-card px-2.5 text-sm text-ppic-neutral-600"
            />
          </label>
        </div>
      </div>
    </aside>
  );
}
