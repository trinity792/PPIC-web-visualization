/**
 * roleLabels.js — the reader-facing name of each chart binding role.
 *
 * Shared by the Outcome section (its dropdown labels), the validation notice,
 * the preview skeleton, and v3 question readiness (naming the columns a pasted
 * table still needs), so it lives in lib rather than in a component.
 */

import { FIELD_KINDS } from "./fieldTypes";
import { getChartType } from "./chartRegistry";

/**
 * Axis-block labels for the roles the mockup names directly. Anything not listed
 * falls through to the chart-type-aware labels in `roleLabel`.
 */
export const AXIS_LABELS = Object.freeze({
  x: "X-Axis",
  y: "Y-Axis",
  series: "Series",
  color: "Color",
  group: "Group",
});

/** Does this chart type encode a measure as colour, rather than group by one? */
export function colorIsMeasure(chartType) {
  const constraints = getChartType(chartType)?.roleConstraints?.color;
  return Boolean(constraints?.includes(FIELD_KINDS.MEASURE));
}

export function roleLabel(role, chartType) {
  // The dot plot borrows the heatmap's x/y/color roles but reads more naturally
  // with dot-plot-specific labels (rows / dots / plotted value).
  if (chartType === "dotPlot") {
    const dotLabels = { y: "Category (rows)", x: "Series (dots)", color: "Value" };
    if (dotLabels[role]) return dotLabels[role];
  }
  // Forest plot reads as study / CI bounds / estimate / weight.
  if (chartType === "forest") {
    const forestLabels = {
      category: "Study",
      start: "CI lower bound",
      end: "CI upper bound",
      point: "Estimate",
      size: "Study weight",
    };
    if (forestLabels[role]) return forestLabels[role];
  }
  // A symbol map's `size` is not a size the reader picks — the marker areas are
  // scaled from the measure — so it asks for the value being mapped, unlike a
  // bubble chart where size is genuinely a third variable alongside x and y.
  if (chartType === "symbolMap" && role === "size") return "Bubble value";
  // A chart type with any implied role has folded its axis choice into a
  // single "what is plotted" question — the Settings Reframing callout — so its
  // measure role reads as Outcome rather than Y-Axis. Descriptor-only: this does
  // not depend on whether the implied role actually resolves for this schema
  // (byod's line still shows a real X-Axis dropdown, but its Y-Axis reads
  // Outcome too, because the chart type itself is the same reframed kind).
  if (role === "y" && Object.keys(getChartType(chartType)?.impliedRoles || {}).length) {
    return "Outcome";
  }
  // `color` is two different questions wearing one name. Where the chart type
  // constrains it to a MEASURE (choropleth, heatmap) the colour *is* the
  // plotted value, and calling that dropdown "Color" asks for an outcome by
  // naming the mechanism that draws it — the same mistake the Outcome reframe
  // removed from the x/category axes. Where it is constrained to a DIMENSION it
  // really does choose colours, and those chart types render it in Appearance
  // beside the palette rather than here. Read from the constraint rather than
  // from a list of ids, so a future chart type is labelled correctly for free.
  if (role === "color" && colorIsMeasure(chartType)) return "Outcome";
  if (AXIS_LABELS[role]) return AXIS_LABELS[role];
  const labels = {
    facet: "Facet",
    category: "Category",
    geography: "Geography",
    period: "Period",
    start: "Start value",
    end: "End value",
    point: "Center point",
    unit: "Observation unit",
    size: "Bubble size",
  };
  return labels[role] || role;
}

