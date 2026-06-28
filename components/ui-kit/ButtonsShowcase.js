/* eslint-disable react/prop-types */
import React from "react";
import { ArrowRight } from "lucide-react";
import { Section, Panel, Caption } from "./Section";

function PillButton({ children, variant = "primary", size = "md" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full border transition-colors disabled:opacity-50";
  const sizing = size === "sm" ? "px-4 py-1 text-[13px]" : "px-7 py-2.5 text-[15px]";

  const styles = {
    primary: {
      backgroundColor: "var(--ppic-orange-100)",
      borderColor: "#000",
      color: "#0d0d0d",
    },
    outline: {
      backgroundColor: "transparent",
      borderColor: "var(--ppic-orange-300)",
      color: "var(--ppic-orange-300)",
    },
    ghost: {
      backgroundColor: "transparent",
      borderColor: "transparent",
      color: "var(--ppic-orange-300)",
    },
    "see-more": {
      backgroundColor: "var(--ppic-blue-50)",
      borderColor: "#000",
      color: "#0d0d0d",
    },
  };

  return (
    <button
      className={`${base} ${sizing} hover:brightness-95`}
      style={{ fontFamily: "var(--font-heading)", ...styles[variant] }}
    >
      {children}
    </button>
  );
}

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
              className="inline-flex items-center justify-center rounded-full px-5 py-2 text-[14px] text-white hover:brightness-95"
              style={{ backgroundColor: "var(--ppic-blue-400)", fontFamily: "var(--font-heading)" }}
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
