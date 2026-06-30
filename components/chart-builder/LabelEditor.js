"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deriveLabels } from "@/lib/visualization/deriveLabels";
import { useChartConfig } from "./chartConfigStore";

const LABELS = [
  ["title", "Title"],
  ["subtitle", "Subtitle"],
  ["xAxis", "X-axis label"],
  ["yAxis", "Y-axis label"],
  ["legend", "Legend title"],
];

export default function LabelEditor() {
  const { config, dispatch, schema } = useChartConfig();
  // Live auto-labels the graph would use; shown as placeholders until the user
  // types their own.
  const auto = deriveLabels(config, schema);

  return (
    <div className="grid gap-4">
      {LABELS.map(([key, label]) => (
        <div className="grid gap-2" key={key}>
          <Label htmlFor={`label-${key}`}>{label}</Label>
          <Input
            id={`label-${key}`}
            value={config.labels[key] || ""}
            placeholder={auto[key] || ""}
            onChange={(event) =>
              dispatch({ type: "SET_LABEL", key, value: event.target.value })
            }
          />
        </div>
      ))}
      <div className="grid gap-2">
        <Label htmlFor="label-tooltip">Tooltip template</Label>
        <Textarea
          id="label-tooltip"
          value={config.labels.tooltip || ""}
          placeholder="Leave blank for the chart default"
          onChange={(event) =>
            dispatch({
              type: "SET_LABEL",
              key: "tooltip",
              value: event.target.value,
            })
          }
        />
      </div>
    </div>
  );
}
