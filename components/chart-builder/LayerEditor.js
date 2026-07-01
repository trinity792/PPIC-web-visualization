"use client";

/**
 * LayerEditor.js — dialog for adding comparison and reference layers to a chart.
 *
 * Props:
 *   trigger {ReactNode} — control that opens the layer editor dialog
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *
 * UI Kit reference:
 *   - Implements graph-editor dialog, badge, input, and select patterns
 */

/* eslint-disable react/prop-types */

import React, { useMemo, useState } from "react";

import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { areComparable, isMeasure } from "@/lib/visualization/fieldTypes";

const LAYER_TYPES = {
  selectedPlaces: {
    label: "Selected places",
    description: "Add a controlled set of locations.",
  },
  benchmark: {
    label: "Benchmark line",
    description: "Add a comparison place such as California.",
  },
  secondSource: {
    label: "Second source",
    description: "Compare DoF with Census for the same measure.",
  },
  secondMeasure: {
    label: "Second measure",
    description: "Add a compatible measure on the same axis.",
  },
  referenceValue: {
    label: "Reference value",
    description: "Add a fixed target or historical average.",
  },
  derivedComparison: {
    label: "Derived comparison",
    description: "Add indexed, change, or benchmark-difference values.",
  },
};

const DERIVED_TRANSFORMS = [
  ["indexed", "Indexed values"],
  ["numericChange", "Numeric change"],
  ["percentChange", "Percent change"],
  ["percentagePointChange", "Percentage-point change"],
  ["differenceFromBenchmark", "Difference from benchmark"],
];

/**
 * ======================================================================
 * Layer Construction Helpers
 * ======================================================================
 */

function makeId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `layer-${Date.now().toString(36)}`
  );
}

/**
 * ======================================================================
 * Layer Editor Component
 * ======================================================================
 */

export default function LayerEditor({ trigger }) {
  const { config, dispatch, schema } = useChartConfig();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("selectedPlaces");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const primaryName = config.bindings.y;
  const primary = schema.fields[primaryName];

  const secondMeasures = useMemo(
    () =>
      Object.entries(schema.fields).filter(
        ([name, field]) =>
          name !== primaryName &&
          isMeasure(field) &&
          primary &&
          areComparable(primary, field),
      ),
    [primary, primaryName, schema],
  );

  const availableTypes = Object.keys(LAYER_TYPES).filter((layerType) => {
    if (layerType === "secondSource") return Boolean(schema.sources?.length);
    if (layerType === "secondMeasure") return secondMeasures.length > 0;
    return true;
  });

  function reset(nextOpen) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setType("selectedPlaces");
      setValue("");
      setLabel("");
    }
  }

  function addLayer() {
    const layer = {
      id: makeId(),
      type,
      x: config.bindings.x || null,
      y: type === "secondMeasure" ? value : config.bindings.y || null,
      splitBy: config.bindings.series || null,
      values:
        type === "selectedPlaces"
          ? value.split(",").map((item) => item.trim()).filter(Boolean)
          : type === "referenceValue"
            ? [Number(value)]
            : value
              ? [value]
              : [],
      filters: { ...config.filters },
      label: label.trim() || LAYER_TYPES[type].label,
      ...(type === "derivedComparison" ? { transform: value } : {}),
    };
    dispatch({ type: "ADD_LAYER", layer });
    reset(false);
  }

  const needsValue = !["secondSource"].includes(type);
  const canSubmit =
    !needsValue ||
    (value.trim() !== "" &&
      (type !== "referenceValue" || Number.isFinite(Number(value))));

  return (
    <div className="grid gap-3">
      <Dialog open={open} onOpenChange={reset}>
        <DialogTrigger asChild>
          {trigger || (
            <Button type="button" variant="outline">
              <Plus aria-hidden="true" />
              Add layer
            </Button>
          )}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a supported trace layer</DialogTitle>
            <DialogDescription>
              Layers reuse the module field catalog and current filters. Arbitrary
              Plotly traces are not accepted.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="layer-type">Layer type</Label>
              <Select value={type} onValueChange={(next) => {
                setType(next);
                setValue("");
              }}>
                <SelectTrigger id="layer-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((layerType) => (
                    <SelectItem key={layerType} value={layerType}>
                      {LAYER_TYPES[layerType].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {LAYER_TYPES[type].description}
              </p>
            </div>

            {type === "secondMeasure" ? (
              <div className="grid gap-2">
                <Label htmlFor="layer-value">Compatible measure</Label>
                <Select value={value} onValueChange={setValue}>
                  <SelectTrigger id="layer-value">
                    <SelectValue placeholder="Choose a measure" />
                  </SelectTrigger>
                  <SelectContent>
                    {secondMeasures.map(([name, field]) => (
                      <SelectItem key={name} value={name}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {type === "derivedComparison" ? (
              <div className="grid gap-2">
                <Label htmlFor="layer-derived">Comparison</Label>
                <Select value={value} onValueChange={setValue}>
                  <SelectTrigger id="layer-derived">
                    <SelectValue placeholder="Choose a transform" />
                  </SelectTrigger>
                  <SelectContent>
                    {DERIVED_TRANSFORMS.filter(([id]) =>
                      primary?.transforms?.includes(id),
                    ).map(([id, text]) => (
                      <SelectItem key={id} value={id}>
                        {text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {["selectedPlaces", "benchmark", "referenceValue"].includes(type) ? (
              <div className="grid gap-2">
                <Label htmlFor="layer-value">
                  {type === "selectedPlaces"
                    ? "Places (comma-separated)"
                    : type === "referenceValue"
                      ? "Reference value"
                      : "Benchmark"}
                </Label>
                <Input
                  id="layer-value"
                  type={type === "referenceValue" ? "number" : "text"}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={
                    type === "selectedPlaces"
                      ? "Alameda, Contra Costa, San Diego"
                      : type === "benchmark"
                        ? "California"
                        : "0"
                  }
                />
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="layer-label">Display label</Label>
              <Input
                id="layer-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={LAYER_TYPES[type].label}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => reset(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={addLayer}>
              Add layer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {config.layers.map((layer) => (
        <div
          key={layer.id}
          className="flex items-center justify-between gap-2 rounded-md border bg-card p-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{layer.label}</p>
            <Badge variant="secondary">{LAYER_TYPES[layer.type]?.label}</Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${layer.label}`}
            onClick={() => dispatch({ type: "REMOVE_LAYER", id: layer.id })}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ))}
    </div>
  );
}
