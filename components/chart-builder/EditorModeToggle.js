"use client";

/**
 * EditorModeToggle.js — GUI/Code mode switch plus the settings-tier toggle,
 * rendered above the graph-editor workspace in both modes.
 *
 * Props:
 *   mode         {"gui"|"code"} — active editor mode
 *   onModeChange {Function}     — (mode) => void
 *   tier         {"basic"|"moderate"|"advanced"} — active settings tier
 *   onTierChange {Function}     — (tier) => void
 *
 * Data sources:
 *   - Controlled entirely by props from ModuleEditor
 *
 * UI Kit reference:
 *   - Implements the shared "Tabs" and grouped-toggle patterns
 */

/* eslint-disable react/prop-types */

import React from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { hiddenCount, isVisible, TIERS } from "@/lib/visualization/settingsTiers";

const TIER_LABELS = { basic: "Basic", moderate: "Moderate", advanced: "Advanced" };

/**
 * Settings-tier switch (Basic / Moderate / Advanced). Filters which sidebar
 * sections render; never changes the config's effect (a value set at
 * Advanced still applies at Basic). Moved out of ChartSidebar.js (overhaul
 * Phase 3) so it renders in exactly one place, above the workspace, visible
 * in both GUI and Code mode.
 */
export function TierToggle({ tier, onTierChange }) {
  const hidden = hiddenCount(tier);

  return (
    <div className="grid gap-1">
      <ToggleGroup
        type="single"
        value={tier}
        onValueChange={(next) => next && onTierChange(next)}
        className="w-full justify-center"
        aria-label="Settings level"
      >
        {TIERS.map((tierId) => (
          <ToggleGroupItem key={tierId} value={tierId} className="flex-1 text-xs">
            {TIER_LABELS[tierId]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {hidden > 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          {hidden} more {hidden === 1 ? "setting" : "settings"} in{" "}
          {tier === "basic" ? "Moderate / Advanced" : "Advanced"}
        </p>
      ) : null}
    </div>
  );
}

export default function EditorModeToggle({ mode, onModeChange, tier, onTierChange }) {
  const codeVisible = isVisible("codeEditor", tier);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-2">
      <Tabs value={mode} onValueChange={onModeChange}>
        <TabsList aria-label="Editor mode">
          <TabsTrigger value="gui">GUI</TabsTrigger>
          {codeVisible ? <TabsTrigger value="code">Code</TabsTrigger> : null}
        </TabsList>
      </Tabs>
      <div className="w-full max-w-64 sm:w-56">
        <TierToggle tier={tier} onTierChange={onTierChange} />
      </div>
    </div>
  );
}
