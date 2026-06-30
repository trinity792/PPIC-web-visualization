/* eslint-disable react/prop-types */
import React from "react";
import { Download, RotateCcw, Save, Upload } from "lucide-react";
import { Section } from "./Section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/components/ui/utils";

// ---------------------------------------------------------------------------
// Editor chrome mirrored from the live chart-builder sidebar
// (components/chart-builder/ChartSidebar.js): a large section heading with a
// short brand underline, content sitting inside a rounded card, and an inline
// boxed "highlight the chosen row" option list.
// ---------------------------------------------------------------------------

function SectionHeading({ children }) {
  return (
    <span className="relative inline-block">
      <span className="font-heading text-base font-semibold">{children}</span>
      <span className="absolute -bottom-1 left-0 h-0.5 w-8 rounded-full bg-ppic-brand" />
    </span>
  );
}

function SectionCard({ children, className }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3 shadow-xs", className)}>
      {children}
    </div>
  );
}

function EditorSection({ value, label, children }) {
  return (
    <AccordionItem value={value} className="border-b-0">
      <AccordionTrigger className="py-3 hover:no-underline">
        <SectionHeading>{label}</SectionHeading>
      </AccordionTrigger>
      <AccordionContent className="pb-4">{children}</AccordionContent>
    </AccordionItem>
  );
}

// Static stand-in for the live OptionList (the boxed Region / Graph Type /
// Preset selectors). One row is flagged `selected`.
function OptionList({ options }) {
  return (
    <SectionCard className="grid gap-1 p-1.5">
      {options.map(({ label, selected }) => (
        <span
          key={label}
          className={cn(
            "rounded-lg px-3 py-2 text-left text-sm",
            selected
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          {label}
        </span>
      ))}
    </SectionCard>
  );
}

// A read-only field display matching the editor's labelled controls.
function Field({ label, children }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="rounded-md border px-3 py-1.5 text-sm">{children}</div>
    </div>
  );
}

// Footer pills, matching the live sidebar's Restore / Save / Reset / Import
// actions (rounded orange pills with a leading icon, laid out 2x2).
const FOOTER_ACTIONS = [
  { label: "Restore View", Icon: Upload },
  { label: "Save View", Icon: Save },
  { label: "Reset View", Icon: RotateCcw },
  { label: "Import / export", Icon: Download },
];

const PILL =
  "inline-flex h-8 items-center justify-center gap-2 rounded-full border border-ppic-neutral-600 bg-ppic-orange-100 px-2 text-[0.75rem] text-foreground [&_svg]:size-3";

const EDITOR_SECTIONS = [
  "data-sources",
  "presets",
  "graph-type",
  "date-range",
  "encodings",
  "comparison",
  "labels",
  "appearance",
];

export function PatternsShowcase() {
  return (
    <Section
      id="patterns"
      eyebrow="Patterns"
      title="Editor Sidebar & Tags"
      description="The graph editor stacks collapsible control groups in a left rail. Tags and status chips reuse the brand and data palettes for at-a-glance categorization."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* Sidebar editor — mirrors the live chart-builder rail */}
        <div
          className="rounded-2xl border bg-white p-5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)]"
          style={{ borderColor: "var(--ppic-border)" }}
        >
          {/* Centered module title with brand underline */}
          <div className="mb-3 text-center">
            <h3 className="inline-block border-b-2 border-ppic-brand pb-1 font-heading text-lg font-semibold text-neutral-900">
              Housing Module
            </h3>
          </div>

          <Accordion type="multiple" defaultValue={EDITOR_SECTIONS} className="grid gap-1">
            <EditorSection value="data-sources" label="Data Sources">
              <p className="text-sm font-medium">Dept. of Finance</p>
            </EditorSection>

            <EditorSection value="presets" label="Presets">
              <div className="grid gap-2">
                <OptionList
                  options={[
                    { label: "Trends over time", selected: true },
                    { label: "Compare regions" },
                    { label: "Latest snapshot" },
                  ]}
                />
                <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                  How have housing units changed over time?
                </p>
              </div>
            </EditorSection>

            <EditorSection value="graph-type" label="Graph Type">
              <OptionList
                options={[
                  { label: "Line", selected: true },
                  { label: "Bar" },
                  { label: "Scatter" },
                  { label: "Donut" },
                ]}
              />
            </EditorSection>

            <EditorSection value="date-range" label="Date Range">
              <div className="grid gap-3 px-1">
                <Slider
                  min={2000}
                  max={2024}
                  step={1}
                  defaultValue={[2014, 2024]}
                  disabled
                  aria-label="Year range"
                  className={cn(
                    "[&_[data-slot=slider-track]]:h-2.5",
                    "[&_[data-slot=slider-range]]:bg-ppic-orange-300",
                    "[&_[data-slot=slider-thumb]]:size-3",
                    "[&_[data-slot=slider-thumb]]:border-ppic-orange-300",
                  )}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>2000</span>
                  <span className="font-medium text-foreground">2014</span>
                  <span className="font-medium text-foreground">2024</span>
                  <span>2024</span>
                </div>
              </div>
            </EditorSection>

            <EditorSection value="encodings" label="Encodings">
              <div className="grid gap-2">
                <Field label="X axis">Year</Field>
                <Field label="Y axis">Total Housing Units</Field>
              </div>
            </EditorSection>

            <EditorSection value="comparison" label="Comparisons">
              <Field label="Compare by">Region</Field>
            </EditorSection>

            <EditorSection value="labels" label="Labels">
              <Field label="Title">California Housing Trends</Field>
            </EditorSection>

            <EditorSection value="appearance" label="Appearance">
              <div className="grid gap-3">
                <Field label="Legend">Right</Field>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">PPIC watermark</Label>
                  <Switch defaultChecked />
                </div>
              </div>
            </EditorSection>
          </Accordion>

          <div className="mt-5 grid grid-cols-2 gap-2">
            {FOOTER_ACTIONS.map(({ label, Icon }) => (
              <span key={label} className={PILL}>
                <Icon />
                {label}
              </span>
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
