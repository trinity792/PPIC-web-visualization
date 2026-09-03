"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { ChevronsUpDown, Plus, Search, Trash2 } from "lucide-react";

import { useAdvancedMode } from "@/components/chart-builder/advancedMode";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import useLocationOptions from "@/components/chart-builder/useLocationOptions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMPARISON_LIMIT_MESSAGE,
  MAX_COMPARISONS,
  addComparison,
  createComparison,
  overlapMetadata,
  resolveLabels,
  updateComparison,
} from "@/lib/visualization/comparisons";
import { getChartCapabilities } from "@/lib/visualization/chartRegistry";

function DimensionPicker({ label, values, selected, multiple = false, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedValues = Array.isArray(selected)
    ? selected
    : selected
      ? [selected]
      : [];
  const selectedSet = new Set(selectedValues);
  const filtered = values.filter((value) =>
    String(value).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const summary = multiple
    ? selectedValues.length
      ? selectedValues.join(", ")
      : `Select ${label.toLowerCase()}`
    : selectedValues[0] || `Select ${label.toLowerCase()}`;

  function select(value, checked) {
    if (!multiple) {
      onChange(value);
      setOpen(false);
      setQuery("");
      return;
    }
    onChange(
      checked
        ? [...new Set([...selectedValues, value])]
        : selectedValues.filter((entry) => entry !== value),
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate" title={selectedValues.length ? selectedValues.join(", ") : undefined}>
            {summary}
          </span>
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
            aria-label={`Search ${label}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
            className="pl-8"
          />
        </div>
        <div className="max-h-56 overflow-y-auto">
          {filtered.map((value) => {
            const checked = selectedSet.has(value);
            return (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => select(value, next === true)}
                />
                <span>{value}</span>
              </label>
            );
          })}
          {!filtered.length ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No matches.</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function labelMetaFor(schema) {
  return schema.labelMeta || {
    dimensionOrder: ["geography", "Race/Ethnicity", "Sex", "Age Group"],
    omitValues: { "Age Group": ["All Ages"], Sex: ["Both Sexes"], "Race/Ethnicity": ["All"] },
    valueLabels: {
      "Race/Ethnicity": { Hispanic: { default: "Latino", bySex: { Female: "Latina" } } },
      Sex: { Female: "Women", Male: "Men" },
    },
    disambiguateBy: ["geography", "Source", "time"],
  };
}

function aggregateFirst(values, aggregateValues = []) {
  const aggregates = new Set([
    ...aggregateValues,
    ...(values || []).filter((value) => /^(all\b|both\b)/i.test(String(value))),
  ]);
  return [...(values || [])].sort(
    (left, right) => Number(aggregates.has(right)) - Number(aggregates.has(left)),
  );
}

function draftIsComplete(draft, dimensions) {
  return dimensions.every(([name]) => {
    const value = draft?.[name];
    return value != null && value !== "" && (!Array.isArray(value) || value.length > 0);
  });
}

function ComparisonDraft({
  ariaLabel,
  title,
  dimensions,
  draft,
  onChange,
  onCancel,
  action,
  containerRef,
}) {
  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={ariaLabel}
      className="grid gap-3 rounded-lg border border-dashed bg-muted/25 p-3"
    >
      <div className="flex items-start justify-between gap-3 border-b pb-3">
        <p className="text-sm font-semibold">{title}</p>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cancel new comparison"
            className="-mr-2 -mt-2 text-muted-foreground"
            onClick={onCancel}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {dimensions.map(([name, field]) => (
        <div className="grid gap-2" key={name}>
          <Label>{field.label}</Label>
          <DimensionPicker
            label={field.label}
            values={field.values || []}
            selected={draft?.[name]}
            onChange={(value) => onChange(name, value)}
          />
        </div>
      ))}
      {action}
    </div>
  );
}

function comparisonGeographyLabel(geography) {
  if (typeof geography === "string") return geography;
  return geography?.locations?.length === 1 ? geography.locations[0] : undefined;
}

function ComparisonGeographyOverride({ comparison, sharedGeography, schema, onChange }) {
  const geography = comparison.geography || sharedGeography || {};
  const locations = geography.locations || [];
  const options = useLocationOptions(schema, { subset: geography.subset });

  function setSubset(subset) {
    const source = schema.subsetSource?.[subset];
    onChange({
      geography: { subset, locations: [] },
      ...(source ? { source } : {}),
    });
  }

  return (
    <div className="grid gap-3 rounded-md border bg-muted/25 p-3">
      <div className="grid gap-2">
        <Label htmlFor={`comparison-${comparison.id}-geography`}>
          Geographic level for this comparison
        </Label>
        <Select value={geography.subset || ""} onValueChange={setSubset}>
          <SelectTrigger id={`comparison-${comparison.id}-geography`}>
            <SelectValue placeholder="Choose a level" />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(schema.subsets || {}).map((subset) => (
              <SelectItem key={subset} value={subset}>{subset}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!geography.subset ? (
        <p className="text-sm text-muted-foreground">
          Select a geographic level to choose locations.
        </p>
      ) : options.status === "loading" || options.status === "idle" ? (
        <p role="status" className="text-sm text-muted-foreground">Loading locations…</p>
      ) : options.status === "error" ? (
        <p className="text-sm text-destructive">
          We could not load locations for this geographic level.
        </p>
      ) : (
        <div className="grid gap-2">
          <Label>Locations for this comparison</Label>
          <DimensionPicker
            label="Comparison locations"
            values={options.locations || []}
            selected={locations}
            multiple
            onChange={(nextLocations) =>
              onChange({
                geography: { subset: geography.subset, locations: nextLocations },
              })
            }
          />
        </div>
      )}

      {comparison.geography ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ geography: null, source: null })}
        >
          Use shared geography
        </Button>
      ) : null}
    </div>
  );
}

export default function ComparisonsSection() {
  const { config, dispatch, schema } = useChartConfig();
  const { advanced } = useAdvancedMode();
  const comparisons = config.question?.comparisons || [];
  const dimensions = useMemo(() => {
    if (schema.comparisonDimensions?.length) {
      return schema.comparisonDimensions.map((dimension) => [
        dimension.id,
        {
          ...schema.fields?.[dimension.id],
          ...dimension,
          values: aggregateFirst(
            dimension.values || schema.fields?.[dimension.id]?.values,
            schema.labelMeta?.omitValues?.[dimension.id],
          ),
        },
      ]);
    }
    return Object.entries(schema.fields || {})
      .filter(([, field]) => field.comparisonDimension)
      .map(([name, field]) => [
        name,
        {
          ...field,
          values: aggregateFirst(field.values, schema.labelMeta?.omitValues?.[name]),
        },
      ]);
  }, [schema]);
  const [initialDraft, setInitialDraft] = useState({});
  const [newDraft, setNewDraft] = useState(null);
  const [openOverrides, setOpenOverrides] = useState({});
  const newDraftRef = useRef(null);
  const draftingNewComparison = newDraft !== null;
  const presentationChoices =
    getChartCapabilities(config.presentation?.chartType)?.comparison?.presentations || [];
  const atLimit = comparisons.length >= MAX_COMPARISONS;
  const resolvedLabels = resolveLabels(
    comparisons.map((entry) => ({
      ...entry,
      geography: comparisonGeographyLabel(entry.geography),
      source: entry.source || config.question.source,
    })),
    { labelMeta: labelMetaFor(schema) },
  );
  const resolved = comparisons.map((entry, index) => ({
    ...entry,
    derivedLabel: resolvedLabels[index].derivedLabel,
    label: resolvedLabels[index].label,
  }));
  const overlap = overlapMetadata(comparisons, {
    dimensionRoles: {
      "Race/Ethnicity": { All: "aggregate", Hispanic: "component", White: "component", Black: "component" },
      Sex: { "Both Sexes": "aggregate", Female: "component", Male: "component" },
      "Age Group": { "All Ages": "aggregate", "0-4": "component", "5-9": "component" },
    },
  });

  const setComparisons = (next) => dispatch({ type: "SET_COMPARISONS", comparisons: next });
  const toggleOverride = (comparisonId, kind) => {
    const key = `${comparisonId}:${kind}`;
    setOpenOverrides((current) => ({ ...current, [key]: !current[key] }));
  };

  useEffect(() => {
    if (!draftingNewComparison) return;
    newDraftRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [draftingNewComparison]);

  // Location-series modules have no comparison editor. The section registry
  // normally keeps this component out of the sidebar; returning nothing here
  // also makes direct/embedded use safe.
  if (!dimensions.length) return null;

  const addInitialComparison = () => {
    if (!draftIsComplete(initialDraft, dimensions) || atLimit) return;
    const result = addComparison(
      comparisons,
      createComparison({ dimensions: initialDraft }),
    );
    if (!result.issues.length) {
      setComparisons(result.comparisons);
      setInitialDraft({});
    }
  };

  const updateNewDraft = (name, value) => {
    const next = { ...(newDraft || {}), [name]: value };
    if (!draftIsComplete(next, dimensions)) {
      setNewDraft(next);
      return;
    }
    const result = addComparison(comparisons, createComparison({ dimensions: next }));
    if (!result.issues.length) {
      setComparisons(result.comparisons);
      setNewDraft(null);
    }
  };

  return (
    <div className="grid gap-4">
      {presentationChoices.length > 1 && comparisons.length > 1 ? (
        <div className="grid gap-2">
          <label htmlFor="comparison-presentation">Comparison presentation</label>
          <Select
            value={config.presentation?.comparisonPresentation || presentationChoices[0]}
            onValueChange={(value) =>
              dispatch({ type: "SET_COMPARISON_PRESENTATION", value })
            }
          >
            <SelectTrigger id="comparison-presentation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {presentationChoices.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "combined" ? "Show together" : "Show in tabs"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {dimensions.length && !comparisons.length ? (
        <ComparisonDraft
          ariaLabel="Comparison draft"
          title="Comparison 1"
          dimensions={dimensions}
          draft={initialDraft}
          onChange={(name, value) =>
            setInitialDraft((current) => ({ ...current, [name]: value }))
          }
          action={(
            <Button
              type="button"
              disabled={!draftIsComplete(initialDraft, dimensions)}
              onClick={addInitialComparison}
            >
              <Plus aria-hidden="true" />
              Add comparison
            </Button>
          )}
        />
      ) : null}

      {dimensions.length ? resolved.map((comparison, index) => (
        <div
          key={comparison.id}
          role="group"
          aria-label={`Comparison ${index + 1}`}
          className="grid gap-3 rounded-lg border bg-card p-3 shadow-xs"
        >
          <div className="flex items-start justify-between gap-3 border-b pb-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Comparison {index + 1}
              </p>
              <p className="truncate text-sm font-semibold">{comparison.label}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove comparison ${index + 1}`}
              className="-mr-2 -mt-2 text-destructive hover:text-destructive"
              onClick={() =>
                setComparisons(comparisons.filter((entry) => entry.id !== comparison.id))
              }
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
          {dimensions.map(([name, field]) => (
            <div className="grid gap-2" key={name}>
              <Label>{field.label}</Label>
              <DimensionPicker
                label={field.label}
                values={field.values || []}
                selected={comparison.dimensions?.[name]}
                onChange={(value) => {
                  const result = updateComparison(comparisons, comparison.id, {
                    dimensions: { ...comparison.dimensions, [name]: value },
                  });
                  setComparisons(result.comparisons);
                }}
              />
            </div>
          ))}
          {advanced ? (
            <>
              <div className="grid grid-cols-2 gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleOverride(comparison.id, "geography")}
                >
                  Override geography
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleOverride(comparison.id, "time")}
                >
                  Override time
                </Button>
              </div>
              {openOverrides[`${comparison.id}:geography`] ? (
                <ComparisonGeographyOverride
                  comparison={comparison}
                  sharedGeography={config.question.geography}
                  schema={schema}
                  onChange={(patch) => {
                    const result = updateComparison(comparisons, comparison.id, patch);
                    setComparisons(result.comparisons);
                  }}
                />
              ) : null}
              {openOverrides[`${comparison.id}:time`] ? (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["Start period", "startYear"],
                    ["End period", "endYear"],
                  ].map(([label, key]) => (
                    <div key={key} className="grid gap-2">
                      <Label htmlFor={`comparison-${comparison.id}-${key}`}>{label}</Label>
                      <Input
                        id={`comparison-${comparison.id}-${key}`}
                        type="number"
                        value={comparison.time?.[key] ?? config.question.time?.[key] ?? ""}
                        onChange={(event) => {
                          const result = updateComparison(comparisons, comparison.id, {
                            time: {
                              ...(comparison.time || config.question.time),
                              [key]: Number(event.target.value),
                            },
                          });
                          setComparisons(result.comparisons);
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )) : null}

      {dimensions.length && comparisons.length && !draftingNewComparison ? (
        <Button
          type="button"
          variant="outline"
          disabled={atLimit}
          onClick={() => setNewDraft({})}
        >
          <Plus aria-hidden="true" />
          New comparison
        </Button>
      ) : null}

      {dimensions.length && draftingNewComparison ? (
        <ComparisonDraft
          ariaLabel="New comparison draft"
          title={`Comparison ${comparisons.length + 1}`}
          dimensions={dimensions}
          draft={newDraft}
          onChange={updateNewDraft}
          onCancel={() => setNewDraft(null)}
          containerRef={newDraftRef}
        />
      ) : null}

      {atLimit ? <p>{COMPARISON_LIMIT_MESSAGE}</p> : null}
      {overlap.length ? <p>This subgroup is included in the aggregate comparison.</p> : null}
    </div>
  );
}
