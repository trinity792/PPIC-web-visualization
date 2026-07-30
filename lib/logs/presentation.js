/**
 * presentation.js — client-safe plain-language layer over raw run records.
 *
 * The backend records only factual fields (severity, phase index/name, error
 * type/message/traceback, result counts, revision diffs). This module derives the
 * researcher-facing wording the non-technical log cards show: friendly phase names,
 * likely cause, impact, and what a run restated. Best-effort by design — cause is a
 * hint, not a guarantee.
 *
 * No node:fs — safe to import from client components.
 *
 * Data sources:
 *   - run records from lib/logs/logs.js (via props)
 */

import { COLORS } from "@/lib/constants";

// ── Severity ──────────────────────────────────────────────────────────────────

// icon names map to lucide-react components resolved in the card component.
export const SEVERITY_META = {
  success: { label: "Completed", icon: "CheckCircle2", color: COLORS.complementGreen7 },
  recovered: { label: "Recovered", icon: "ShieldAlert", color: COLORS.blue3 },
  error: { label: "Failed", icon: "AlertTriangle", color: COLORS.orange3 },
};

export function severityMeta(severity) {
  return SEVERITY_META[severity] || SEVERITY_META.error;
}

// ── Phase names ───────────────────────────────────────────────────────────────

// Canonical plain-language phase labels by pipeline length. Modules run either
// six phases (PopHousing, Building Permits) or five; the ordering is shared.
const PHASE_NAMES = {
  6: [
    "Setting up & loading saved data",
    "Fetching source data",
    "Cleaning",
    "Merging sources",
    "Enriching & validating",
    "Publishing cleaned data",
  ],
  5: [
    "Setting up & loading saved data",
    "Fetching source data",
    "Cleaning",
    "Merging & aggregating",
    "Publishing cleaned data",
  ],
};

export function derivePhaseLabel(phase) {
  if (!phase || phase.index == null) return "Unknown step";
  const { index, total } = phase;
  const names = PHASE_NAMES[total] || PHASE_NAMES[5];
  const name = names[index - 1];
  const base = `Step ${index} of ${total ?? "?"}`;
  return name ? `${base} — ${name}` : base;
}

// ── Cause & impact ────────────────────────────────────────────────────────────

export function deriveCause(entry) {
  if (entry.severity === "recovered") {
    return "A live source was unavailable, so the pipeline used previously saved data.";
  }
  const error = entry.error || {};
  const haystack = `${error.type || ""} ${error.message || ""}`.toLowerCase();

  if (haystack.includes("404") || haystack.includes("not found") || haystack.includes("not published")) {
    return "The source file could not be found — the publisher likely renamed or moved it.";
  }
  if (haystack.includes("timeout") || haystack.includes("timed out") || haystack.includes("connection")) {
    return "The source server did not respond in time.";
  }
  if (haystack.includes("validation") || haystack.includes("valueerror")) {
    return "The processed data did not pass a quality check.";
  }
  if (!entry.error) return null;
  return "An unexpected error occurred during this step.";
}

export function deriveImpact(entry) {
  if (entry.severity === "recovered") {
    return "None — the pipeline used previously saved data instead.";
  }
  if (entry.severity === "error") {
    return `${entry.moduleLabel} data was not updated. Other modules are unaffected.`;
  }
  return null;
}

export function deriveResult(entry) {
  const result = entry.result;
  if (!result || typeof result !== "object") return null;
  const rows = result.row_count ?? result.rowCount;
  const parts = [];
  if (rows != null) parts.push(`${Number(rows).toLocaleString()} rows`);
  if (Array.isArray(result.year_range) && result.year_range.length === 2) {
    parts.push(`${result.year_range[0]}–${result.year_range[1]}`);
  }
  if (result.resolved_year != null) parts.push(`vintage ${result.resolved_year}`);
  return parts.length ? parts.join(" · ") : null;
}

// ── Revisions ─────────────────────────────────────────────────────────────────

// Beyond this many periods the label names the span, mirroring the backend's
// format_revision_summary so the card and the log line read the same way.
const MAX_PERIODS_IN_LABEL = 8;

/** True for a raw revision-diff object (as opposed to a {source: diff} map). */
function isDiffShape(value) {
  return Boolean(value) && typeof value === "object" && "changed_cells" in value;
}

function normalizeDiff(source, diff) {
  return {
    source,
    addedPeriods: diff.added_periods || [],
    changedPeriods: diff.changed_periods || [],
    removedPeriods: diff.removed_periods || [],
    addedKeys: diff.added_keys || 0,
    removedKeys: diff.removed_keys || 0,
    changedCells: diff.changed_cells || 0,
    truncated: Boolean(diff.truncated),
    sample: Array.isArray(diff.sample) ? diff.sample : [],
  };
}

/**
 * Normalize `result.revisions` into a flat array, absorbing both backend shapes:
 * a {source: diff} map (Components, Projections) and a bare diff (Housing Stress,
 * Building Permits, RHNA — single-source modules). Returns [] when absent.
 */
export function deriveRevisions(entry) {
  const revisions = entry?.result?.revisions;
  if (!revisions || typeof revisions !== "object") return [];
  if (isDiffShape(revisions)) return [normalizeDiff(null, revisions)];
  return Object.entries(revisions)
    .filter(([, diff]) => isDiffShape(diff))
    .map(([source, diff]) => normalizeDiff(source, diff));
}

/** "2023" · "2023, 2024" · "2020–2070 (51 periods)" for a long span. */
export function formatPeriodList(periods) {
  if (!Array.isArray(periods) || !periods.length) return "";
  if (periods.length > MAX_PERIODS_IN_LABEL) {
    return `${periods[0]}–${periods[periods.length - 1]} (${periods.length} periods)`;
  }
  return periods.join(", ");
}

/**
 * One researcher-facing sentence about restated values, or null when a run only
 * added new periods. This is the part a reader needs to know without opening the
 * technical disclosure: a previously published number has since changed.
 */
export function deriveRevisionSummary(entry) {
  const revised = deriveRevisions(entry).filter((item) => item.changedCells > 0);
  if (!revised.length) return null;
  const cells = revised.reduce((total, item) => total + item.changedCells, 0);
  const periods = [...new Set(revised.flatMap((item) => item.changedPeriods))].sort();
  const valueWord = cells === 1 ? "value" : "values";
  const periodText = formatPeriodList(periods);
  return periodText
    ? `${cells.toLocaleString()} previously published ${valueWord} restated in ${periodText}.`
    : `${cells.toLocaleString()} previously published ${valueWord} restated.`;
}

// ── Timestamps ────────────────────────────────────────────────────────────────

/** "2026-07-03T02:14:00-07:00" → "July 3, 2026 · 2:14 AM PDT". */
export function formatTimestamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const datePart = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/Los_Angeles",
  }).format(date);
  return `${datePart} · ${timePart}`;
}

/** Calendar day (Pacific) for date-range filtering: "2026-07-03". */
export function pacificDateKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Los_Angeles",
  }).format(date);
}
