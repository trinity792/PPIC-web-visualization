/**
 * DocumentFilterSidebar.js — topic + content-type filters for the Documents page.
 *
 * Ported from the Figma reference "filter-sidebar.tsx", but reuses the shared
 * Select (topic dropdown) and Checkbox (content-type toggles) primitives, and
 * takes its option lists as props so they stay derived from the docs frontmatter.
 *
 * Props:
 *   topics        {string[]}                 — ["All topics", ...] from getTopics()
 *   topic         {string}                   — selected topic
 *   onTopic       {(t: string) => void}
 *   contentTypes  {string[]}                 — from getContentTypes()
 *   selectedTypes {string[]}                 — currently checked types
 *   onToggleType  {(t: string) => void}
 *   onClear       {() => void}
 *
 * Data sources:
 *   - Via props from DocumentsBrowser
 *
 * UI Kit reference:
 *   - Reuses the shared "Select" and "Checkbox" patterns
 */

/* eslint-disable react/prop-types */

import React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DocumentFilterSidebar({
  topics,
  topic,
  onTopic,
  contentTypes,
  selectedTypes,
  onToggleType,
  onClear,
}) {
  const isDirty = selectedTypes.length > 0 || (topics.length && topic !== topics[0]);

  return (
    <aside className="w-full shrink-0 md:w-56" style={{ fontFamily: "var(--font-sans)" }}>
      <div className="mb-4 flex items-center justify-between">
        <span
          style={{
            color: "var(--ppic-neutral-400)",
            fontSize: 12,
            letterSpacing: "0.08em",
          }}
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

      {/* Topic dropdown */}
      <div className="mb-6">
        <Select value={topic} onValueChange={onTopic}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="All topics" />
          </SelectTrigger>
          <SelectContent>
            {topics.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content types */}
      <div>
        <div className="mb-3" style={{ color: "var(--ppic-neutral-600)", fontSize: 14 }}>
          Content Types
        </div>
        <div className="flex flex-col gap-1">
          {contentTypes.map((t) => {
            const active = selectedTypes.includes(t);
            const id = `doc-type-${t.replace(/\s+/g, "-")}`;
            return (
              <label
                key={t}
                htmlFor={id}
                className="flex cursor-pointer items-center gap-2.5 py-1.5"
              >
                <Checkbox
                  id={id}
                  checked={active}
                  onCheckedChange={() => onToggleType(t)}
                />
                <span
                  className="capitalize"
                  style={{ color: "var(--ppic-neutral-500)", fontSize: 14 }}
                >
                  {t}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
