/**
 * editorLog.js — bounded in-memory activity ring for the graph editor's code
 * mode (Spec/R/Stata Run outcomes).
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Entries live in module state only — NEVER localStorage. Chart shapes, error
 * codes, and filenames are fine to log; the privacy rule (never log data cell
 * values) is the CALLERS' discipline — this module has no data-cell knowledge
 * of its own, but nothing here should be handed anything but shapes/codes.
 *
 * Exports:
 *   logEditorEvent({ severity, code, summary, detail?, source }) — append
 *   useEditorLog()          — React hook: { entries, clear } (newest first)
 *   clearEditorLog()
 *   MAX_ENTRIES             — ring capacity (200)
 *   toDownloadText(entries) — plain-text export for the "Copy technical
 *                             details" affordance
 *
 * Data sources:
 *   - none (in-memory only)
 */

import { useSyncExternalStore } from "react";

export const MAX_ENTRIES = 200;

let entries = [];
let nextId = 1;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Append one entry to the ring, evicting the oldest entry once MAX_ENTRIES is
 * exceeded. `severity` is "info" | "warn" | "error".
 */
export function logEditorEvent({ severity = "info", code, summary, detail, source } = {}) {
  const entry = {
    id: nextId++,
    at: new Date().toISOString(),
    severity,
    code,
    summary,
    detail,
    source,
  };
  entries = [...entries, entry];
  if (entries.length > MAX_ENTRIES) entries = entries.slice(entries.length - MAX_ENTRIES);
  emit();
  return entry;
}

export function clearEditorLog() {
  entries = [];
  emit();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return entries;
}

const EMPTY = Object.freeze([]);
function getServerSnapshot() {
  return EMPTY;
}

/** Newest-first view of the ring, plus a bound `clear`. */
export function useEditorLog() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    entries: snapshot.length ? [...snapshot].reverse() : snapshot,
    clear: clearEditorLog,
  };
}

/** Plain-text rendering of entries for the "Copy technical details" button. */
export function toDownloadText(list) {
  if (!list?.length) return "No activity recorded.";
  return list
    .map((entry) => {
      const lines = [
        `[${entry.severity?.toUpperCase()}] ${entry.code || ""}`.trim(),
        entry.at,
        entry.summary || "",
      ];
      if (entry.source) lines.push(`source: ${entry.source}`);
      if (entry.detail) lines.push(String(entry.detail));
      return lines.filter(Boolean).join("\n");
    })
    .join("\n\n---\n\n");
}
