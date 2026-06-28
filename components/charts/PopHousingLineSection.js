"use client";

import React, { useEffect, useMemo, useState } from "react";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { POPHOUSING_SCHEMA } from "@/lib/visualization/moduleSchemas/pophousing";
import { toPlotly } from "@/lib/visualization/toPlotly";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
        {/* Controls */}
        <div className="mb-5 flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Metric</Label>
            <Select value={parameter} onValueChange={setParameter}>
              <SelectTrigger className="min-w-55">
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
            <Label className="text-xs text-muted-foreground">Locations</Label>
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

        {/* Chart / states */}
        {status === "loading" && (
          <p className="py-10 text-muted-foreground">Loading chart…</p>
        )}
        {status === "empty" && (
          <p className="py-10 text-muted-foreground">
            No data available for this selection.
          </p>
        )}
        {status === "error" && (
          <p className="py-10 text-destructive">Could not load chart: {errorMessage}</p>
        )}
        {status === "ready" && (
          <PlotlyChart {...plotly} />
        )}
      </CardContent>
    </Card>
  );
}
