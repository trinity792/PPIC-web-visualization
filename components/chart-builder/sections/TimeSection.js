"use client";

import React, { useEffect, useState } from "react";

import { Check, ChevronsUpDown, Search } from "lucide-react";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/components/ui/utils";

function joinYears(years) {
  if (years.length < 2) return String(years[0] ?? "");
  if (years.length === 2) return `${years[0]} and ${years[1]}`;
  return `${years.slice(0, -1).join(", ")}, and ${years.at(-1)}`;
}

function YearSelect({ label, value, periods, disabledPeriod, active, onFocus, onChange }) {
  return (
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value ?? ""}
        onFocus={onFocus}
        onChange={(event) => {
          const selected = periods.find(
            (period) => String(period) === event.target.value,
          );
          onChange(selected ?? event.target.value);
        }}
      >
        <option value="">Select a year</option>
        {periods.map((period) => (
          <option
            key={period}
            value={period}
            disabled={period === disabledPeriod}
            aria-disabled={period === disabledPeriod ? "true" : undefined}
            aria-hidden={active === false ? "true" : undefined}
          >
            {period}
          </option>
        ))}
      </select>
    </label>
  );
}

function closestPeriod(periods, value) {
  return periods.reduce(
    (closest, period) =>
      Math.abs(Number(period) - value) < Math.abs(Number(closest) - value)
        ? period
        : closest,
    periods[0],
  );
}

function RangePeriodSlider({ current, periods, onChange }) {
  const numeric = periods.length > 1 && periods.every((period) => Number.isFinite(Number(period)));
  const min = numeric ? Number(periods[0]) : null;
  const max = numeric ? Number(periods.at(-1)) : null;
  const committed = numeric
    ? [Number(current.startYear ?? min), Number(current.endYear ?? max)]
    : [];
  const [value, setValue] = useState(committed);

  useEffect(() => {
    if (numeric) setValue(committed);
  }, [current.endYear, current.startYear, max, min, numeric]);

  if (!numeric) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <YearSelect
          label="Start year"
          value={current.startYear}
          periods={periods}
          onChange={(startYear) => onChange({ ...current, contract: "range", startYear })}
        />
        <YearSelect
          label="End year"
          value={current.endYear}
          periods={periods}
          onChange={(endYear) => onChange({ ...current, contract: "range", endYear })}
        />
      </div>
    );
  }

  function commit(next) {
    const startYear = closestPeriod(periods, next[0]);
    const endYear = closestPeriod(periods, next[1]);
    onChange({ ...current, contract: "range", startYear, endYear });
  }

  return (
    <div className="grid gap-3 px-1">
      <Slider
        min={min}
        max={max}
        step={1}
        value={value}
        onValueChange={setValue}
        onValueCommit={commit}
        thumbLabels={["Start year", "End year"]}
        className={cn(
          "py-1",
          "[&_[data-slot=slider-track]]:h-2.5",
          "[&_[data-slot=slider-range]]:bg-ppic-orange-300",
          "[&_[data-slot=slider-thumb]]:size-3",
          "[&_[data-slot=slider-thumb]]:border-ppic-orange-300",
        )}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{periods[0]}</span>
        <span className="rounded-full bg-ppic-orange-100 px-2 py-0.5 font-medium text-foreground">
          {closestPeriod(periods, value[0])}–{closestPeriod(periods, value[1])}
        </span>
        <span>{periods.at(-1)}</span>
      </div>
    </div>
  );
}

