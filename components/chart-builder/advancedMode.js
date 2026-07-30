"use client";

/**
 * advancedMode.js — the Advanced Mode switch shared by both chart editors.
 *
 * A single boolean, held per editor shell, that hides the controls a reader only
 * needs occasionally. It is deliberately NOT the old three-tier registry
 * (`.trash/settingsTiers.js`), which gated dozens of controls from a central
 * table and mostly meant a user could not find a control they had been told
 * about. Here each section decides for itself what it hides, and today exactly
 * one thing does: the Ranked values block in Geographic Level and Categories.
 *
 * The flag is editor state, not chart state: it never reaches `config`, is not
 * serialized into a saved view, and does not survive a reload.
 *
 * Exports:
 *   AdvancedModeProvider — holds the flag for one editor shell
 *   useAdvancedMode()    — { advanced } for sections deciding what to render
 *   AdvancedModeToggle   — the switch itself; must sit inside the provider
 *
 * Data sources:
 *   - None (component state)
 *
 * UI Kit reference:
 *   - Implements the label + switch pattern
 */

/* eslint-disable react/prop-types */

import React, { createContext, useContext, useMemo, useState } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/components/ui/utils";

const AdvancedModeContext = createContext(null);

/**
 * Without a provider there is no switch on screen, and a control no switch can
 * reveal is a control nobody can reach. So the fallback shows everything: a
 * surface that forgets the provider renders an extra block, rather than losing
 * one silently.
 */
const ALWAYS_VISIBLE = Object.freeze({ advanced: true, setAdvanced: () => {} });

export function AdvancedModeProvider({ defaultAdvanced = false, children }) {
  const [advanced, setAdvanced] = useState(defaultAdvanced);
  const value = useMemo(() => ({ advanced, setAdvanced }), [advanced]);

  return (
    <AdvancedModeContext.Provider value={value}>
      {children}
    </AdvancedModeContext.Provider>
  );
}

export function useAdvancedMode() {
  return useContext(AdvancedModeContext) || ALWAYS_VISIBLE;
}

/**
 * Props:
 *   id        {string} — input id, unique per surface
 *   className {string} — layout classes from the shell that places it
 */
export function AdvancedModeToggle({ id = "advanced-mode", className }) {
  const context = useContext(AdvancedModeContext);
  if (!context) {
    throw new Error("AdvancedModeToggle must be used inside AdvancedModeProvider.");
  }
  const { advanced, setAdvanced } = context;

  return (
    <div className={cn("flex items-center justify-end gap-2", className)}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        Advanced mode
      </Label>
      <Switch
        id={id}
        checked={advanced}
        onCheckedChange={(checked) => setAdvanced(checked === true)}
      />
    </div>
  );
}

export default AdvancedModeProvider;
