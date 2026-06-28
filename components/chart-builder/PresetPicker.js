"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PRESET_ORDER,
  PRESETS,
} from "@/lib/visualization/presetRegistry";
import { useChartConfig } from "./chartConfigStore";

export default function PresetPicker() {
  const { config, dispatch } = useChartConfig();

  return (
    <div className="grid gap-2">
      <Label htmlFor="chart-preset">Preset</Label>
      <Select
        value={config.preset}
        onValueChange={(preset) => dispatch({ type: "SET_PRESET", preset })}
      >
        <SelectTrigger id="chart-preset">
          <SelectValue placeholder="Choose an analytical task" />
        </SelectTrigger>
        <SelectContent>
          {PRESET_ORDER.map((id) => (
            <SelectItem key={id} value={id}>
              {PRESETS[id].title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {PRESETS[config.preset]?.question}
      </p>
    </div>
  );
}