function PeriodPopover({ periods, selected, multiple = false, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedSet = new Set(selected);
  const filtered = periods.filter((period) => String(period).includes(query.trim()));
  const summary = multiple
    ? selected.length
      ? `${selected.length} ${selected.length === 1 ? "year" : "years"} selected`
      : "Select years"
    : selected[0] ?? "Select a year";

  function select(period, checked) {
    if (!multiple) {
      if (checked) onChange([period]);
      setOpen(false);
      setQuery("");
      return;
    }
    const next = checked
      ? [...new Set([...selected, period])]
      : selected.filter((entry) => entry !== period);
    onChange(next.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={multiple ? "Years" : "Year"}
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span>{summary}</span>
          <ChevronsUpDown aria-hidden="true" className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-2">
        <div className="relative mb-2">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Find a year"
            placeholder="Find a year"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-8"
          />
        </div>
        <div role="group" aria-label="Years" className="grid max-h-64 gap-1 overflow-y-auto">
          {filtered.map((period) => {
            const checked = selectedSet.has(period);
            return (
              <label
                key={period}
                className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm hover:bg-muted/60"
              >
                <Checkbox
                  aria-label={`Select ${period}`}
                  checked={checked}
                  onCheckedChange={(next) => select(period, next === true)}
                />
                <span className="flex-1">{period}</span>
                {checked ? <Check aria-hidden="true" className="size-4 text-ppic-brand" /> : null}
              </label>
            );
          })}
          {!filtered.length ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              No years match “{query.trim()}”.
            </p>
          ) : null}
        </div>
        {multiple && selected.length ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => onChange([])}
          >
            Clear years
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export default function TimeSection() {
  const { config, dispatch, editorModel } = useChartConfig();
  const capability = editorModel?.time || {};
  const current = config.question?.time || {};
  const periods = capability.availablePeriods || [];
  const [activeEndpoint, setActiveEndpoint] = useState(null);

  if (capability.contract === "none") return null;
  const empty =
    (capability.contract === "selectedSnapshots" && !(current.years || []).length) ||
    (capability.contract === "range" &&
      (current.startYear == null || current.endYear == null)) ||
    (capability.contract === "twoPeriods" &&
      (current.startYear == null || current.endYear == null));

  return (
    <div role="group" aria-label="Time" className="grid gap-3">
      {empty ? <p>Select time to show this chart.</p> : null}

      {capability.contract === "range" ? (
        <RangePeriodSlider
          current={current}
          periods={periods}
          onChange={(time) => dispatch({ type: "SET_TIME", time })}
        />
      ) : null}

      {capability.contract === "snapshot" ? (
        <div className="grid gap-2">
          <Label>Year</Label>
          <PeriodPopover
            periods={periods}
            selected={[current.year ?? capability.defaultPeriod].filter(
              (period) => period != null,
            )}
            onChange={([year]) =>
              dispatch({ type: "SET_TIME", time: { contract: "snapshot", year } })
            }
          />
          {(capability.reportingPeriods || []).includes(
            current.year ?? capability.defaultPeriod,
          ) ? <span className="text-xs">Reporting year</span> : null}
        </div>
      ) : null}

      {capability.contract === "twoPeriods" ? (
        <div className="grid grid-cols-2 gap-2">
          <YearSelect
            label="First year"
            value={current.startYear}
            periods={periods}
            disabledPeriod={capability.distinctRequired ? current.endYear : undefined}
            active={activeEndpoint ? activeEndpoint === "first" : undefined}
            onFocus={() => setActiveEndpoint("first")}
            onChange={(startYear) => dispatch({ type: "SET_TIME", time: { ...current, startYear } })}
          />
          <YearSelect
            label="Second year"
            value={current.endYear}
            periods={periods}
            disabledPeriod={capability.distinctRequired ? current.startYear : undefined}
            active={activeEndpoint ? activeEndpoint === "second" : undefined}
            onFocus={() => setActiveEndpoint("second")}
            onChange={(endYear) => dispatch({ type: "SET_TIME", time: { ...current, endYear } })}
          />
        </div>
      ) : null}

      {capability.contract === "selectedSnapshots" ? (
        <>
          <Label>Years</Label>
          <PeriodPopover
            periods={periods}
            selected={current.years || []}
            multiple
            onChange={(years) =>
              dispatch({ type: "SET_TIME", time: { ...current, years } })
            }
          />
          {(current.years || []).length > 1 &&
          (capability.displayModes || []).some((mode) =>
            ["tabs", "average"].includes(mode),
          ) ? (
            <div role="radiogroup" aria-label="Year display">
              {(capability.displayModes || []).includes("tabs") ? (
                <label>
                  <input
                    type="radio"
                    name="year-display"
                    checked={config.question.calculation?.id !== "averageSelectedYears"}
                    onChange={() => dispatch({ type: "SET_CALCULATION", calculation: { id: "actual", params: {} } })}
                  />
                  Show each year in tabs
                </label>
              ) : null}
              {(capability.displayModes || []).includes("average") ? (
                <label>
                  <input
                    type="radio"
                    name="year-display"
                    checked={config.question.calculation?.id === "averageSelectedYears"}
                    onChange={() =>
                      dispatch({
                        type: "SET_CALCULATION",
                        calculation: {
                          id: "averageSelectedYears",
                          params: { years: current.years },
                        },
                      })
                    }
                  />
                  Show the average of selected years
                </label>
              ) : null}
            </div>
          ) : null}
          {config.question.calculation?.id === "averageSelectedYears" ? (
            <p>Average of {joinYears(config.question.calculation.params?.years || current.years || [])}.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
