"use client";

/**
 * ChoiceList.js — a list of choices that is checkboxes when several may be picked and radio buttons when only one may.
 *
 * Owner rule (2026-11-20): a checkbox always means multi-select. A list that
 * keeps one value uses radio buttons instead, so its look matches what it does.
 * Every chooser in the editor's popovers and inline lists renders through this
 * component so the rule holds in one place.
 *
 * Props:
 *   label          {string}                      — accessible name of the whole group
 *   options        {Array<string|{value,label}>} — the choices, in display order
 *   selected       {Array<string>}               — the chosen values (one at most when single)
 *   multiple       {boolean}                     — checkboxes (true) or radio buttons (false)
 *   onToggle       {(value, checked) => void}    — multiple: a box was ticked or unticked
 *   onChoose       {(value) => void}             — single: a radio was picked
 *   itemLabel      {(option) => string}          — accessible name of one control; defaults to its label
 *   rowClassName   {string}                      — classes for each row, so callers keep their look
 *   className      {string}                      — classes for the list container
 *   renderTrailing {(value, checked) => node}    — optional content after a row's label
 *   idPrefix       {string}                      — prefix for radio ids (label/htmlFor pairing)
 *
 * Data sources:
 *   - Via props from parent
 *
 * UI Kit reference:
 *   - Implements the "Checkbox" and "Radio Group" patterns from the UI Kit Form Controls panel
 */

import React, { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/components/ui/utils";

// ── Helpers ──────────────────────────────────────────────────────────

const DEFAULT_ROW = "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent";

function normalize(option) {
  return typeof option === "object" && option !== null
    ? { value: option.value, label: option.label ?? String(option.value) }
    : { value: option, label: String(option) };
}

// ── Component ────────────────────────────────────────────────────────

export default function ChoiceList({
  label,
  options = [],
  selected = [],
  multiple = false,
  onToggle,
  onChoose,
  itemLabel,
  rowClassName = DEFAULT_ROW,
  className,
  renderTrailing,
  idPrefix,
}) {
  const generated = useId();
  const prefix = idPrefix || `choice-${generated.replace(/:/g, "")}`;
  const selectedSet = new Set(selected);
  const choices = options.map(normalize);
  const nameOf = (choice) => (itemLabel ? itemLabel(choice) : choice.label);

  if (multiple) {
    return (
      <div role="group" aria-label={label} className={className}>
        {choices.map((choice) => {
          const checked = selectedSet.has(choice.value);
          return (
            <label key={String(choice.value)} className={rowClassName}>
              <Checkbox
                aria-label={nameOf(choice)}
                checked={checked}
                onCheckedChange={(next) => onToggle?.(choice.value, next === true)}
              />
              <span className="flex-1">{choice.label}</span>
              {renderTrailing?.(choice.value, checked)}
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <RadioGroup
      aria-label={label}
      value={selected[0] == null ? "" : String(selected[0])}
      onValueChange={(value) => {
        const choice = choices.find((entry) => String(entry.value) === value);
        if (choice) onChoose?.(choice.value);
      }}
      className={cn("gap-0", className)}
    >
      {choices.map((choice, index) => {
        const id = `${prefix}-${index}`;
        const checked = selectedSet.has(choice.value);
        return (
          <div key={String(choice.value)} className={rowClassName}>
            {/* aria-label, not a wrapping <label>: RadioGroupItem renders a
                button, which takes no name from an enclosing label. */}
            <RadioGroupItem id={id} value={String(choice.value)} aria-label={nameOf(choice)} />
            <Label htmlFor={id} className="flex-1 cursor-pointer font-normal">
              {choice.label}
            </Label>
            {renderTrailing?.(choice.value, checked)}
          </div>
        );
      })}
    </RadioGroup>
  );
}
