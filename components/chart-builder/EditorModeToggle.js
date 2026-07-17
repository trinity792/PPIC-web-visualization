"use client";

/**
 * EditorModeToggle.js — GUI/Code mode switch plus the Advanced Mode toggle,
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { isVisible } from "@/lib/visualization/settingsTiers";

/**
 * Boolean Advanced Mode switch. The standard editor maps to the moderate tier
 * and Advanced Mode maps to the advanced tier. The underlying tier values are
 * retained for compatibility with saved chart specs.
 */
export function AdvancedModeToggle({ tier, onTierChange }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <Label htmlFor="advanced-editor-mode">Advanced Mode</Label>
      <Switch
        id="advanced-editor-mode"
        checked={tier === "advanced"}
        onCheckedChange={(checked) => onTierChange(checked ? "advanced" : "moderate")}
      />
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
      <AdvancedModeToggle tier={tier} onTierChange={onTierChange} />
    </div>
  );
}
