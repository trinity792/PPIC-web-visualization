"use client";

/**
 * EditStep.js — the standalone Visualization Tool's "Edit" step.
 *
 * Workstream F: mounts the shared `EditorSidebar` (`sections/EditorSidebar.js`),
 * the same accordion-plus-gated-tools component the module workbench mounts —
 * a control added for one surface now appears on the other without being
 * re-authored, and the two cannot drift into different answers for the same
 * setting. What used to be a bespoke preset accordion, an unconditional
 * export button, and an always-visible activity log are now the shared
 * component's `presets` / `savedViews` / `activityLog` capability blocks,
 * gated on Advanced Mode like everything else there.
 *
 * What still sets this shell apart from the module workbench:
 *   - its own capability set (`STANDALONE_CAPABILITIES`) — presets, saved
 *     views, trace layers, and the activity log are standalone-tool-only,
 *     with no module-workbench equivalent (see `ModuleSidebar`'s doc comment
 *     for why per capability); multi-chart applies to both.
 *   - the shared Outcome section's line-layer action (`allowLayers`).
 *   - `CategoriesSection`, mounted directly: bring-your-own-data has no
 *     geography at all, so `GeographySection` — which normally owns this
 *     fallback for a schema that does have subsets — never renders to carry it.
 *
 * What used to be here and is gone entirely: the GUI ⇄ Code toggle (decision 5).
 *
 * Advanced Mode is one boolean, scoped to this step so the switch and
 * everything it gates stay together.
 *
 * Props:
 *   (none — reads useChartConfig())
 *
 * Data sources:
 *   - components/chart-builder/sections/EditorSidebar.js (the shared sidebar)
 *   - components/chart-builder/sections/CategoriesSection.js
 */

import React from "react";

import {
  AdvancedModeProvider,
  AdvancedModeToggle,
} from "@/components/chart-builder/advancedMode";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import {
  EditorCapabilitiesProvider,
  STANDALONE_CAPABILITIES,
} from "@/components/chart-builder/editorCapabilities";
import CategoriesSection from "@/components/chart-builder/sections/CategoriesSection";
import EditorSidebar from "@/components/chart-builder/sections/EditorSidebar";
import { ScrollArea } from "@/components/ui/scroll-area";

import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";
import StepShell from "@/components/chart-builder/wizard/StepShell";

// Presets, saved views, trace layers, and the activity log are all
// standalone-tool-only: a preset seeds bindings from a module's curated field
// catalog that bring-your-own-data does not have (applying one would clear
// the bindings autoMapInlineBindings just derived from the pasted columns),
// and the rest have simply never had a module-side equivalent.
// Comparison layers are likewise a standalone-tool feature, so only this
// surface opts the shared Outcome section into it. Chart Type takes no props
// here: it renders the module workbench's flat tile grid, unchanged.
const SECTION_PROPS = {
  axis: { allowLayers: true },
};

export default function EditStep() {
  return (
    <EditorCapabilitiesProvider capabilities={STANDALONE_CAPABILITIES}>
      <AdvancedModeProvider>
        <EditStepBody />
      </AdvancedModeProvider>
    </EditorCapabilitiesProvider>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

/** The step's own content, split out only so the providers can wrap it. */
function EditStepBody() {
  const { schema } = useChartConfig();
  // Bring-your-own-data has no geography, so GeographySection — which normally
  // owns the category ordering fallback — never renders. Mount it directly.
  const needsCategories = Object.keys(schema?.subsets || {}).length === 0;

  return (
    <StepShell title="Edit" preview={<PreviewPane />}>
      <div className="grid min-h-0 min-w-0 gap-3 lg:h-full lg:grid-rows-[auto_minmax(0,1fr)]">
        {/* Import lives on the Import step, where a config arrives alongside
            the data; export config lives inside EditorSidebar below now,
            gated with the rest of the saved-view tools. */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <AdvancedModeToggle id="standalone-advanced-mode" />
        </div>
        <ScrollArea className="h-[calc(100svh-24rem)] w-full min-w-0 pr-2 lg:h-full">
          <div className="grid gap-3">
            <EditorSidebar sectionProps={SECTION_PROPS} />
            {needsCategories ? <CategoriesSection /> : null}
          </div>
        </ScrollArea>
      </div>
    </StepShell>
  );
}
