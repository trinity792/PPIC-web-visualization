/**
 * calloutStyles.js — visual config for Obsidian-style callouts.
 *
 * Maps a callout type (case-insensitive) to a lucide icon name, a default title,
 * and accent colors. Core colors reuse PPIC tokens where the user specified them;
 * semantic accents (warning/caution/success) use hexes drawn from the same
 * palette family. Unknown types fall back to DEFAULT_CALLOUT so new/custom types
 * (e.g. the docs' heavily-used `[!flag]`) still render.
 *
 * Data sources:
 *   - callout type string from remarkCallouts
 *
 * Usage:
 *   import { calloutStyle } from "@/lib/docs/markdown/calloutStyles";
 */

// icon = lucide-react export name (resolved by the Callout component).
const CALLOUTS = {
  note: { label: "Note", icon: "Pencil", accent: "var(--ppic-blue-300)" },
  info: { label: "Info", icon: "Info", accent: "var(--ppic-blue-300)" },
  abstract: { label: "Abstract", icon: "ClipboardList", accent: "var(--ppic-blue-300)" },
  tip: { label: "Tip", icon: "Lightbulb", accent: "var(--ppic-blue-200)" },
  hint: { label: "Hint", icon: "Lightbulb", accent: "var(--ppic-blue-200)" },
  important: {
    label: "Important",
    icon: "AlertCircle",
    accent: "var(--ppic-orange-400)",
  },
  warning: { label: "Warning", icon: "TriangleAlert", accent: "#C97A0F" },
  caution: { label: "Caution", icon: "Zap", accent: "#9A2D0C" },
  danger: { label: "Danger", icon: "Zap", accent: "#9A2D0C" },
  quote: { label: "Quote", icon: "Quote", accent: "var(--ppic-neutral-400)" },
  cite: { label: "Quote", icon: "Quote", accent: "var(--ppic-neutral-400)" },
  success: { label: "Success", icon: "CircleCheck", accent: "#1E7A46" },
  check: { label: "Success", icon: "CircleCheck", accent: "#1E7A46" },
  question: { label: "Question", icon: "HelpCircle", accent: "var(--ppic-blue-200)" },
  faq: { label: "FAQ", icon: "HelpCircle", accent: "var(--ppic-blue-200)" },
  help: { label: "Help", icon: "HelpCircle", accent: "var(--ppic-blue-200)" },
  example: { label: "Example", icon: "ListChecks", accent: "var(--ppic-neutral-400)" },
  bug: { label: "Bug", icon: "Bug", accent: "#9A2D0C" },
  todo: { label: "Todo", icon: "CircleCheck", accent: "var(--ppic-blue-300)" },
  flag: { label: "Flag", icon: "Flag", accent: "var(--ppic-orange-300)" },
};

export const DEFAULT_CALLOUT = {
  label: "Note",
  icon: "Info",
  accent: "var(--ppic-neutral-300)",
};

export function calloutStyle(type) {
  return CALLOUTS[String(type || "").toLowerCase()] || DEFAULT_CALLOUT;
}
