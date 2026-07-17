"use client";

/**
 * EditStep.js — wizard step "Edit": the GUI ⇄ Code toggle, the Advanced Mode
 * switch, and the chart-type/tier-gated editor sections (Date Range, Encodings,
 * Comparisons, Labels, Appearance — plus Data Sources when there is no separate
 * Import step, i.e. the module editor). All of these are the existing
 * chart-builder components, re-laid-out for the wizard.
 *
 * Data sources:
 *   - components/chart-builder/ChartSidebar.js (SidebarSections, exported)
 *   - components/chart-builder/EditorModeToggle.js
 *   - components/chart-builder/CodeEditorPanel.js
 */

import React, { useEffect, useState } from "react";

import CodeEditorPanel from "@/components/chart-builder/CodeEditorPanel";
import EditorModeToggle from "@/components/chart-builder/EditorModeToggle";
import ValidationNotice from "@/components/chart-builder/ValidationNotice";
import { SidebarSections } from "@/components/chart-builder/ChartSidebar";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isVisible } from "@/lib/visualization/settingsTiers";

import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";
import StepShell from "@/components/chart-builder/wizard/StepShell";

const EDITOR_MODE_KEY = "chartEditorMode";

// Sections owned by the Edit step. Data Sources is appended for the module
// editor (no Import step); Presets and Graph Type live in the Chart Type step.
const EDIT_SECTIONS = ["date-range", "encodings", "comparison", "labels", "appearance"];

export default function EditStep() {
  const { config, dispatch } = useChartConfig();
  const [mode, setMode] = useState("gui");

  // Restore persisted mode after hydration (shared key with the old editor).
  useEffect(() => {
    const saved = window.localStorage.getItem(EDITOR_MODE_KEY);
    if (saved === "gui" || saved === "code") setMode(saved);
  }, []);
  useEffect(() => {
    window.localStorage.setItem(EDITOR_MODE_KEY, mode);
  }, [mode]);

  // Drop back to GUI if a tier change hides code mode (gated at "moderate"+).
  useEffect(() => {
    if (mode === "code" && !isVisible("codeEditor", config.tier)) setMode("gui");
  }, [config.tier, mode]);

  const only = ["data-sources", ...EDIT_SECTIONS];

  return (
    <StepShell title="Edit" preview={<PreviewPane />}>
      <div className="grid min-h-0 min-w-0 gap-3">
        <EditorModeToggle
          mode={mode}
          onModeChange={setMode}
          tier={config.tier}
          onTierChange={(tier) => dispatch({ type: "SET_TIER", tier })}
        />
        <ValidationNotice />
        <ScrollArea className="h-[calc(100svh-24rem)] w-full min-w-0 pr-2">
          {mode === "code" ? <CodeEditorPanel /> : <SidebarSections only={only} />}
        </ScrollArea>
      </div>
    </StepShell>
  );
}
