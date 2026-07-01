/**
 * ButtonsShowcase.js — button variants and sizes used across PPIC dashboards.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Static UI Kit examples defined in this file
 *
 * UI Kit reference:
 *   - Documents the "Pill Button" and "Data Action" patterns
 */

/* eslint-disable react/prop-types */

import React from "react";

import { ArrowRight } from "lucide-react";

import { Caption, Panel, Section } from "@/components/ui-kit/Section";

const BUTTON_VARIANTS = {
  primary: "border-black bg-ppic-orange-100 text-ppic-neutral-600",
  outline: "border-ppic-brand bg-transparent text-ppic-brand",
  ghost: "border-transparent bg-transparent text-ppic-brand",
  "see-more": "border-black bg-ppic-blue-50 text-ppic-neutral-600",
};

export function ButtonsShowcase() {
  return (
    <Section
      id="buttons"
      eyebrow="Components"
      title="Buttons"
      description="Fully rounded pills with a thin outline are the PPIC signature. The soft-orange fill drives primary actions; the light-blue 'See More' pill links out of dashboard cards."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <div className="flex flex-wrap items-center gap-4">
            <PillButton variant="primary">Save View</PillButton>
            <PillButton variant="primary">Reset View</PillButton>
            <PillButton variant="outline">Restore View</PillButton>
            <PillButton variant="ghost">Cancel</PillButton>
          </div>
          <Caption>Primary · Outline · Ghost</Caption>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-center gap-4">
            <PillButton variant="see-more" size="sm">
              See More <ArrowRight className="size-3.5" />
            </PillButton>
            <PillButton variant="primary" size="sm">
              Apply
            </PillButton>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full bg-ppic-blue-400 px-5 py-2 font-heading text-sm text-white hover:brightness-95"
            >
              Export Data
            </button>
          </div>
          <Caption>Card link · Compact · Data action</Caption>
        </Panel>
      </div>
    </Section>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function PillButton({ children, variant = "primary", size = "md" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full border font-heading transition-colors hover:brightness-95 disabled:opacity-50";
  const sizing = size === "sm" ? "px-4 py-1 text-[13px]" : "px-7 py-2.5 text-[15px]";

  return (
    <button type="button" className={`${base} ${sizing} ${BUTTON_VARIANTS[variant]}`}>
      {children}
    </button>
  );
}
