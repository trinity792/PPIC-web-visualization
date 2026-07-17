/**
 * settingsTiers.js — Basic / Moderate / Advanced visibility registry for
 * every graph-editor control. The sidebar and code-mode toggle read this;
 * nothing else defines tier membership.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Tiers are inclusive: a control tagged "basic" is visible at every tier;
 * "advanced" only at Advanced. Hiding a control never changes the config —
 * a value set at Advanced still applies when the user drops back to Basic.
 *
 * Exports:
 *   TIERS                  — ["basic", "moderate", "advanced"] (ordered)
 *   DEFAULT_TIER           — the tier a fresh editor opens at
 *   CONTROL_TIERS          — { controlId: { tier, section } } for every
 *                            sidebar section and control (source of truth)
 *   isVisible(controlId, activeTier) — tier-inclusive visibility test
 *   hiddenCount(activeTier, sectionId?) — how many controls the active tier
 *                            hides (optionally within one section); drives
 *                            the "N more in Advanced" hint
 *
 * Data sources:
 *   - none (static table)
 */

export const TIERS = Object.freeze(["basic", "moderate", "advanced"]);

export const DEFAULT_TIER = "moderate";

/**
 * Control ids are the sidebar's section keys plus finer-grained controls
 * inside them. `section` groups controls for hiddenCount; a section-level
 * entry uses its own id as the section.
 */
export const CONTROL_TIERS = Object.freeze({
  // Sections
  dataSources: { tier: "basic", section: "dataSources" },
  presets: { tier: "basic", section: "presets" },
  graphType: { tier: "basic", section: "graphType" },
  dateRange: { tier: "basic", section: "dateRange" },
  encodings: { tier: "moderate", section: "encodings" },
  comparison: { tier: "moderate", section: "comparison" },
  labels: { tier: "moderate", section: "labels" },
  appearance: { tier: "moderate", section: "appearance" },

  // Data controls
  ownData: { tier: "moderate", section: "dataSources" },
  derivedColumns: { tier: "advanced", section: "dataSources" },

  // Comparison controls
  transform: { tier: "moderate", section: "comparison" },
  baseYear: { tier: "moderate", section: "comparison" },
  topN: { tier: "moderate", section: "comparison" },
  categorySelection: { tier: "advanced", section: "comparison" },
  benchmark: { tier: "advanced", section: "comparison" },

  // Appearance controls
  legendPosition: { tier: "moderate", section: "appearance" },
  palette: { tier: "moderate", section: "appearance" },
  seriesColors: { tier: "advanced", section: "appearance" },
  chartTypography: { tier: "moderate", section: "appearance" },
  legendTypography: { tier: "moderate", section: "appearance" },
  lineSpacing: { tier: "moderate", section: "appearance" },
  markerMode: { tier: "moderate", section: "appearance" },
  orientation: { tier: "moderate", section: "appearance" },
  // Diverging-bar center reference value.
  center: { tier: "moderate", section: "appearance" },
  colorScale: { tier: "moderate", section: "appearance" },
  showValueAxis: { tier: "moderate", section: "appearance" },
  showPointLabels: { tier: "moderate", section: "appearance" },
  pointLabelSeries: { tier: "advanced", section: "appearance" },
  // Forest-plot marker/endpoint styling + line of no effect.
  endpointStyle: { tier: "moderate", section: "appearance" },
  pointStyle: { tier: "moderate", section: "appearance" },
  noEffectValue: { tier: "moderate", section: "appearance" },
  watermark: { tier: "moderate", section: "appearance" },
  footnote: { tier: "moderate", section: "appearance" },
  formatOverrides: { tier: "advanced", section: "appearance" },

  // Advanced structure
  layers: { tier: "advanced", section: "encodings" },
  annotations: { tier: "advanced", section: "labels" },
  referenceLines: { tier: "advanced", section: "labels" },

  // Editor chrome
  codeEditor: { tier: "moderate", section: "editor" },
  export: { tier: "basic", section: "editor" },
  savedViews: { tier: "basic", section: "editor" },
});

const tierIndex = (tier) => {
  const index = TIERS.indexOf(tier);
  return index === -1 ? 0 : index;
};

/**
 * Whether a control is visible at the active tier. Unknown control ids are
 * treated as "basic" (always visible) so a missing registry entry can never
 * hide a control by accident.
 */
export function isVisible(controlId, activeTier) {
  const entry = CONTROL_TIERS[controlId];
  if (!entry) return true;
  return tierIndex(entry.tier) <= tierIndex(activeTier);
}

/**
 * How many registered controls the active tier hides — overall, or within
 * one section when `sectionId` is given. Section-level entries are excluded
 * from their own count (hiding a whole section already reads as one thing).
 */
export function hiddenCount(activeTier, sectionId) {
  return Object.entries(CONTROL_TIERS).filter(([id, entry]) => {
    if (sectionId && entry.section !== sectionId) return false;
    if (sectionId && id === sectionId) return false;
    return !isVisible(id, activeTier);
  }).length;
}
