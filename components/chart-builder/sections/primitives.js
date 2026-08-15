"use client";

/**
 * primitives.js — shared layout primitives for the graph-editor sidebar sections.
 *
 * Extracted verbatim from ChartSidebar.js so each section can live in its own
 * file without duplicating the heading rule, card chrome, accordion wrapper, or
 * the boxed single-select list.
 *
 * Props:
 *   SectionHeading  as {string} — element to render (default "h3"; pass "span"
 *                                 inside an accordion trigger, which already
 *                                 supplies its own heading element)
 *   SectionHeading  children, className
 *   SectionCard     children, className
 *   Section         value {string}, label {string}, children — one accordion item
 *   OptionList      value, onChange, options [{value,label}], ariaLabel
 *
 * Data sources:
 *   - Via props from the section that renders them
 *
 * UI Kit reference:
 *   - Implements the "Editor Sidebar" section heading, card, and single-select
 *     list patterns
 */

import React from "react";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/components/ui/utils";

// ── Heading and card ─────────────────────────────────────────────────

export function SectionHeading({ children, className, as: Tag = "h3" }) {
  return (
    <Tag
      className={cn(
        "relative m-0 inline-block font-heading text-base font-semibold",
        className,
      )}
    >
      {children}
      {/* Short brand rule under the label; decorative, so it stays out of the
          accessible name. */}
      <span
        aria-hidden="true"
        className="absolute -bottom-1 left-0 h-0.5 w-8 rounded-full bg-ppic-brand"
      />
    </Tag>
  );
}

export function SectionCard({ children, className, ...props }) {
  return (
    <div
      className={cn("rounded-xl border bg-card p-3 shadow-xs", className)}
      {...props}
    >
      {children}
    </div>
  );
}

// ── Accordion section wrapper ────────────────────────────────────────

export function Section({ value, label, children }) {
  return (
    <AccordionItem value={value} className="border-b-0">
      {/* Only the chevron collapses the section. The trigger still spans the
          row — it is what carries the label and the section's accessible name,
          and moving the label out would leave a nameless button and a second
          heading per section — but the button itself is hit-tested away, so a
          click on the label, or on the gap beside it, lands on nothing instead
          of closing the section the reader was reaching into. The chevron opts
          back in: clicks on it bubble up to the button, which is what toggles.
          Keyboard use is untouched, since pointer-events governs the mouse
          only, and the button is still focusable and still fires on Enter.
          The chevron is padded out to a 24px box so the smaller target stays
          comfortably clickable. */}
      <AccordionTrigger
        className={cn(
          "pointer-events-none items-center py-3 hover:no-underline",
          "[&>svg]:pointer-events-auto [&>svg]:size-6 [&>svg]:translate-y-0 [&>svg]:cursor-pointer [&>svg]:rounded-md [&>svg]:p-0.5 [&>svg]:hover:bg-muted [&>svg]:hover:text-foreground",
        )}
      >
        {/* Radix already wraps the trigger in a heading element, so the label
            renders as a span rather than nesting one heading inside another. */}
        <SectionHeading as="span">{label}</SectionHeading>
      </AccordionTrigger>
      <AccordionContent className="pb-4">{children}</AccordionContent>
    </AccordionItem>
  );
}

// ── Boxed single-select list ─────────────────────────────────────────

/**
 * An inline selectable list (the boxed "highlight the chosen row" look from the
 * editor mockups' Graph Type / Preset sections).
 */
export function OptionList({ value, onChange, options, ariaLabel }) {
  return (
    <SectionCard
      className="grid gap-1 p-1.5"
      role="listbox"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg px-3 py-2 text-left text-sm transition-colors",
              selected
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </SectionCard>
  );
}
