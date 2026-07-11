/**
 * build-changelog.mjs — hybrid changelog generator for the /logs Changelog tab.
 *
 * Imports commit metadata (short hash, authored date, author, subject, body) from
 * `git log`, then overlays the curated fields that git cannot infer (area,
 * intensity, audited, module, and optional title/description overrides) from
 * data/changelog-overlay.json — keyed by short commit hash. Only commits present
 * in the overlay are emitted. The merged records are written to data/changelog.json,
 * which the app reads via lib/changelog/changelog.js (mirrors the committed-data-file
 * pattern of the pipeline logs).
 *
 * Usage:
 *   node scripts/changelog/build-changelog.mjs
 *
 * To add a change to the changelog: add an entry keyed by the commit's short hash
 * to data/changelog-overlay.json, then re-run this script.
 */

/* global process, console */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OVERLAY_PATH = path.join(ROOT, "data", "changelog-overlay.json");
const OUTPUT_PATH = path.join(ROOT, "data", "changelog.json");

const VALID_INTENSITY = new Set(["low", "moderate", "high"]);

// Field separator unlikely to appear in a commit; body is fetched separately.
const SEP = "";
const LOG_FORMAT = ["%h", "%aI", "%an", "%s"].join(SEP);

/** Read every commit as { hash, timestamp, contributor, subject }. */
function readCommits() {
  const raw = execFileSync(
    "git",
    ["log", `--pretty=format:${LOG_FORMAT}`, "--max-count=1000"],
    { cwd: ROOT, encoding: "utf-8" }
  );
  const byHash = new Map();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [hash, timestamp, contributor, subject] = line.split(SEP);
    byHash.set(hash, { hash, timestamp, contributor, subject });
  }
  return byHash;
}

/** Commit body (multi-line description) for a single hash, trimmed. */
function readCommitBody(hash) {
  try {
    return execFileSync("git", ["log", "-1", "--pretty=format:%b", hash], {
      cwd: ROOT,
      encoding: "utf-8",
    }).trim();
  } catch {
    return "";
  }
}

/** "2026-07-11T10:48:53-07:00" → "2026-07-11" (calendar day as authored). */
function dayFromTimestamp(timestamp) {
  return String(timestamp).slice(0, 10);
}

function main() {
  const overlayRaw = JSON.parse(fs.readFileSync(OVERLAY_PATH, "utf-8"));
  const commits = readCommits();

  const entries = [];
  for (const [hash, overlay] of Object.entries(overlayRaw)) {
    if (hash.startsWith("__")) continue; // skip __doc__ and other meta keys
    const commit = commits.get(hash);
    if (!commit) {
      console.warn(`⚠ overlay hash ${hash} not found in git history — skipping`);
      continue;
    }
    if (overlay.intensity && !VALID_INTENSITY.has(overlay.intensity)) {
      console.warn(`⚠ ${hash}: invalid intensity "${overlay.intensity}" — expected low|moderate|high`);
    }

    const title = overlay.title || commit.subject;
    const description = overlay.description || readCommitBody(hash) || commit.subject;

    entries.push({
      id: hash,
      commit: hash,
      timestamp: commit.timestamp,
      date: dayFromTimestamp(commit.timestamp),
      title,
      description,
      area: overlay.area || "Uncategorized",
      intensity: overlay.intensity || "low",
      audited: Boolean(overlay.audited),
      contributor: overlay.contributor || commit.contributor || null,
      module: overlay.module || null,
    });
  }

  // Newest first (ISO-8601 with offset sorts lexically by instant).
  entries.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(entries, null, 2)}\n`, "utf-8");
  console.log(`✓ wrote ${entries.length} changelog entries → ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main();
