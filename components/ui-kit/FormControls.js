"use client";

/**
 * FormControls.js — interactive form-control specimens for dashboard editors.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Static UI Kit examples; range and graph type are local demonstration state
 *
 * UI Kit reference:
 *   - Documents text inputs, selects, radio groups, sliders, checkboxes, and switches
 */

/* eslint-disable react/prop-types */

import React, { useState } from "react";

import { Search } from "lucide-react";

import { Panel, Section } from "@/components/ui-kit/Section";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const orangeCheck =
  "data-[state=checked]:border-ppic-brand data-[state=checked]:bg-ppic-brand data-[state=checked]:text-white";

export function FormControls() {
  const [range, setRange] = useState([2014, 2024]);
  const [graphType, setGraphType] = useState("line");

  return (
    <Section
      id="forms"
      eyebrow="Components"
      title="Form & Controls"
      description="The control inputs that power the dashboard's graph editor — text fields, dropdowns, selectable lists, the dual-handle year-range slider, and toggles. All checked states use the brand orange."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel>
          <div className="space-y-5">
            <div>
              <FieldLabel htmlFor="ui-kit-search">Search</FieldLabel>
              <div className="relative">
                <Input id="ui-kit-search" placeholder="Search datasets" className="pr-10" />
                <Search
                  aria-hidden="true"
                  className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500"
                />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="ui-kit-chart-title">Chart title</FieldLabel>
              <Input id="ui-kit-chart-title" defaultValue="Total Housing Units" />
            </div>
            <div>
              <FieldLabel htmlFor="ui-kit-footnote">Footnote</FieldLabel>
              <Textarea
                id="ui-kit-footnote"
                rows={3}
                placeholder="Source: California Dept. of Finance"
              />
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="space-y-5">
            <div>
              <FieldLabel htmlFor="ui-kit-region">Region</FieldLabel>
              <Select defaultValue="statewide">
                <SelectTrigger id="ui-kit-region">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="statewide">Statewide</SelectItem>
                  <SelectItem value="bay-area">Bay Area</SelectItem>
                  <SelectItem value="central-valley">Central Valley</SelectItem>
                  <SelectItem value="southern">Southern California</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <fieldset>
              <legend className="mb-2 block font-sans text-[13px] uppercase tracking-[0.12em] text-neutral-700">
                Graph type
              </legend>
              <RadioGroup value={graphType} onValueChange={setGraphType} className="gap-2.5">
                {[
                  ["bar", "Bar"],
                  ["line", "Line"],
                  ["map", "Map"],
                  ["dumbbell", "Dumbbell"],
                ].map(([v, label]) => (
                  <label
                    key={v}
                    className="flex items-center gap-2.5 font-sans text-[15px] text-neutral-800"
                  >
                    <RadioGroupItem
                      value={v}
                      className="data-[state=checked]:border-ppic-brand [&_svg]:fill-ppic-brand [&_svg]:text-ppic-brand"
                    />
                    {label}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          </div>
        </Panel>

        <Panel>
          <div className="space-y-7">
            <div>
              <FieldHeading>Year range</FieldHeading>
              <Slider
                aria-label="Year range"
                value={range}
                min={2000}
                max={2026}
                step={1}
                onValueChange={setRange}
                className="[&_[data-slot=slider-range]]:bg-ppic-orange-100 [&_[data-slot=slider-track]]:bg-neutral-200 [&_[data-slot=slider-thumb]]:border-ppic-orange-100"
              />
              <div className="mt-2 flex justify-between font-sans text-xs text-neutral-500">
                <span>{range[0]}</span>
                <span>{range[1]}</span>
              </div>
            </div>

            <div className="space-y-3">
              <FieldHeading>Encodings</FieldHeading>
              <label className="flex items-center gap-3 font-sans text-[15px] text-neutral-800">
                <Checkbox defaultChecked className={orangeCheck} />
                Show data labels
              </label>
              <label className="flex items-center gap-3 font-sans text-[15px] text-neutral-800">
                <Checkbox className={orangeCheck} />
                Stack series
              </label>
            </div>

            <div className="space-y-3">
              <FieldHeading>Appearance</FieldHeading>
              <div className="flex items-center justify-between font-sans text-[15px] text-neutral-800">
                <span>PPIC watermark</span>
                <Switch
                  aria-label="PPIC watermark"
                  defaultChecked
                  className="data-[state=checked]:bg-ppic-brand"
                />
              </div>
              <div className="flex items-center justify-between font-sans text-[15px] text-neutral-800">
                <span>Show legend</span>
                <Switch
                  aria-label="Show legend"
                  className="data-[state=checked]:bg-ppic-brand"
                />
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </Section>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function FieldLabel({ children, htmlFor }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-2 block font-sans text-[13px] uppercase tracking-[0.12em] text-neutral-700"
    >
      {children}
    </label>
  );
}

function FieldHeading({ children }) {
  return (
    <p className="mb-2 font-sans text-[13px] uppercase tracking-[0.12em] text-neutral-700">
      {children}
    </p>
  );
}
