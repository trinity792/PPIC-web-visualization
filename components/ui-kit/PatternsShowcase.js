/* eslint-disable react/prop-types */
import React from "react";
import { Section } from "./Section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

function MiniLabel({ children }) {
  return (
    <span className="text-[14px] text-neutral-700" style={{ fontFamily: "var(--font-sans)" }}>
      {children}
    </span>
  );
}

export function PatternsShowcase() {
  return (
    <Section
      id="patterns"
      eyebrow="Patterns"
      title="Editor Sidebar & Tags"
      description="The graph editor stacks collapsible control groups in a left rail. Tags and status chips reuse the brand and data palettes for at-a-glance categorization."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* Sidebar editor */}
        <div
          className="rounded-2xl border bg-white p-5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)]"
          style={{ borderColor: "var(--ppic-border)" }}
        >
          <h3
            className="mb-1 text-neutral-900"
            style={{ fontFamily: "var(--font-heading)", fontSize: 24, letterSpacing: "0.06em" }}
          >
            Housing Module
          </h3>
          <div className="mb-4 h-0.75 w-10 rounded-full" style={{ backgroundColor: "var(--ppic-orange-300)" }} />

          <Accordion type="multiple" defaultValue={["sources", "preset"]}>
            <AccordionItem value="sources">
              <AccordionTrigger style={{ fontFamily: "var(--font-heading)" }}>Data Sources</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pt-1">
                  <MiniLabel>Census</MiniLabel>
                  <br />
                  <MiniLabel>Dept. of Finance</MiniLabel>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="preset">
              <AccordionTrigger style={{ fontFamily: "var(--font-heading)" }}>Preset</AccordionTrigger>
              <AccordionContent>
                <MiniLabel>Trends over time</MiniLabel>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="encodings">
              <AccordionTrigger style={{ fontFamily: "var(--font-heading)" }}>Encodings</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pt-1">
                  <MiniLabel>X Axis: Year</MiniLabel>
                  <br />
                  <MiniLabel>Y Axis: Total Population</MiniLabel>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="labels">
              <AccordionTrigger style={{ fontFamily: "var(--font-heading)" }}>Labels</AccordionTrigger>
              <AccordionContent>
                <MiniLabel>Title, legend & footnote</MiniLabel>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="mt-5 flex flex-wrap gap-2">
            {["Reset View", "Save View", "Restore View"].map((b) => (
              <button
                key={b}
                className="rounded-full border px-4 py-1.5 text-[13px] hover:brightness-95"
                style={{
                  backgroundColor: "var(--ppic-orange-100)",
                  borderColor: "#000",
                  color: "#0d0d0d",
                  fontFamily: "var(--font-heading)",
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Tags & chips */}
        <div
          className="rounded-2xl border bg-white p-6 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)]"
          style={{ borderColor: "var(--ppic-border)" }}
        >
          <p className="mb-3 text-[13px] uppercase tracking-[0.16em] text-neutral-700" style={{ fontFamily: "var(--font-sans)" }}>
            Tags
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge style={{ backgroundColor: "var(--ppic-orange-300)", color: "#fff" }}>Housing</Badge>
            <Badge style={{ backgroundColor: "var(--ppic-blue-400)", color: "#fff" }}>Population</Badge>
            <Badge style={{ backgroundColor: "var(--ppic-blue-50)", color: "#0d0d0d" }}>Bay Area</Badge>
            <Badge variant="outline" style={{ borderColor: "var(--ppic-orange-300)", color: "var(--ppic-orange-300)" }}>
              2013–2026
            </Badge>
            <Badge style={{ backgroundColor: "var(--ppic-neutral-100)", color: "#191b1c" }}>Statewide</Badge>
          </div>

          <p className="mb-3 mt-7 text-[13px] uppercase tracking-[0.16em] text-neutral-700" style={{ fontFamily: "var(--font-sans)" }}>
            Status chips
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              ["Published", "#084D7C"],
              ["Draft", "#9BA3A8"],
              ["Updated", "#E36A18"],
            ].map(([label, color]) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px]"
                style={{ backgroundColor: "var(--ppic-neutral-50)", fontFamily: "var(--font-sans)" }}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
