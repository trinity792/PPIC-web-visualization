"use client";

/**
 * StepNav.js — the wizard's horizontal chevron stepper (Import → Chart Type →
 * Edit → Export). Driven entirely by the `steps` prop, so the module editor's
 * three-step flow is produced simply by passing the list without "import".
 *
 * Props:
 *   steps       {Array<{id,label}>} — ordered steps to render, left to right
 *   currentId   {string}            — id of the active step
 *   onSelect    {(id) => void}      — navigate to a step
 *   isEnabled   {(id) => boolean}   — whether a step can be jumped to (gating)
 *
 * UI Kit reference:
 *   - Chevron "process" bar; active segment in PPIC slate-blue, others muted.
 */

/* eslint-disable react/prop-types */

import React from "react";

import { cn } from "@/components/ui/utils";

// Right-pointing arrow segments. The first segment has a flat left edge; the
// rest carry a left notch that receives the previous segment's point.
const ARROW = "polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%, 16px 50%)";
const ARROW_FIRST = "polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)";

export default function StepNav({ steps, currentId, onSelect, isEnabled }) {
  return (
    <nav aria-label="Visualization steps" className="w-full">
      <ol className="flex w-full items-stretch gap-1">
        {steps.map((step, index) => {
          const active = step.id === currentId;
          const enabled = active || (isEnabled ? isEnabled(step.id) : true);
          return (
            <li key={step.id} className="min-w-0 flex-1">
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                disabled={!enabled}
                onClick={() => enabled && onSelect(step.id)}
                style={{ clipPath: index === 0 ? ARROW_FIRST : ARROW }}
                className={cn(
                  "flex h-9 w-full items-center justify-center px-4 text-center font-heading text-sm font-semibold transition-colors",
                  index === 0 ? "pl-3" : "pl-6",
                  active
                    ? "bg-ppic-navy-blue-100 text-white"
                    : "bg-muted text-foreground",
                  enabled && !active ? "hover:bg-muted/70 cursor-pointer" : "",
                  !enabled ? "cursor-not-allowed opacity-60" : "",
                )}
              >
                <span className="truncate">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
