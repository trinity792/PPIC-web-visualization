"use client";

/**
 * categoryControls.js — the row list and ranking controls shared by the
 * Geographic Level and Categories sections.
 *
 * Both sections manage the same three things about the values a chart draws:
 * which are selected, what order they appear in, and which are hidden. The only
 * differences are what the values *are* (places vs arbitrary categories), how
 * many rows show before "Show more", and whether rows carry a selection
 * checkbox. Everything else lives here so the two sections cannot drift.
 *
 * Exports:
 *   orderedCategories(names, savedOrder) — saved order first, then new arrivals
 *   CategoryList  — the collapsible row list
 *   RankingControls — Top/Bottom N
 *
 * Data sources:
 *   - Via props from the section that renders them
 *
 * UI Kit reference:
 *   - Implements the draggable list-row, switch, and radio-group patterns
 */

/* eslint-disable react/prop-types */

import React, { useState } from "react";

import { GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * The saved arrangement first (dropping values that no longer exist), then any
 * value the saved order has not seen yet, in source order. A reordering that
 * predates a data refresh therefore still applies to the values it named.
 */
export function orderedCategories(names, savedOrder) {
  const available = new Set(names);
  const ordered = (savedOrder || []).filter((name) => available.has(name));
  const seen = new Set(ordered);
  return [...ordered, ...names.filter((name) => !seen.has(name))];
}

// ── Row list ─────────────────────────────────────────────────────────

/**
 * A collapsible list of value rows.
 *
 * Props:
 *   names        {Array<string>}  — every value, already in display order
 *   collapsed    {number}         — how many rows show before "Show more"
 *   selectable   {boolean}        — render a selection checkbox per row
 *   selected     {Array<string>}  — currently selected values (selectable only)
 *   onSelect     {Function}       — (name, checked) => void
 *   reorderable  {boolean}        — render a drag handle and a visibility switch
 *   hidden       {Array<string>}  — values currently hidden from the chart
 *   onReorder    {Function}       — (nextOrder) => void
 *   onVisibility {Function}       — (nextHiddenList) => void
 */
export function CategoryList({
  names,
  collapsed = 7,
  selectable = false,
  selected = [],
  onSelect,
  reorderable = false,
  hidden = [],
  onReorder,
  onVisibility,
}) {
  const [expanded, setExpanded] = useState(false);
  const [dragged, setDragged] = useState(null);
  const visible = expanded ? names : names.slice(0, collapsed);
  const hiddenSet = new Set(hidden);
  const selectedSet = new Set(selected);
  const remaining = names.length - collapsed;

  // Reordering always works on the whole list, never the visible slice, so
  // collapsing the list cannot silently change what a drag means.
  function move(source, targetIndex) {
    const sourceIndex = names.indexOf(source);
    if (sourceIndex === -1 || sourceIndex === targetIndex) return;
    const next = [...names];
    next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, source);
    onReorder?.(next);
  }

  function drop(event, target) {
    event.preventDefault();
    const source = dragged || event.dataTransfer?.getData("text/plain");
    if (source) move(source, names.indexOf(target));
    setDragged(null);
  }

  function toggleVisibility(name, shown) {
    const next = new Set(hiddenSet);
    if (shown) next.delete(name);
    else next.add(name);
    onVisibility?.([...next]);
  }

  return (
    <div className="grid gap-2">
      <div className="grid gap-1.5">
        {visible.map((name) => {
          const index = names.indexOf(name);
          return (
            <div
              key={name}
              draggable={reorderable}
              onDragStart={(event) => {
                if (!reorderable) return;
                setDragged(name);
                event.dataTransfer?.setData("text/plain", name);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDragged(null)}
              onDragOver={(event) => reorderable && event.preventDefault()}
              onDrop={(event) => reorderable && drop(event, name)}
              className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5"
            >
              {reorderable ? (
                <button
                  type="button"
                  aria-label={`Drag to reorder ${name}. Use arrow keys to move it.`}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp" && index > 0) {
                      event.preventDefault();
                      move(name, index - 1);
                    }
                    if (event.key === "ArrowDown" && index < names.length - 1) {
                      event.preventDefault();
                      move(name, index + 1);
                    }
                  }}
                  className="cursor-grab text-muted-foreground active:cursor-grabbing"
                >
                  <GripVertical aria-hidden="true" className="size-4" />
                </button>
              ) : null}

              {selectable ? (
                <Checkbox
                  aria-label={`Select ${name}`}
                  checked={selectedSet.has(name)}
                  onCheckedChange={(checked) => onSelect?.(name, checked === true)}
                />
              ) : null}

              <span className="min-w-0 flex-1 truncate text-sm">{name}</span>

              {reorderable ? (
                <Switch
                  aria-label={`Show ${name}`}
                  checked={!hiddenSet.has(name)}
                  onCheckedChange={(checked) => toggleVisibility(name, checked)}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {remaining > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((current) => !current)}
          className="h-7 justify-self-start px-2 text-xs"
        >
          {expanded ? "Show less" : `Show more (${remaining})`}
        </Button>
      ) : null}
    </div>
  );
}

// ── Ranking ──────────────────────────────────────────────────────────

/**
 * Top/Bottom N. Changing either control re-issues the whole ranking, because
 * SET_RANKING also discards a manual arrangement that referred to a different
 * candidate set.
 *
 * Props:
 *   topN     {number}
 *   sort     {string}   — "ascending" means Bottom N; anything else is Top N
 *   idPrefix {string}   — keeps ids unique when two sections mount at once
 *   onChange {Function} — ({ topN, sort }) => void
 */
export function RankingControls({ topN = 20, sort = "value", idPrefix = "ranking", onChange }) {
  const direction = sort === "ascending" ? "bottom" : "top";

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-3">
      <span className="text-sm font-medium">Ranked values</span>
      <RadioGroup
        value={direction}
        onValueChange={(value) =>
          onChange?.({ topN, sort: value === "bottom" ? "ascending" : "value" })
        }
        className="flex items-center gap-4"
      >
        {/* aria-label rather than a wrapping <label>: RadioGroupItem renders a
            button, which does not take its name from an enclosing label. */}
        <div className="flex items-center gap-2">
          <RadioGroupItem value="top" id={`${idPrefix}-top`} aria-label="Top values" />
          <Label htmlFor={`${idPrefix}-top`} className="text-sm font-normal">
            Top values
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem
            value="bottom"
            id={`${idPrefix}-bottom`}
            aria-label="Bottom values"
          />
          <Label htmlFor={`${idPrefix}-bottom`} className="text-sm font-normal">
            Bottom values
          </Label>
        </div>
      </RadioGroup>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-count`}>Number of values</Label>
        <Input
          id={`${idPrefix}-count`}
          type="number"
          inputMode="numeric"
          min={1}
          value={topN}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isFinite(next)) return;
            onChange?.({ topN: Math.max(1, Math.trunc(next)), sort });
          }}
        />
      </div>
    </div>
  );
}
