"use client";
/* eslint-disable react/prop-types */
import React, { useState } from "react";
import { Search } from "lucide-react";
import { Section, Panel } from "./Section";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

const orangeCheck =
  "data-[state=checked]:bg-[var(--ppic-orange-300)] data-[state=checked]:border-[var(--ppic-orange-300)] data-[state=checked]:text-white";

function FieldLabel({ children }) {
  return (
    <span
      className="mb-2 block text-[13px] uppercase tracking-[0.12em] text-neutral-700"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {children}
    </span>
  );
}

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
        {/* Text inputs */}
        <Panel>
          <div className="space-y-5">
            <div>
              <FieldLabel>Search</FieldLabel>
              <div className="relative">
                <Input placeholder="Search datasets" className="pr-10" />
                <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
              </div>
            </div>
            <div>
              <FieldLabel>Chart title</FieldLabel>
              <Input defaultValue="Total Housing Units" />
            </div>
            <div>
              <FieldLabel>Footnote</FieldLabel>
              <Textarea rows={3} placeholder="Source: California Dept. of Finance" />
            </div>
          </div>
        </Panel>

        {/* Selects + radio */}
        <Panel>
          <div className="space-y-5">
            <div>
              <FieldLabel>Region</FieldLabel>
              <Select defaultValue="statewide">
                <SelectTrigger>
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
            <div>
              <FieldLabel>Graph type</FieldLabel>
              <RadioGroup value={graphType} onValueChange={setGraphType} className="gap-2.5">
                {[
                  ["bar", "Bar"],
                  ["line", "Line"],
                  ["map", "Map"],
                  ["dumbbell", "Dumbbell"],
                ].map(([v, label]) => (
                  <label key={v} className="flex items-center gap-2.5 text-[15px] text-neutral-800" style={{ fontFamily: "var(--font-sans)" }}>
                    <RadioGroupItem
                      value={v}
                      className="data-[state=checked]:border-[var(--ppic-orange-300)] [&_svg]:fill-[var(--ppic-orange-300)] [&_svg]:text-[var(--ppic-orange-300)]"
                    />
                    {label}
                  </label>
                ))}
              </RadioGroup>
            </div>
          </div>
        </Panel>

        {/* Slider + toggles */}
        <Panel>
          <div className="space-y-7">
            <div>
              <FieldLabel>Year range</FieldLabel>
              <Slider
                value={range}
                min={2000}
                max={2026}
                step={1}
                onValueChange={setRange}
                className="[&_[data-slot=slider-range]]:bg-[var(--ppic-orange-100)] [&_[data-slot=slider-track]]:bg-neutral-200 [&_[data-slot=slider-thumb]]:border-[var(--ppic-orange-100)]"
              />
              <div className="mt-2 flex justify-between text-[12px] text-neutral-500" style={{ fontFamily: "var(--font-sans)" }}>
                <span>{range[0]}</span>
                <span>{range[1]}</span>
              </div>
            </div>

            <div className="space-y-3">
              <FieldLabel>Encodings</FieldLabel>
              <label className="flex items-center gap-3 text-[15px] text-neutral-800" style={{ fontFamily: "var(--font-sans)" }}>
                <Checkbox defaultChecked className={orangeCheck} />
                Show data labels
              </label>
              <label className="flex items-center gap-3 text-[15px] text-neutral-800" style={{ fontFamily: "var(--font-sans)" }}>
                <Checkbox className={orangeCheck} />
                Stack series
              </label>
            </div>

            <div className="space-y-3">
              <FieldLabel>Appearance</FieldLabel>
              <div className="flex items-center justify-between text-[15px] text-neutral-800" style={{ fontFamily: "var(--font-sans)" }}>
                <span>PPIC watermark</span>
                <Switch defaultChecked className="data-[state=checked]:bg-[var(--ppic-orange-300)]" />
              </div>
              <div className="flex items-center justify-between text-[15px] text-neutral-800" style={{ fontFamily: "var(--font-sans)" }}>
                <span>Show legend</span>
                <Switch className="data-[state=checked]:bg-[var(--ppic-orange-300)]" />
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </Section>
  );
}
