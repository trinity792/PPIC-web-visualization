/**
 * logs.js — server-side loader for pipeline run logs.
 *
 * Reads every `*.jsonl` file under the repo's `logs/` directory, parses each
 * line into a run record (skipping malformed lines rather than crashing), dedupes
 * by record id, and returns them newest-first. Filter option lists (modules,
 * severities) are DERIVED from the records so new pipelines flow through without
 * code changes. Mirrors the shape of lib/docs/documents.js.
 *
 * The records are written by scripts/shared/logging/run_records.py — one JSON
 * object per pipeline run (the /logs contract).
 *
 * Data sources:
 *   - logs/*.jsonl (one JSON record per line; a committed sample plus the live
 *     pipeline-runs.jsonl produced by each run)
 *
 * Outputs:
 *   - getLogEntries()    — normalized run records, newest first
 *   - getLogModules()    — ["All modules", ...unique module labels]
 *   - getLogSeverities() — ["All severities", ...unique severities]
 *
 * Notes:
 *   - Server-only (uses fs); import from server components / route handlers.
 */

/* global process */
import fs from "node:fs";
import path from "node:path";

// ── Constants ─────────────────────────────────────────────────────────────────

const LOGS_ROOT = path.join(process.cwd(), "logs");

// ── Cache ─────────────────────────────────────────────────────────────────────

let _cache = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collect absolute paths of every .jsonl file directly under `logs/`. */
function findRunLogFiles() {
  if (!fs.existsSync(LOGS_ROOT)) return [];
  return fs
    .readdirSync(LOGS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl"))
    .map((entry) => path.join(LOGS_ROOT, entry.name));
}

function loadEntries() {
  if (_cache) return _cache;

  const byId = new Map();
  for (const absPath of findRunLogFiles()) {
    const raw = fs.readFileSync(absPath, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let record;
      try {
        record = JSON.parse(trimmed);
      } catch {
        continue; // malformed line — skip rather than crash the page
      }
      // Dedupe by id; a later file/line wins, keeping the newest write.
      const id = record.id || `${record.module}-${record.timestamp}`;
      byId.set(id, { ...record, id });
    }
  }

  // Newest first by timestamp (ISO-8601 with offset sorts lexically by instant).
  const entries = [...byId.values()].sort((a, b) =>
    String(b.timestamp).localeCompare(String(a.timestamp))
  );
  return (_cache = entries);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getLogEntries() {
  return loadEntries();
}

export function getLogModules() {
  const labels = [
    ...new Set(loadEntries().map((entry) => entry.moduleLabel).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  return ["All modules", ...labels];
}

export function getLogSeverities() {
  const severities = [
    ...new Set(loadEntries().map((entry) => entry.severity).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  return ["All severities", ...severities];
}
