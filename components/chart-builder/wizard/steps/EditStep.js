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
 *   - a View Chart / Edit Data toggle below the preview (EditPreview.js), so a
 *     misread table is fixed beside its chart (import overhaul, phase 4).
 *   - a one-line note above the sidebar saying why the tool chose the chart a
 *     pasted table opened on (dataset-range plan, workstream 5); it is derived
 *     by ranking the table again, so nothing about it is saved, and it goes
 *     away once the reader picks another chart type.
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

import React, { useMemo } from "react";

import {
  AdvancedModeProvider,
  AdvancedModeToggle,
} from "@/components/chart-builder/advancedMode";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { inlineTableOf } from "@/lib/visualization/inlineQuestion";
import { profileTable, rankInlineCharts } from "@/lib/visualization/inlineProfile";
import {
  EditorCapabilitiesProvider,
  STANDALONE_CAPABILITIES,
} from "@/components/chart-builder/editorCapabilities";
import CategoriesSection, { hasCategories } from "@/components/chart-builder/sections/CategoriesSection";
import EditorSidebar from "@/components/chart-builder/sections/EditorSidebar";
import { ScrollArea } from "@/components/ui/scroll-area";

import EditPreview from "@/components/chart-builder/wizard/EditPreview";
import { EditDataProvider, useEditData } from "@/components/chart-builder/wizard/EditDataContext";
import { Button } from "@/components/ui/button";
import StepShell from "@/components/chart-builder/wizard/StepShell";

// Presets, saved views, trace layers, and the activity log are all
// standalone-tool-only: a preset seeds bindings from a module's curated field
// catalog that bring-your-own-data does not have (applying one would clear
// the bindings autoMapInlineBindings just derived from the pasted columns),
// and the rest have simply never had a module-side equivalent.
// Chart Type takes no props here: it renders the module workbench's flat tile
// grid, unchanged. (Trace layers, which this surface used to opt the Outcome
// section into, left with the v3 cutover.)
const SECTION_PROPS = {};

export default function EditStep() {
  return (
    <EditorCapabilitiesProvider capabilities={STANDALONE_CAPABILITIES}>
      <AdvancedModeProvider>
        {/* View Chart / Edit Data, and the "Fix in data" links that open it. */}
        <EditDataProvider>
          <EditStepBody />
        </EditDataProvider>
      </AdvancedModeProvider>
    </EditorCapabilitiesProvider>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

/**
 * Why a pasted table opened on its chart: the top-ranked candidate's reason,
 * shown while that is still the chart drawn.
 */
function ChartChoiceNote({ config }) {
  const table = config.question?.dataset?.kind === "inline" ? inlineTableOf(config) : null;
  const top = useMemo(() => (table ? rankInlineCharts(profileTable(table))[0] : null), [table]);
  const edit = useEditData();
  if (!top || top.chartType !== config.presentation?.chartType) return null;
  return (
    <p className="text-xs leading-snug text-muted-foreground">
      {top.reason}
      {edit ? (
        <>
          {" "}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => edit.openData()}
          >
            Not right? Edit data
          </Button>
        </>
      ) : null}
    </p>
  );
}

/** The step's own content, split out only so the providers can wrap it. */
function EditStepBody() {
  const { config, schema } = useChartConfig();
  // Bring-your-own-data has no geography, so GeographySection — which normally
  // owns the category ordering fallback — never renders. Mount it directly.
  // The fallback reads the preview's feedback (`categoryNames`). A v2 chart
  // always offers it; a v3 chart only once the preview has named categories to
  // list, which the pie does (renderer plan K).
  const needsCategories =
    Object.keys(schema?.subsets || {}).length === 0 &&
    (config.version !== 3 || hasCategories(config));

  return (
    <StepShell title="Edit" preview={<EditPreview />}>
      <div className="grid min-h-0 min-w-0 gap-3 lg:h-full lg:grid-rows-[auto_minmax(0,1fr)]">
        {/* Import lives on the Import step, where a config arrives alongside
            the data; export config lives inside EditorSidebar below now,
            gated with the rest of the saved-view tools. */}
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <AdvancedModeToggle id="standalone-advanced-mode" />
          </div>
          <ChartChoiceNote config={config} />
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
