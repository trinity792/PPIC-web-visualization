/**
 * docTypeStyles.js — presentation map from a document's Content Type to its
 * card icon tile + badge colors.
 *
 * Colors are drawn from the existing PPIC ramps in app/globals.css (referenced
 * as `--ppic-*` tokens so the design system stays the single source of truth).
 * Icons are lucide-react component names resolved by the DocumentCard.
 *
 * Data sources:
 *   - Content Type strings from lib/docs/documents.js
 *
 * Usage:
 *   import { docTypeStyle } from "@/lib/docs/docTypeStyles";
 *   const { icon, fg, bg } = docTypeStyle(doc.type);
 */

// Icon values are lucide-react export names (see DocumentCard's icon registry).
const STYLES = {
  "refractor plan": { icon: "Wrench", fg: "var(--ppic-orange-400)", bg: "var(--ppic-orange-50)" },
  "implementation plan": { icon: "ListChecks", fg: "var(--ppic-orange-500)", bg: "var(--ppic-orange-50)" },
  "unit tests plan": { icon: "FlaskConical", fg: "var(--ppic-orange-400)", bg: "var(--ppic-orange-50)" },
  "project specification": { icon: "FileText", fg: "var(--ppic-blue-500)", bg: "var(--ppic-blue-50)" },
  codebook: { icon: "BookMarked", fg: "var(--ppic-blue-300)", bg: "var(--ppic-blue-50)" },
  guide: { icon: "BookOpen", fg: "var(--ppic-blue-400)", bg: "var(--ppic-blue-50)" },
  "agent instructions": { icon: "Bot", fg: "var(--ppic-neutral-500)", bg: "var(--ppic-neutral-50)" },
};

const DEFAULT_STYLE = {
  icon: "FileText",
  fg: "var(--ppic-neutral-500)",
  bg: "var(--ppic-neutral-50)",
};

/** Resolve the icon + colors for a Content Type, with a safe fallback. */
export function docTypeStyle(type) {
  return STYLES[type?.toLowerCase?.()] || DEFAULT_STYLE;
}
