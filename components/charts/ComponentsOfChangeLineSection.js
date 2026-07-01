"use client";

/**
 * ComponentsOfChangeLineSection.js — interactive line chart for demographic change.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - /api/components-of-change
 *   - Field metadata from the Components of Change module schema
 *
 * UI Kit reference:
 *   - Implements the "Chart Container" and form-control patterns
 */

import React, { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PlotlyChart from "@/components/charts/PlotlyChart";

import { toPlotly } from "@/lib/visualization/toPlotly";

import { COMPONENTS_OF_CHANGE_SCHEMA } from "@/lib/visualization/moduleSchemas/componentsOfChange";

// Curated metrics and sources come from the client-safe module schema (single
// source of truth, shared with the server data module) — no longer duplicated.
const PARAMETERS = COMPONENTS_OF_CHANGE_SCHEMA.curatedMeasures;
const SOURCES = COMPONENTS_OF_CHANGE_SCHEMA.sources;

const PRESETS = {
  Regions: { label: "California Regions", subset: "Regions", locations: null },
  "Major Counties": {
    label: "Major Counties",
    subset: "Counties",
    locations: [
      "Los Angeles",
      "San Diego",
      "Orange",
      "Riverside",
      "San Bernardino",
      "Santa Clara",
      "Alameda",
      "Sacramento",
    ],
  },
};

export default function ComponentsOfChangeLineSection() {
  const [parameter, setParameter] = useState("Net Domestic Migration");
  const [source, setSource] = useState("DoF");
  const [presetKey, setPresetKey] = useState("Regions");
  const [series, setSeries] = useState([]);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const plotly = useMemo(
    () =>
      toPlotly({
        chartType: "line",
        bindings: { x: "Year", y: parameter, series: "Location" },
        series,
        field: COMPONENTS_OF_CHANGE_SCHEMA.fields[parameter],
        transforms: "actual",
        labels: {
          title: `${parameter} Over Time (${PRESETS[presetKey].label}, ${source})`,
          xAxis: "Year",
          yAxis: parameter,
        },
      }),
    [parameter, presetKey, series, source],
  );

  useEffect(() => {
    const preset = PRESETS[presetKey];
    const params = new URLSearchParams({
      parameter,
      subset: preset.subset,
      source,
    });
    if (preset.locations) params.set("locations", preset.locations.join(","));

    let cancelled = false;
    setStatus("loading");

    fetch(`/api/components-of-change?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Request failed");
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        if (!body.series.length) {
          setSeries([]);
          setStatus("empty");
          return;
        }
        setSeries(body.series);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err.message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [parameter, presetKey, source]);

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-6">
        <div className="mb-5 flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="components-change-line-metric"
              className="text-xs text-muted-foreground"
            >
              Metric
            </Label>
            <Select value={parameter} onValueChange={setParameter}>
              <SelectTrigger id="components-change-line-metric" className="min-w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARAMETERS.map((metric) => (
                  <SelectItem key={metric} value={metric}>
                    {metric}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="components-change-line-source"
              className="text-xs text-muted-foreground"
            >
              Source
            </Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="components-change-line-source" className="min-w-30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Locations</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PRESETS).map(([key, preset]) => (
                <Button
                  key={key}
                  type="button"
                  variant={key === presetKey ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPresetKey(key)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {status === "loading" && (
          <p role="status" className="py-10 text-muted-foreground">
            Loading chart…
          </p>
        )}
        {status === "empty" && (
          <p className="py-10 text-muted-foreground">
            No data available for this selection.
          </p>
        )}
        {status === "error" && (
          <p role="alert" className="py-10 text-destructive">
            Could not load the demographic-change chart: {errorMessage}. Try
            refreshing or choose a different selection.
          </p>
        )}
        {status === "ready" && (
          <PlotlyChart {...plotly} />
        )}
      </CardContent>
    </Card>
  );
}
