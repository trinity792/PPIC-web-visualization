"use client";

/**
 * ImportSettings.js — read the table again from what its import kept, with the
 * reader's own answers to how it should be read (import overhaul, phase 5):
 * the separator (pastes and delimited files), which raw line is the header and
 * how many lines it spans, the number and date conventions, and whether to
 * move titles, sources, and notes out of the data. The escape hatch for a
 * table the import misread at the source.
 *
 * Props:
 *   table    {Object}            — the inline table; reads `meta.raw`,
 *                                  `meta.rawText`, `meta.importOptions`
 *   open/onOpenChange {boolean/Function} — optional controlled opening from More
 *   showTrigger {boolean} — show a standalone trigger (default true)
 *   onApply  {(options) => void} — read again with these settings
 *
 * UI Kit reference:
 *   - ui/popover, ui/select, ui/switch, ui/label, ui/button
 */

import React, { useState } from "react";

import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DATE_ORDERS } from "@/lib/tabular/columnTypes";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/tabular/parseTable";

// Radix selects need string values; "auto" stands for "work it out".
const DELIMITERS = [
  { value: "auto", label: "Automatic" },
  { value: "\t", label: "Tab" },
  { value: ",", label: "Comma" },
  { value: ";", label: "Semicolon" },
];
const LOCALES = [
  { value: "auto", label: "Automatic" },
  { value: "en", label: "1,234.5" },
  { value: "eu", label: "1.234,5" },
];
// The header can be any of the first lines of the raw data.
const MAX_HEADER_CHOICES = 20;

export default function ImportSettings({ table, onApply, open: controlledOpen, onOpenChange, showTrigger = true }) {
  const meta = table?.meta || {};
  const lineCount = meta.raw?.length || (meta.rawText ? meta.rawText.split(/\r?\n/).filter(Boolean).length : 0);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const [options, setOptions] = useState(() => ({ ...DEFAULT_IMPORT_OPTIONS, ...(meta.importOptions || {}) }));
  const set = (key, value) => setOptions((previous) => ({ ...previous, [key]: value }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={showTrigger ? "gap-1.5" : "sr-only"}>
          <Settings2 aria-hidden="true" className="size-3.5" />
          Import settings
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-80 gap-3">
        <p className="text-xs leading-snug text-muted-foreground">
          Read your data again, telling the tool how. Your column kinds carry over.
        </p>
        <Field id="import-header-row" label="Header row">
          <Select
            value={options.headerRow == null ? "auto" : String(options.headerRow)}
            onValueChange={(value) => set("headerRow", value === "auto" ? null : Number(value))}
          >
            <SelectTrigger id="import-header-row" size="sm" aria-label="Header row"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatic</SelectItem>
              {Array.from({ length: Math.min(lineCount, MAX_HEADER_CHOICES) }, (_, index) => (
                <SelectItem key={index} value={String(index)}>{`Line ${index + 1}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="import-header-rows" label="Header spans">
          <Select value={String(options.headerRows)} onValueChange={(value) => set("headerRows", Number(value))}>
            <SelectTrigger id="import-header-rows" size="sm" aria-label="Header spans"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((count) => (
                <SelectItem key={count} value={String(count)}>{`${count} line${count === 1 ? "" : "s"}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="import-delimiter" label="Separator">
          <Select value={options.delimiter} onValueChange={(value) => set("delimiter", value)} disabled={meta.rawText == null}>
            <SelectTrigger id="import-delimiter" size="sm" aria-label="Separator"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DELIMITERS.map((option) => <SelectItem key={option.label} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field id="import-locale" label="Numbers">
          <Select value={options.locale} onValueChange={(value) => set("locale", value)}>
            <SelectTrigger id="import-locale" size="sm" aria-label="Numbers"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOCALES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field id="import-date-order" label="Dates">
          <Select value={options.dateOrder} onValueChange={(value) => set("dateOrder", value)}>
            <SelectTrigger id="import-date-order" size="sm" aria-label="Dates"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATE_ORDERS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="import-tidy" className="text-sm font-normal">Move titles, sources, and notes out</Label>
          <Switch id="import-tidy" checked={options.tidy} onCheckedChange={(value) => set("tidy", value)} />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setOpen(false);
            onApply(options);
          }}
        >
          Read again
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function Field({ id, label, children }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-2">
      <Label htmlFor={id} className="text-sm font-normal">{label}</Label>
      {children}
    </div>
  );
}
