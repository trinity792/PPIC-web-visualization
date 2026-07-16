/**
 * Server-side data-access module for the cleaned RHNA Progress Report dataset.
 *
 * Mirrors lib/data/housing_stress.js, but — like Building Permits — carries its
 * own temporal shaping because the axis is `Snapshot Date` (the biweekly HCD
 * refresh we version), not an integer Year. Client components must query the API
 * route instead of importing this module directly.
 *
 * The contract CSV is tidy/long on Income Level: five rows per
 * (Jurisdiction, Cycle, Snapshot Date). Pinning one Income Level (default Total),
 * the most-recent snapshot, and each jurisdiction's latest cycle yields exactly
 * one row per jurisdiction — the default cross-sectional "current standings"
 * view. Trend views drop the most-recent pin to walk the snapshot series.
 *
 * Region and category roll-ups are per-jurisdiction; the dashboard queries
 * aggregate them (median On Track Score) across a region's jurisdictions.
 */

/* global process */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { RHNA_PROGRESS_SCHEMA } from "@/lib/visualization/moduleSchemas/rhnaProgress";

const DATA_RELATIVE_PATH = path.join(
  "data",
  "data-cleaned",
  "RHNA-progress-report",
  "RHNAProgress_Current.csv",
);
const DATA_PATH = path.join(process.cwd(), DATA_RELATIVE_PATH);

const NUMERIC_COLUMNS = new Set(RHNA_PROGRESS_SCHEMA.numericColumns);
const BOOLEAN_COLUMNS = new Set(["Most Recent", "Cycle Started"]);

export const SUBSET_TO_LEVELS = RHNA_PROGRESS_SCHEMA.subsets;
export const AVAILABLE_SUBSETS = Object.keys(SUBSET_TO_LEVELS);
export const INCOME_LEVELS = RHNA_PROGRESS_SCHEMA.incomeLevels;
export const DEFAULT_INCOME_LEVEL = "Total";
export const DEFAULT_MEASURE = "On Track Score";

let cachedRows = null;

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    for (let c = 0; c < headers.length; c += 1) {
      const key = headers[c];
      const raw = cells[c];
      if (key === "Cycle") {
        row[key] = Number.parseInt(raw, 10);
      } else if (NUMERIC_COLUMNS.has(key)) {
        row[key] = raw === "" || raw === undefined ? null : Number.parseFloat(raw);
      } else if (BOOLEAN_COLUMNS.has(key)) {
        row[key] = raw === "True" || raw === "true" || raw === "1";
      } else {
        row[key] = raw;
      }
    }
    // The shared visualization layer keys the place dimension on `Location`; the
    // RHNA source names it `Jurisdiction`. Alias so both work.
    row.Location = row.Jurisdiction;
    rows.push(row);
  }
  return rows;
}

export async function loadRhnaProgressData() {
  if (cachedRows) return cachedRows;
  let text;
  try {
    text = await readFile(DATA_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `RHNA Progress dataset not found at ${DATA_RELATIVE_PATH}. Run the RHNA progress pipeline to generate it.`,
      );
    }
    throw error;
  }
  cachedRows = parseCsv(text);
  return cachedRows;
}

/** Resolve the measure column a request selects (explicit `parameter`, else the headline On Track Score). */
export function resolveMeasureColumn({ parameter = null } = {}) {
  if (parameter) {
    if (!NUMERIC_COLUMNS.has(parameter)) {
      throw new Error(`Unknown measure '${parameter}'.`);
    }
    return parameter;
  }
  return DEFAULT_MEASURE;
}

/** Keep, per jurisdiction, only rows belonging to its highest Cycle present. */
function keepLatestCyclePerJurisdiction(rows) {
  const maxCycle = new Map();
  for (const row of rows) {
    const current = maxCycle.get(row.Location);
    if (current === undefined || row.Cycle > current) maxCycle.set(row.Location, row.Cycle);
  }
  return rows.filter((row) => row.Cycle === maxCycle.get(row.Location));
}

/**
 * Filter to one geographic subset and Income Level, defaulting to the most-recent
 * snapshot and each jurisdiction's latest cycle (the current-standings view).
 * A trend request (`mostRecentOnly: false`) keeps the whole snapshot series.
 */
function filteredRows({
  subset,
  locations = null,
  incomeLevel = null,
  cycle = null,
  mostRecentOnly = true,
  latestCycleOnly = true,
} = {}) {
  return (rows) => {
    const levels = SUBSET_TO_LEVELS[subset];
    if (!levels) throw new Error(`Unknown subset: ${subset}`);
    const level = incomeLevel || DEFAULT_INCOME_LEVEL;
    const locationFilter = locations?.length ? new Set(locations) : null;

    let result = rows.filter((row) => {
      if (!levels.includes(row["Geographic Level"])) return false;
      if (row["Income Level"] !== level) return false;
      if (mostRecentOnly && row["Most Recent"] !== true) return false;
      if (cycle !== null && row.Cycle !== cycle) return false;
      if (locationFilter && !locationFilter.has(row.Location)) return false;
      return true;
    });
    if (latestCycleOnly && cycle === null) result = keepLatestCyclePerJurisdiction(result);
    return result;
  };
}

/* ── Chart-editor query shapes ─────────────────────────────────────── */

