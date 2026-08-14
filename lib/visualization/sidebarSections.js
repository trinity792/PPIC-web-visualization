/**
 * sidebarSections.js — the graph-editor sidebar section registry.
 *
 * Single source of truth for which control sections exist, in what order, and
 * when each one applies. Both editor shells compose from this list: the module
 * workbench renders the whole thing, and the standalone Visualization Tool's
 * Edit step renders a subset (see `only` / `exclude`).
 *
 * A section is gated by at most two predicates:
 *   - `key`  — the chart-type descriptor must list this key in `sidebarSections`
 *              (chartRegistry.js), i.e. the current chart actually uses it.
 *   - `when` — (config, schema) => boolean, for sections that depend on what the
 *              module's schema supplies rather than on the chart type.
 * A section with neither always renders.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any server-only
 * module.
 *
 * Exports:
 *   SIDEBAR_SECTIONS   — ordered section descriptors { value, label, Component }
 *   visibleSectionsFor — which of them apply, in registry order
 *
 * Data sources:
 *   - lib/visualization/chartRegistry.js (per-chart-type `sidebarSections`)
 */

import AppearanceSection from "@/components/chart-builder/sections/AppearanceSection";
import ChartTypeSection from "@/components/chart-builder/sections/ChartTypeSection";
import DatasetsSection, {
  hasDatasetControls,
} from "@/components/chart-builder/sections/DatasetsSection";
import DateRangeSection, {
  hasTemporalData,
} from "@/components/chart-builder/sections/DateRangeSection";
import GeographySection, {
  hasGeographicSubsets,
} from "@/components/chart-builder/sections/GeographySection";
import LabelsSection from "@/components/chart-builder/sections/LabelsSection";
import OutcomeSection from "@/components/chart-builder/sections/OutcomeSection";
import { hasTransformControls } from "@/components/chart-builder/sections/TransformSection";
import TypographySection from "@/components/chart-builder/sections/TypographySection";
import { getChartType } from "@/lib/visualization/chartRegistry";

/**
 * Outcome owns both encoding choices and the former Transform block. Keep it
 * available when either kind of control has something to render. The second
 * branch matters for stratified data tables: they have no chart encodings, but
 * their row filters still belong in Outcome.
 */
function hasOutcomeControls(config, schema) {
  const chartSections = getChartType(config.chartType)?.sidebarSections || [];
  return chartSections.includes("encodings") || hasTransformControls(config, schema);
}

/** The sections, top to bottom, in the order the July 2026 mockups list them. */
export const SIDEBAR_SECTIONS = Object.freeze([
  {
    value: "datasets",
    label: "Datasets",
    Component: DatasetsSection,
    when: hasDatasetControls,
  },
  {
    value: "chart-type",
    label: "Chart Type",
    Component: ChartTypeSection,
  },
  {
    // Value stays "axis" (not renamed to "outcome"): sidebarSections.test.js
    // and other only/exclude callers key on this literal value. Moved to
    // directly follow Chart Type (audit follow-up, 2026-07-30): Outcome's
    // remaining dropdowns and its implied-role hints are answers *to* the
    // chart type, so the section reads better right beside the control that
    // decides it than after Date Range and Geographic Level.
    value: "axis",
    label: "Outcome",
    Component: OutcomeSection,
    when: hasOutcomeControls,
  },
  {
    value: "date-range",
    label: "Date Range",
    Component: DateRangeSection,
    when: hasTemporalData,
  },
  {
    value: "geography",
    label: "Geographic Level",
    Component: GeographySection,
    when: hasGeographicSubsets,
  },
  {
    value: "labels",
    label: "Labels",
    Component: LabelsSection,
    key: "labels",
  },
  {
    value: "appearance",
    label: "Appearance",
    Component: AppearanceSection,
    key: "appearance",
  },
  {
    value: "typography",
    label: "Typography",
    Component: TypographySection,
    // Typography is a facet of appearance, so it follows the same chart-type
    // gate: a chart with no styling surface has no type scale to set either.
    key: "appearance",
  },
]);

/**
 * Which sections apply to the current chart type and schema, in registry order.
 *
 * @param {object} config  the declarative chart configuration
 * @param {object} schema  the module (or byod) schema
 * @param {{only?: string[], exclude?: string[]}} [options] restrict the result to
 *   specific section values, or drop specific ones; registry order is preserved
 *   either way, so callers never control ordering by argument order.
 */
export function visibleSectionsFor(config, schema, { only, exclude } = {}) {
  const chartSections = getChartType(config.chartType)?.sidebarSections || [];
  return SIDEBAR_SECTIONS.filter((section) => {
    if (only && !only.includes(section.value)) return false;
    if (exclude && exclude.includes(section.value)) return false;
    if (section.key && !chartSections.includes(section.key)) return false;
    if (section.when && !section.when(config, schema)) return false;
    return true;
  });
}
