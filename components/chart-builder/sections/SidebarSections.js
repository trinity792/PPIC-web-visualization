"use client";

/**
 * SidebarSections.js — the section accordion shared by both editor shells.
 *
 * Renders whichever sections `visibleSectionsFor` reports for the current chart
 * type and schema. The module workbench and the standalone Visualization Tool's
 * Edit step both mount this; they differ only in the `only` / `exclude` filter
 * they pass.
 *
 * Props:
 *   only         {Array<string>} — restrict to these section values
 *   exclude      {Array<string>} — drop these section values
 *   sectionProps {Object}        — extra props by section value, for the few
 *                                  controls one shell offers and the other does
 *                                  not (e.g. the wizard's line layers)
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *   - lib/visualization/sidebarSections.js (the registry)
 *
 * UI Kit reference:
 *   - Implements the "Editor Sidebar" accordion pattern
 */

import React from "react";

import { Accordion } from "@/components/ui/accordion";

import { Section } from "@/components/chart-builder/sections/primitives";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { visibleSectionsFor } from "@/lib/visualization/sidebarSections";

export default function SidebarSections({ only, exclude, sectionProps = {} }) {
  const { config, schema } = useChartConfig();
  const sections = visibleSectionsFor(config, schema, { only, exclude });

  return (
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
  );
}

export { SidebarSections };
