/**
 * presentation.js — client-safe plain-language layer for changelog records.
 *
 * Maps an entry's intensity (low / moderate / high) to a label, color, and lucide
 * icon name for the intensity chip and card tile — mirroring SEVERITY_META in
 * lib/logs/presentation.js. Timestamp formatting is reused from the logs
 * presentation module rather than duplicated.
 *
 * No node:fs — safe to import from client components.
 *
 * Data sources:
 *   - changelog records from lib/changelog/changelog.js (via props)
 */

import { COLORS } from "@/lib/constants";

// Re-export the shared timestamp helpers so changelog components have one import.
export { formatTimestamp, pacificDateKey } from "@/lib/logs/presentation";

// ── Intensity ─────────────────────────────────────────────────────────────────

// icon names map to lucide-react components resolved in the card component.
export const INTENSITY_META = {
  low: { label: "Low", icon: "Feather", color: COLORS.complementGreen7 },
  moderate: { label: "Moderate", icon: "Gauge", color: COLORS.steelBlue4 },
  high: { label: "High", icon: "Flame", color: COLORS.orange3 },
};

export function intensityMeta(intensity) {
  return INTENSITY_META[intensity] || INTENSITY_META.low;
}

/** Friendly label for a raw intensity value (falls back to the value itself). */
export function intensityLabel(value) {
  return INTENSITY_META[value]?.label || value;
}