export async function queryCategoryValues(params) {
  const measure = resolveMeasureColumn(params);
  const { topN = null, sort = "value" } = params;
  const rows = filteredRows(params)(await loadRhnaProgressData());

  let records = rows.map((row) => ({
    location: row.Location,
    category: row.Location,
    value: row[measure],
    region: row.Region,
    status: row.Status,
    overallCategory: row["Overall Category"],
  }));

  if (sort === "ascending") {
    records.sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
  } else if (sort === "name") {
    records.sort((a, b) => a.category.localeCompare(b.category));
  } else {
    records.sort((a, b) => {
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return b.value - a.value;
    });
  }
  if (topN && topN > 0) records = records.slice(0, topN);
  return { measure, records };
}

export async function queryLineSeries(params) {
  const measure = resolveMeasureColumn(params);
  // Trend walks the snapshot series, so drop the most-recent pin.
  const rows = filteredRows({ ...params, mostRecentOnly: false })(await loadRhnaProgressData());

  const byLocation = new Map();
  for (const row of rows) {
    if (!byLocation.has(row.Location)) byLocation.set(row.Location, []);
    byLocation.get(row.Location).push(row);
  }
  const series = [...byLocation.entries()]
    .map(([location, locationRows]) => {
      locationRows.sort((a, b) => a["Snapshot Date"].localeCompare(b["Snapshot Date"]));
      return {
        location,
        dates: locationRows.map((row) => row["Snapshot Date"]),
        values: locationRows.map((row) => row[measure]),
      };
    })
    .sort((a, b) => a.location.localeCompare(b.location));
  return { measure, series };
}

export async function queryFullTable({ subset = null, locations = null, incomeLevel = null, full = false } = {}) {
  const rows = await loadRhnaProgressData();
  if (full) return { records: rows, rowCount: rows.length };
  const records = filteredRows({ subset, locations, incomeLevel, mostRecentOnly: false })(rows);
  return { records, rowCount: records.length };
}

/* ── Landing-dashboard queries ─────────────────────────────────────── */

function formatSourceDate(value) {
  if (!value) return "unknown";
  const raw = String(value).trim();
  const hasTime = /\d{1,2}:\d{2}/.test(raw);
  // CKAN emits metadata_modified in UTC without a designator; treat a bare
  // date/time as UTC (append Z) and render in Pacific Time.
  const isoish = raw.replace(" ", "T");
  const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(isoish);
  const date = new Date(hasTime && !hasTimezone ? `${isoish}Z` : isoish);
  if (Number.isNaN(date.getTime())) return raw;

  if (!hasTime) {
    // Date-only value: format in UTC so it never rolls back a day by local offset.
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  // Include the time, converted to Pacific Time (timeZoneName renders PST/PDT).
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  }).format(date);
}

/**
 * The dataset's single upstream source and when HCD last updated it — the newest
 * `Source Last Updated` (package metadata_modified), falling back to Snapshot Date.
 * Consumed by the landing dashboard's footnote.
 */
export async function queryDataSources() {
  const rows = await loadRhnaProgressData();
  let newest = null;
  for (const row of rows) {
    const value = row["Source Last Updated"] || row["Snapshot Date"];
    if (value && (newest === null || value > newest)) newest = value;
  }
  return [
    {
      label: "California HCD RHNA Progress Report (data.ca.gov)",
      lastUpdated: formatSourceDate(newest),
    },
  ];
}

/**
 * Best- and worst-performing jurisdictions by On Track Score at the Total level
 * (most-recent snapshot, latest cycle). Returns both ends so the compensatory
 * (On Track Score) and non-compensatory (Overall Progress, Tiers Met) reads sit
 * together, per the spec's dashboard brief.
 */
export async function queryBestWorst({ subset = "Jurisdictions", topN = 10 } = {}) {
  const rows = filteredRows({ subset, incomeLevel: "Total" })(await loadRhnaProgressData());
  const scored = rows
    .filter((row) => row["On Track Score"] !== null)
    .map((row) => ({
      location: row.Location,
      region: row.Region,
      onTrackScore: row["On Track Score"],
      overallCategory: row["Overall Category"],
      tiersMet: row["Tiers Met"],
      tiersWithGoal: row["Tiers With Goal"],
      overallProgress: row["Overall Progress"],
      percentElapsed: row["Percent Elapsed"],
    }))
    .sort((a, b) => b.onTrackScore - a.onTrackScore);

  return {
    best: scored.slice(0, topN),
    worst: scored.slice(-topN).reverse(),
    total: scored.length,
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Per-region median On Track Score for every Income Level (most-recent snapshot,
 * latest cycle). Precomputed for all levels so the dashboard's diverging bar can
 * switch income level client-side without refetching. Sorted by the Total-level
 * median so regions read worst-to-best.
 */
export async function queryRegionalOnTrack({ subset = "Jurisdictions" } = {}) {
  const rows = await loadRhnaProgressData();
  const byLevel = {};
  for (const level of INCOME_LEVELS) {
    const levelRows = filteredRows({ subset, incomeLevel: level })(rows);
    const byRegion = new Map();
    for (const row of levelRows) {
      if (row["On Track Score"] === null || !row.Region) continue;
      if (!byRegion.has(row.Region)) byRegion.set(row.Region, []);
      byRegion.get(row.Region).push(row["On Track Score"]);
    }
    byLevel[level] = [...byRegion.entries()]
      .map(([region, scores]) => ({ region, value: median(scores), count: scores.length }))
      .sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
  }
  return { levels: INCOME_LEVELS, byLevel };
}
