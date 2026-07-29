"use client";

/**
 * PresetSection.js — the "what question are you asking?" preset picker.
 *
 * Extracted from ChartSidebar.js unchanged. Presets are unwired from the module
 * workbench (overhaul decision 6) and kept for the standalone Visualization
 * Tool, so this section is not registered in `sidebarSections.js`; the wizard's
 * Edit step mounts it directly.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Chart configuration from ChartConfigProvider
 *   - lib/visualization/presetRegistry.js
 *
 * UI Kit reference:
 *   - Implements the sidebar single-select list pattern (see primitives.js)
 */

import React from "react";

import { OptionList } from "@/components/chart-builder/sections/primitives";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { PRESET_ORDER, PRESETS } from "@/lib/visualization/presetRegistry";

export default function PresetSection() {
  const { config, dispatch } = useChartConfig();
  return (
    <div className="grid gap-2">
      <OptionList
        ariaLabel="Preset"
        value={config.preset}
        onChange={(preset) => dispatch({ type: "SET_PRESET", preset })}
        options={PRESET_ORDER.map((id) => ({ value: id, label: PRESETS[id].title }))}
      />
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        {PRESETS[config.preset]?.question}
      </p>
    </div>
  );
}
