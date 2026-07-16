"use client";

/**
 * GraphTabs.js — general single-select "visualize by group" control (pill buttons).
 *
 * A reusable, chart-agnostic group/facet selector, extracted from the RHNA
 * dashboard's income-level toggle (`components/landing/RegionalOnTrackBars.js`).
 * Renders one pill button per group and is intended to be wired into the module
 * graph editors and the standalone Visualization Tool as the common facet
 * selector — so those graphs get one control, not several.
 *
 * Controlled or uncontrolled, and always keeps exactly one option selected
 * (re-clicking the active button is a no-op, never a deselect).
 *
 * Props:
 *   options       {Array<string | {value, label?, disabled?}>} — the selectable groups
 *   value         {string}   — controlled active value (omit for uncontrolled)
 *   defaultValue  {string}   — uncontrolled initial value (defaults to the first option)
 *   onValueChange {Function} — called with the newly selected value
 *   label         {string}   — optional leading label (also the group's accessible name)
 *   ariaLabel     {string}   — accessible name when no visible label is given
 *   className     {string}   — classes for the outer wrapper
 *   tabsClassName {string}   — classes for the button row
 *
 * Data sources:
 *   - Selection state via props from the consuming chart/dashboard
 *
 * UI Kit reference:
 *   - Segmented pill selector (the landing dashboards' group toggle)
 */

/* eslint-disable react/prop-types */

import React, { useCallback, useId, useState } from "react";

import { cn } from "@/components/ui/utils";

function normalizeOptions(options) {
  return options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : { label: option.value, ...option },
  );
}

export default function GraphTabs({
  options = [],
  value,
  defaultValue,
  onValueChange,
  label = null,
  ariaLabel,
  className,
  tabsClassName,
}) {
  const normalized = normalizeOptions(options);
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(
    defaultValue ?? (normalized[0] ? normalized[0].value : undefined),
  );
  const active = isControlled ? value : internal;
  const labelId = useId();

  const handleSelect = useCallback(
    (next) => {
      // Keep one option always selected — re-clicking the active button is a no-op.
      if (next === active) return;
      if (!isControlled) setInternal(next);
      onValueChange?.(next);
    },
    [active, isControlled, onValueChange],
  );

  if (!normalized.length) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {label ? (
        <span id={labelId} className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      ) : null}
      <div
        role="group"
        aria-label={label ? undefined : ariaLabel || "Chart groups"}
        aria-labelledby={label ? labelId : undefined}
        className={cn("flex flex-wrap gap-1", tabsClassName)}
      >
        {normalized.map((option) => {
          const selected = option.value === active;
          return (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              aria-pressed={selected}
              onClick={() => handleSelect(option.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                selected
                  ? "bg-ppic-blue-300 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
