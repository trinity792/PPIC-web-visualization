"use client";

/**
 * EditStep.js — the standalone Visualization Tool's "Edit" step.
 *
 * Renders every section in the shared registry (`lib/visualization/sidebarSections.js`)
 * except Chart Type, which is the wizard's own step. Composing from the same
 * registry the module workbench uses is the point: a control added for one
 * surface appears on the other without being re-authored, and the two cannot
 * drift into different answers for the same setting.
 *
 * What is here and not in the module sidebar is what decision 6 keeps for the
 * standalone tool: presets, the line-layer action, config export, and the editor
 * activity log. (Config *import* sits on the Import step, where a saved config
 * arrives alongside the data.) What used to be here and is gone entirely: the
 * GUI ⇄ Code toggle and the Basic/Moderate/Advanced switch (decision 5).
 *
 * Props:
 *   (none — reads useChartConfig())
 *
 * Data sources:
 *   - components/chart-builder/sections/SidebarSections.js (the shared registry)
 *   - components/chart-builder/sections/PresetSection.js
 *   - components/chart-builder/ConfigActions.js
 */

import React from "react";

import { ExportConfigButton } from "@/components/chart-builder/ConfigActions";
import EditorActivityLog from "@/components/chart-builder/EditorActivityLog";
import ValidationNotice from "@/components/chart-builder/ValidationNotice";
import CategoriesSection from "@/components/chart-builder/sections/CategoriesSection";
import PresetSection from "@/components/chart-builder/sections/PresetSection";
import SidebarSections from "@/components/chart-builder/sections/SidebarSections";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { Accordion } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Section } from "@/components/chart-builder/sections/primitives";
import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";
import StepShell from "@/components/chart-builder/wizard/StepShell";

// Chart Type is the wizard's own step here, so the Edit step renders every
// other registered section (overhaul decision 10).
const SECTION_FILTER = { exclude: ["chart-type"] };

// Comparison layers are a standalone-tool feature, so the shared Axis section is
// opted into its "Add line" action here and nowhere else.
const SECTION_PROPS = { axis: { allowLayers: true } };

export default function EditStep() {
  const { schema } = useChartConfig();
  // Bring-your-own-data has no geography, so GeographySection — which normally
  // owns the category ordering fallback — never renders. Mount it directly.
  const needsCategories = Object.keys(schema?.subsets || {}).length === 0;
  // A preset seeds bindings from a module's curated field catalog. Bring-your-
  // own-data has an empty catalog, so applying one would clear the bindings
  // `autoMapInlineBindings` just derived from the pasted columns — which is the
  // same job, done from the data that actually exists.
  const supportsPresets = !schema?.inlineOnly;

  return (
    <StepShell title="Edit" preview={<PreviewPane />}>
      <div className="grid min-h-0 min-w-0 gap-3">
        {/* Import lives on the Import step, where a config arrives alongside the
            data; export lives here, with the chart being built. */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportConfigButton />
        </div>
        <ValidationNotice />
        <ScrollArea className="h-[calc(100svh-24rem)] w-full min-w-0 pr-2">
          <div className="grid gap-3">
            {/* Presets are the wizard's "ask me a question" entry point; the
                module sidebar drops them (decision 6). */}
            {supportsPresets ? (
              <Accordion
                type="multiple"
                defaultValue={["presets"]}
                className="grid gap-1"
              >
                <Section value="presets" label="Presets">
                  <PresetSection />
                </Section>
              </Accordion>
            ) : null}
            <SidebarSections {...SECTION_FILTER} sectionProps={SECTION_PROPS} />
            {needsCategories ? <CategoriesSection /> : null}
          </div>
        </ScrollArea>
        <EditorActivityLog />
      </div>
    </StepShell>
  );
}
