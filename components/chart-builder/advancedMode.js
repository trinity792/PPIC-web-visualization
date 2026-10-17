"use client";

/**
 * advancedMode.js — the Advanced Mode switch shared by both chart editors.
 *
 * A boolean, held per editor shell, that hides the controls a reader only
 * needs occasionally. It is deliberately NOT the old three-tier registry
 * (`.trash/settingsTiers.js`), which gated dozens of controls from a central
 * table and mostly meant a user could not find a control they had been told
 * about. Here each section decides for itself what it hides, such as ranked
 * geography controls, custom color composition, and per-series legend editing.
 *
 * The flag and the mouse-hover preference are editor state: neither reaches
 * `config`, is serialized into a saved view, or survives a reload.
 *
 * Exports:
 *   AdvancedModeProvider — holds the flag for one editor shell
 *   useAdvancedMode()    — Advanced Mode and mouse-hover session preferences
 *   AdvancedModeToggle   — the switch itself; must sit inside the provider
 *   AdvancedModeBoundary — provides only where no ancestor already does
 *                          (Workstream F4; see its own doc comment)
 *   EditorOptionsMenu   — shared three-dot menu for session preferences
 *
 * Data sources:
 *   - None (component state)
 *
 * UI Kit reference:
 *   - Implements the label + switch and dropdown-menu patterns
 */

import React, { createContext, useContext, useMemo, useState } from "react";
import { Ellipsis } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
const ALWAYS_VISIBLE = Object.freeze({ advanced: true, setAdvanced: () => {}, mouseHoverAnimations: true, setMouseHoverAnimations: () => {} });

export function AdvancedModeProvider({ defaultAdvanced = false, children }) {
  const [advanced, setAdvanced] = useState(defaultAdvanced);
  const [mouseHoverAnimations, setMouseHoverAnimations] = useState(true);
  const value = useMemo(() => ({ advanced, setAdvanced, mouseHoverAnimations, setMouseHoverAnimations }), [advanced, mouseHoverAnimations]);

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
 * Session-only chart interaction options, shared by the two preview cards.
 * Props: className {string} — optional positioning classes for the menu button.
 */
export function EditorOptionsMenu({ className }) {
  const { mouseHoverAnimations, setMouseHoverAnimations } = useAdvancedMode();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Editor options" className={cn("size-8 text-muted-foreground", className)}>
          <Ellipsis aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuCheckboxItem
          checked={!mouseHoverAnimations}
          onCheckedChange={(disabled) => setMouseHoverAnimations(disabled !== true)}
          onSelect={(event) => event.preventDefault()}
        >
          Disable mouse hover animations
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A provider that only provides when nothing already does.
 *
 * `ModuleSidebar` needs its own provider so `AdvancedModeToggle` works when the
 * component is rendered on its own (as its unit tests do) — but on the real
 * module workbench (Workstream F4) it is one of several siblings under
 * `ModuleWorkbench` that must read the *same* flag, live, so the switch in the
 * rail governs every block it can reveal. A second, independently-stated
 * provider nested inside the sidebar could never do that: it would shadow the
 * ancestor for the sidebar's own subtree and leave its siblings reading a
 * different instance entirely. `ModuleWorkbench` wraps them all in one real
 * `AdvancedModeProvider`; this component detects that ancestor and steps aside,
 * so the two mounting contexts — standalone and inside the workbench — share
 * one code path.
 */
export function AdvancedModeBoundary({ defaultAdvanced = false, children }) {
  const existing = useContext(AdvancedModeContext);
  if (existing) return children;
  return (
    <AdvancedModeProvider defaultAdvanced={defaultAdvanced}>
      {children}
    </AdvancedModeProvider>
  );
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
