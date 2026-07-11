/**
 * changelog.js — server-side loader for the /logs Changelog tab.
 *
 * Reads data/changelog.json — the merged records produced by
 * scripts/changelog/build-changelog.mjs (git commit metadata overlaid with the
 * curated area/intensity/audited fields) — and returns them newest-first. Filter
 * option lists (areas, intensities) are DERIVED from the records so new changelog
 * entries flow through without code changes. Mirrors lib/logs/logs.js.
 *
 * Data sources:
 *   - data/changelog.json (array of changelog records; regenerate via
 *     `node scripts/changelog/build-changelog.mjs`)
 *
 * Outputs:
 *   - getChangelogEntries()     — normalized changelog records, newest first
 *   - getChangelogAreas()       — ["All areas", ...unique areas]
 *   - getChangelogIntensities() — ["All intensities", ...intensities low→high]
 *
 * Notes:
 *   - Server-only (uses fs); import from server components / route handlers.
 */

/* global process */
import fs from "node:fs";
import path from "node:path";

// ── Constants ─────────────────────────────────────────────────────────────────

const DATA_PATH = path.join(process.cwd(), "data", "changelog.json");

// Fixed low→high ordering for the intensity filter (records only carry the value).
const INTENSITY_ORDER = ["low", "moderate", "high"];

// ── Cache ─────────────────────────────────────────────────────────────────────

let _cache = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadEntries() {
  if (_cache) return _cache;

  let records = [];
  if (fs.existsSync(DATA_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
      if (Array.isArray(parsed)) records = parsed;
    } catch {
      records = []; // malformed file — render an empty changelog rather than crash
    }
  }

  const entries = [...records].sort((a, b) =>
    String(b.timestamp).localeCompare(String(a.timestamp))
  );
  return (_cache = entries);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getChangelogEntries() {
  return loadEntries();
}

export function getChangelogAreas() {
  const areas = [
    ...new Set(loadEntries().map((entry) => entry.area).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  return ["All areas", ...areas];
}

export function getChangelogIntensities() {
  const present = new Set(loadEntries().map((entry) => entry.intensity).filter(Boolean));
  const ordered = INTENSITY_ORDER.filter((level) => present.has(level));
  return ["All intensities", ...ordered];
}
