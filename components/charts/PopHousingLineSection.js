"use client";

/**
 * PopHousingLineSection.js — interactive population and housing line chart.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - /api/pophousing
 *   - Field metadata from the Population & Housing module schema
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

import { POPHOUSING_SCHEMA } from "@/lib/visualization/moduleSchemas/pophousing";

// Curated metric list comes from the client-safe module schema (single source of
// truth, shared with the server data module) — no longer duplicated here.
const PARAMETERS = POPHOUSING_SCHEMA.curatedMeasures;

// Each location preset maps to a single-subset API query (optionally pinned).
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

export default function PopHousingLineSection() {
  const [parameter, setParameter] = useState("Total Population");
  const [presetKey, setPresetKey] = useState("Regions");
  const [series, setSeries] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error | empty
  const [errorMessage, setErrorMessage] = useState("");
  const plotly = useMemo(
    () =>
      toPlotly({
        chartType: "line",
        bindings: { x: "Year", y: parameter, series: "Location" },
        series,
        field: POPHOUSING_SCHEMA.fields[parameter],
        transforms: "actual",
        labels: {
          title: `${parameter} Over Time (${PRESETS[presetKey].label})`,
          xAxis: "Year",
          yAxis: parameter,
        },
      }),
    [parameter, presetKey, series],
  );

  useEffect(() => {
    const preset = PRESETS[presetKey];
    const params = new URLSearchParams({ parameter, subset: preset.subset });
    if (preset.locations) params.set("locations", preset.locations.join(","));

    let cancelled = false;
    setStatus("loading");

    fetch(`/api/pophousing?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Request failed");
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        if (!body.series.length) {
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
  }, [parameter, presetKey]);

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-6">
        <div className="mb-5 flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pophousing-line-metric" className="text-xs text-muted-foreground">
              Metric
            </Label>
            <Select value={parameter} onValueChange={setParameter}>
              <SelectTrigger id="pophousing-line-metric" className="min-w-55">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARAMETERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Locations</p>
            <div className="flex gap-2">
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
            Could not load the population and housing chart: {errorMessage}. Try
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
