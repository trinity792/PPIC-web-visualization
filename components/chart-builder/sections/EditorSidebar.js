"use client";

/**
 * EditorSidebar.js — the section accordion plus the capability-gated tools,
 * shared by both editor shells (Workstream F).
 *
 * `ModuleSidebar` and the wizard's `EditStep` both mount this; they differ
 * only in the capability set they wrap it in (`EditorCapabilitiesProvider`)
 * and the `only` / `exclude` / `sectionProps` they pass. Presets, saved
 * views, trace layers, and the activity log render only when their
 * capability is true AND Advanced Mode is on — a capability says a block may
 * exist at all (a fact about the surface); Advanced Mode says this reader
 * wants to see it right now.
 *
 * Props:
 *   only         {Array<string>} — restrict the registry to these section values
 *   exclude      {Array<string>} — drop these section values
 *   sectionProps {Object}        — extra props by section value (e.g. the
 *                                  Chart Type section's `grouped`, the
 *                                  Outcome section's `allowLayers`)
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *   - lib/visualization/sidebarSections.js (the registry)
 *   - components/chart-builder/editorCapabilities.js (what this surface supports)
 *   - components/chart-builder/advancedMode.js (whether the reader wants it now)
 *
 * UI Kit reference:
 *   - Implements the "Editor Sidebar" accordion pattern, plus the pill-action
 *     patterns for the gated tools
 */

/* eslint-disable react/prop-types */

import React from "react";

import { Plus } from "lucide-react";

import { FooterActions } from "@/components/chart-builder/ChartSidebar";
import { ExportConfigButton } from "@/components/chart-builder/ConfigActions";
import EditorActivityLog from "@/components/chart-builder/EditorActivityLog";
import LayerEditor from "@/components/chart-builder/LayerEditor";
import ValidationNotice from "@/components/chart-builder/ValidationNotice";
import { useAdvancedMode } from "@/components/chart-builder/advancedMode";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { useEditorCapabilities } from "@/components/chart-builder/editorCapabilities";
import { Section } from "@/components/chart-builder/sections/primitives";
import PresetSection from "@/components/chart-builder/sections/PresetSection";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { visibleSectionsFor } from "@/lib/visualization/sidebarSections";

export default function EditorSidebar({ only, exclude, sectionProps = {} }) {
  const { config, schema } = useChartConfig();
  const { advanced } = useAdvancedMode();
  const capabilities = useEditorCapabilities();
  const sections = visibleSectionsFor(config, schema, { only, exclude });

  // A capability is a rule, not a tier: it must be true even before Advanced
  // Mode is considered, and Advanced Mode alone (with the capability absent)
  // must never be enough either.
  const shows = (capability) => capabilities[capability] && advanced;

  return (
    <div className="grid gap-2">
      <ValidationNotice />
      <Accordion
        type="multiple"
        // Keyed on the section list so a chart-type switch that reveals a new
        // section mounts it expanded rather than collapsed and easy to miss.
        key={sections.map((section) => section.value).join("|")}
        defaultValue={sections.map((section) => section.value)}
        className="grid gap-1"
      >
        {sections.map(({ value, label, Component }) => (
          <Section key={value} value={value} label={label}>
            <Component {...(sectionProps[value] || {})} />
          </Section>
        ))}
      </Accordion>

      {shows("presets") ? (
        <div className="grid gap-2 rounded-lg border bg-card p-3">
          <PresetSection />
        </div>
      ) : null}

      {shows("layers") ? (
        <LayerEditor
          trigger={
            <Button type="button" variant="outline" className="w-full gap-1.5">
              <Plus aria-hidden="true" />
              Add line
            </Button>
          }
        />
      ) : null}

      {shows("savedViews") ? (
        <div className="grid gap-2">
          <FooterActions />
          <ExportConfigButton />
        </div>
      ) : null}

      {shows("activityLog") ? <EditorActivityLog /> : null}
    </div>
  );
}
