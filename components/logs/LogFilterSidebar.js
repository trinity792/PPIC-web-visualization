/**
 * LogFilterSidebar.js — module, type, and date filters for the /logs page.
 *
 * Mirrors DocumentFilterSidebar's layout (a "FILTER BY" aside with a Clear
 * action and stacked Select dropdowns) so the logs page matches the documents
 * page. Option lists arrive as props so they stay derived from the run records.
 *
 * Props:
 *   modules    {string[]}   — ["All modules", ...] from getLogModules()
 *   module     {string}     — selected module
 *   onModule   {(m) => void}
 *   severities {string[]}   — ["All severities", ...] from getLogSeverities()
 *   severity   {string}     — selected severity
 *   onSeverity {(s) => void}
 *   dateFrom / dateTo   {string}      — "YYYY-MM-DD" bounds ("" = unset)
 *   onDateFrom / onDateTo {(v) => void}
 *   severityLabel {(value) => string} — friendly label for a severity option
 *   technical   {boolean}    — whether technical (raw record) view is on
 *   onTechnical {(v) => void}
 *   onClear     {() => void}
 *
 * UI Kit reference:
 *   - Reuses the shared "Select" pattern (matching DocumentFilterSidebar) and the
 *     labeled "Switch" from the UI Kit's Form & Controls "Appearance" toggles.
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
import { Switch } from "@/components/ui/switch";

export function LogFilterSidebar({
  modules,
  module,
  onModule,
  severities,
  severity,
  onSeverity,
  dateFrom,
  onDateFrom,
  dateTo,
  onDateTo,
  severityLabel,
  technical,
  onTechnical,
  onClear,
}) {
  const isDirty =
    (modules.length && module !== modules[0]) ||
    (severities.length && severity !== severities[0]) ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  return (
    <aside className="w-full shrink-0 md:w-56" style={{ fontFamily: "var(--font-sans)" }}>
      <div className="mb-4 flex items-center justify-between">
        <span
          style={{ color: "var(--ppic-neutral-400)", fontSize: 12, letterSpacing: "0.08em" }}
        >
          FILTER BY
        </span>
        {isDirty ? (
          <button
            type="button"
            onClick={onClear}
            style={{ color: "var(--ppic-brand)", fontSize: 12 }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* Module dropdown */}
      <div className="mb-6">
        <Select value={module} onValueChange={onModule}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="All modules" />
          </SelectTrigger>
          <SelectContent>
            {modules.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Type (severity) dropdown */}
      <div className="mb-6">
        <Select value={severity} onValueChange={onSeverity}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            {severities.map((s) => (
              <SelectItem key={s} value={s}>
                {severityLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date range */}
      <div className="mb-6">
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

      {/* Display — technical view toggle (UI Kit "Appearance" switch pattern) */}
      <div>
        <div className="mb-3" style={{ color: "var(--ppic-neutral-600)", fontSize: 14 }}>
          Display
        </div>
        <label
          htmlFor="log-technical-toggle"
          className="flex cursor-pointer items-center justify-between"
          style={{ color: "var(--ppic-neutral-500)", fontSize: 14 }}
        >
          Technical details
          <Switch
            id="log-technical-toggle"
            checked={technical}
            onCheckedChange={onTechnical}
            aria-label="Technical details"
            className="data-[state=checked]:bg-ppic-brand"
          />
        </label>
      </div>
    </aside>
  );
}
