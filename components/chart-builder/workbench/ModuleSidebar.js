"use client";

/**
 * ModuleSidebar.js — the module workbench's persistent control rail.
 *
 * Workstream F split this in two: this file owns only the height clamp (the
 * `<aside>` and its classes below) — the panel *contents* (the section
 * accordion, and the capability-gated tools) live in the shared
 * `sections/EditorSidebar.js`, which the wizard's Edit step mounts too. The
 * capability set it supplies is `WORKBENCH_CAPABILITIES`, owned by
 * `editorCapabilities.js` because `ModuleWorkbench` provides the same set for
 * the whole grid and two copies of one fact drift silently.
 *
 * Height behavior (the requirement: "sidebar the same length as the chart view,
 * with vertical scroll"). On desktop the panel is absolutely positioned inside a
 * `lg:relative` grid cell, so it contributes ZERO intrinsic height to the grid
 * row. The row is therefore sized entirely by the chart container beside it, the
 * cell stretches to match, and any overflow scrolls inside this panel rather
 * than lengthening the page. Below `lg` the panel is `static`, taking its
 * natural height in the stacked layout — an internally scrolling 400px rail on a
 * phone would be worse than a long page.
 *
 * > This depends on the parent grid stretching its items, which is the default
 * > and which `ModuleWorkbench` must not override. Adding `items-start` there
 * > collapses this cell to zero height and takes the whole sidebar with it.
 *
 * Props:
 *   None (reads useChartConfig()).
 *
 * Advanced Mode and the capability set come from the `*Boundary` variants
 * (`AdvancedModeBoundary`, `EditorCapabilitiesBoundary`), not the plain
 * providers: since F4 this panel is one of several siblings under
 * `ModuleWorkbench` — the workspace bar and the chart container are the others
 * — rather than the only consumer. `ModuleWorkbench` wraps them all in one real
 * provider so every sibling reads the same two flags; the boundary only steps
 * in and creates its own when this component is mounted on its own, as its unit
 * tests do.
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *   - lib/visualization/sidebarSections.js (which sections apply)
 *   - components/chart-builder/advancedMode.js (the Advanced Mode flag)
 *
 * UI Kit reference:
 *   - Implements the "Editor Sidebar" pattern
 */

import React from "react";

import {
  AdvancedModeBoundary,
  AdvancedModeToggle,
} from "@/components/chart-builder/advancedMode";
import {
  EditorCapabilitiesBoundary,
  WORKBENCH_CAPABILITIES,
} from "@/components/chart-builder/editorCapabilities";
import EditorSidebar from "@/components/chart-builder/sections/EditorSidebar";

export default function ModuleSidebar() {
  return (
    <EditorCapabilitiesBoundary capabilities={WORKBENCH_CAPABILITIES}>
      <AdvancedModeBoundary>
        <SidebarPanel />
      </AdvancedModeBoundary>
    </EditorCapabilitiesBoundary>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

/** The panel itself, split out only so the provider can wrap it. */
function SidebarPanel() {
  return (
    <div className="min-w-0 lg:relative">
      <aside
        aria-label="Chart controls"
        // `static` + `lg:absolute inset-0` is the height clamp described above.
        // The unprefixed utilities must stay off this element: an always-absolute
        // panel would collapse the stacked mobile layout.
        className="static min-w-0 rounded-xl border bg-background p-4 shadow-xs lg:absolute lg:inset-0 lg:overflow-y-auto"
      >
        <div className="grid gap-2">
          <AdvancedModeToggle id="module-advanced-mode" />
          <EditorSidebar />
        </div>
      </aside>
    </div>
  );
}
