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

import { DOCUMENT_THUMBNAIL_COLORS } from "@/lib/constants";

// Icon values are lucide-react export names (see DocumentCard's icon registry).
const STYLES = {
  "agent instructions": {
    icon: "Bot",
    ...DOCUMENT_THUMBNAIL_COLORS.mutedComplementGreen,
  },
  analysis: {
    icon: "FileSearch",
    ...DOCUMENT_THUMBNAIL_COLORS.mutedTeal,
  },
  codebook: {
    icon: "BookMarked",
    ...DOCUMENT_THUMBNAIL_COLORS.mutedBlue2,
  },
  explainer: {
    icon: "MessageSquareText",
    ...DOCUMENT_THUMBNAIL_COLORS.mutedBlue,
  },
  guide: {
    icon: "BookOpen",
    ...DOCUMENT_THUMBNAIL_COLORS.blueDark,
  },
  "implementation plan": {
    icon: "ListChecks",
    ...DOCUMENT_THUMBNAIL_COLORS.mutedGray,
  },
  notes: {
    icon: "NotebookPen",
    ...DOCUMENT_THUMBNAIL_COLORS.mutedOrange2,
  },
  "process documentation": {
    icon: "Workflow",
    ...DOCUMENT_THUMBNAIL_COLORS.mutedRed,
  },
  "project specification": {
    icon: "ScrollText",
    ...DOCUMENT_THUMBNAIL_COLORS.mutedOrange,
  },
  "refractor guide": {
    icon: "Wrench",
    ...DOCUMENT_THUMBNAIL_COLORS.mutedNavyBlue,
  },
  "refractor plan": {
    icon: "FileCog",
    ...DOCUMENT_THUMBNAIL_COLORS.orangeDeep,
  },
  "unit tests plan": {
    icon: "FlaskConical",
    ...DOCUMENT_THUMBNAIL_COLORS.mutedSteelBlue,
  },
  "module specification": {
    icon: "Save",
    ...DOCUMENT_THUMBNAIL_COLORS.mutedComplementGreen2,
  },
};

const DEFAULT_STYLE = {
  icon: "FileText",
  ...DOCUMENT_THUMBNAIL_COLORS.fallback,
};

/** Resolve the icon + colors for a Content Type, with a safe fallback. */
export function docTypeStyle(type) {
  return STYLES[type?.toLowerCase?.()] || DEFAULT_STYLE;
}
