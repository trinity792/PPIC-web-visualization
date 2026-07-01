/**
 * PatternsShowcase.js — chart-editor sidebar, tag, and status-chip patterns.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Static UI Kit examples modeled on components/chart-builder/ChartSidebar.js
 *
 * UI Kit reference:
 *   - Documents the "Editor Sidebar", "Tag", and "Status Chip" patterns
 */

/* eslint-disable react/prop-types */

import React from "react";

import { Download, RotateCcw, Save, Upload } from "lucide-react";

import { Section } from "@/components/ui-kit/Section";
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

import { COLORS } from "@/lib/constants";

const FOOTER_ACTIONS = [
  { label: "Restore View", Icon: Upload },
  { label: "Save View", Icon: Save },
  { label: "Reset View", Icon: RotateCcw },
  { label: "Import / export", Icon: Download },
];

const PILL =
  "inline-flex h-8 items-center justify-center gap-2 rounded-full border border-ppic-neutral-600 bg-ppic-orange-100 px-2 font-sans text-xs text-foreground [&_svg]:size-3";

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

const STATUS_CHIPS = [
  { label: "Published", color: COLORS.blue5 },
  { label: "Draft", color: COLORS.gray3 },
  { label: "Updated", color: COLORS.orange3 },
];

/**
 * ======================================================================
 * Showcase Component
 * ======================================================================
 */

export function PatternsShowcase() {
  return (
    <Section
      id="patterns"
      eyebrow="Patterns"
      title="Editor Sidebar & Tags"
      description="The graph editor stacks collapsible control groups in a left rail. Tags and status chips reuse the brand and data palettes for at-a-glance categorization."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="rounded-2xl border border-ppic-border bg-white p-5 shadow-[0_4px_4px_rgba(0,0,0,0.08)]">
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
                  <Label htmlFor="ui-kit-watermark" className="text-sm">
                    PPIC watermark
                  </Label>
                  <Switch id="ui-kit-watermark" defaultChecked />
                </div>
              </div>
            </EditorSection>
          </Accordion>

          <div className="mt-5 grid grid-cols-2 gap-2">
            {FOOTER_ACTIONS.map(({ label, Icon }) => (
              <button key={label} type="button" className={PILL}>
                <Icon aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-ppic-border bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.08)]">
          <p className="mb-3 font-sans text-[13px] uppercase tracking-[0.16em] text-neutral-700">
            Tags
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-ppic-brand text-white">Housing</Badge>
            <Badge className="bg-ppic-blue-400 text-white">Population</Badge>
            <Badge className="bg-ppic-blue-50 text-ppic-neutral-600">Bay Area</Badge>
            <Badge variant="outline" className="border-ppic-brand text-ppic-brand">
              2013–2026
            </Badge>
            <Badge className="bg-ppic-neutral-100 text-ppic-neutral-600">Statewide</Badge>
          </div>

          <p className="mb-3 mt-7 font-sans text-[13px] uppercase tracking-[0.16em] text-neutral-700">
            Status chips
          </p>
          <div className="flex flex-wrap gap-2">
            {STATUS_CHIPS.map(({ label, color }) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-full bg-ppic-neutral-50 px-3 py-1 font-sans text-[13px]"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

/**
 * ======================================================================
 * Sidebar Pattern Sub-components
 * ======================================================================
 */

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

function Field({ label, children }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="rounded-md border px-3 py-1.5 text-sm">{children}</div>
    </div>
  );
}
