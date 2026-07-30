"use client";

/**
 * ModuleSidebar.js — the module workbench's persistent control rail.
 *
 * Renders the validation notice and every applicable section from the shared
 * registry. It deliberately carries none of the wizard-only tooling (presets,
 * saved views, the multi-chart toolbar, the activity log): those stay in the
 * standalone Visualization Tool.
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
 * Advanced Mode is scoped here rather than to the whole workbench, because the
 * switch and everything it governs are both in this panel; the chart container
 * has nothing to hide.
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

import { Accordion } from "@/components/ui/accordion";

import ValidationNotice from "@/components/chart-builder/ValidationNotice";
import {
  AdvancedModeProvider,
  AdvancedModeToggle,
} from "@/components/chart-builder/advancedMode";
import { Section } from "@/components/chart-builder/sections/primitives";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { visibleSectionsFor } from "@/lib/visualization/sidebarSections";

export default function ModuleSidebar() {
  return (
    <AdvancedModeProvider>
      <SidebarPanel />
    </AdvancedModeProvider>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

/** The panel itself, split out only so the provider can wrap it. */
function SidebarPanel() {
  const { config, schema } = useChartConfig();
  const sections = visibleSectionsFor(config, schema);

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
          <ValidationNotice />
          <Accordion
            type="multiple"
            defaultValue={sections.map((section) => section.value)}
            className="grid gap-1"
          >
            {sections.map(({ value, label, Component }) => (
              <Section key={value} value={value} label={label}>
                <Component />
              </Section>
            ))}
          </Accordion>
        </div>
      </aside>
    </div>
  );
}
