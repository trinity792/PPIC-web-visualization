/**
 * Server-side data-access module for the cleaned Population & Housing dataset.
 *
 * Mirrors the "worker" layer of the pipeline architecture: this module owns all
 * reading, parsing, and filtering of PopHousing_Current.csv. The API route is a thin
 * orchestrator on top of it; chart components never touch the CSV directly.
 *
 * NOTE: This module is server-only (uses node:fs) and must not be imported into a
 * "use client" component.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const DATA_PATH = path.join(
  process.cwd(),
  "data",
  "data-cleaned",
  "housing-population",
  "PopHousing_Current.csv",
);

// Columns that hold numeric metrics. Everything else (Location, Geographic Level,
// Source) is kept as a string. Year is handled separately as an integer.
const NUMERIC_COLUMNS = new Set([
  "Total Population",
  "Household Population",
  "Group Quarters Population",
  "Total Housing Units",
  "Single Family Units",
  "Multiple Family Units",
  "Mobile Homes",
  "Occupied Units",
  "Vacancy Rate (%)",
  "Persons Per Household",
  "Single Family Detached Units",
  "Single Family Attached Units",
  "Two to Four Family Units",
  "Five Plus Family Units",
  "Vacant Units",
]);

// Curated metric columns exposed to the UI parameter selector.
export const AVAILABLE_PARAMETERS = [
  "Total Population",
  "Total Housing Units",
  "Vacancy Rate (%)",
  "Persons Per Household",
  "Single Family Units",
  "Multiple Family Units",
];

// A "subset" is a friendly grouping that maps to one or more Geographic Level values.
// California (a State-level row) is always available alongside regions/counties.
export const SUBSET_TO_LEVELS = {
  Regions: ["Region"],
  Counties: ["County"],
  Cities: ["City"],
  Towns: ["Town"],
  State: ["State"],
};

export const AVAILABLE_SUBSETS = Object.keys(SUBSET_TO_LEVELS);

// Parsed-row cache so the CSV is read and parsed once per server process.
let cachedRows = null;

/**
 * Minimal CSV parser. The cleaned dataset has a fixed schema with no quoted fields
 * and no commas embedded in any value (verified against the pipeline output), so a
 * plain split on "," is sufficient and avoids adding a CSV-parser dependency.
 */
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(",");
    const row = {};
    for (let c = 0; c < headers.length; c += 1) {
      const key = headers[c];
      const raw = cells[c];
      if (key === "Year") {
        row[key] = Number.parseInt(raw, 10);
      } else if (NUMERIC_COLUMNS.has(key)) {
        // Blank cells (e.g. pre-2011 detailed-unit columns) become null, not 0.
        row[key] = raw === "" || raw === undefined ? null : Number.parseFloat(raw);
      } else {
        row[key] = raw;
      }
    }
    rows.push(row);
  }
  return rows;
}

/** Load and cache the full parsed dataset. */
export async function loadPopHousingData() {
  if (cachedRows) return cachedRows;
  const text = await readFile(DATA_PATH, "utf8");
  cachedRows = parseCsv(text);
  return cachedRows;
}

/** Distinct locations for a subset, sorted alphabetically. */
export async function getAvailableLocations(subset) {
  const levels = SUBSET_TO_LEVELS[subset];
  if (!levels) return [];
  const rows = await loadPopHousingData();
  const names = new Set();
  for (const row of rows) {
    if (levels.includes(row["Geographic Level"])) names.add(row.Location);
  }
  return [...names].sort();
}

/**
 * Build one line series per location for a parameter over a year range.
 *
 * Mirrors basic_visualizations.py::visualize_line: geo-level filter → optional
 * location filter → year filter → per-location (year, value) series. Indexing is
 * intentionally omitted from this basic pass.
 *
 * @returns {{ series: Array<{location, years:number[], values:Array<number|null>}>,
 *             yearRange: [number, number] }}
 */
export async function queryLineSeries({
  parameter,
  subset,
  locations = null,
  startYear = null,
  endYear = null,
}) {
  const levels = SUBSET_TO_LEVELS[subset];
  if (!levels) throw new Error(`Unknown subset: ${subset}`);
  if (!NUMERIC_COLUMNS.has(parameter)) {
    throw new Error(`Unknown parameter: ${parameter}`);
  }

  const rows = await loadPopHousingData();
  const locationFilter = locations ? new Set(locations) : null;

  // Group matching rows by location.
  const byLocation = new Map();
  for (const row of rows) {
    if (!levels.includes(row["Geographic Level"])) continue;
    if (locationFilter && !locationFilter.has(row.Location)) continue;
    if (startYear !== null && row.Year < startYear) continue;
    if (endYear !== null && row.Year > endYear) continue;

    if (!byLocation.has(row.Location)) byLocation.set(row.Location, []);
    byLocation.get(row.Location).push(row);
  }

  let minYear = Infinity;
  let maxYear = -Infinity;
  const series = [];

  for (const [location, locRows] of byLocation) {
    locRows.sort((a, b) => a.Year - b.Year);
    const years = [];
    const values = [];
    for (const row of locRows) {
      years.push(row.Year);
      values.push(row[parameter]);
      if (row.Year < minYear) minYear = row.Year;
      if (row.Year > maxYear) maxYear = row.Year;
    }
    series.push({ location, years, values });
  }

  series.sort((a, b) => a.location.localeCompare(b.location));

  return {
    series,
    yearRange: series.length ? [minYear, maxYear] : [startYear, endYear],
  };
}
