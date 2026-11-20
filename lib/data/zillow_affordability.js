/**
 * Server-side data-access module for the cleaned Zillow Housing Affordability dataset.
 *
 * Mirrors lib/data/housing_stress.js minus its legacy-file merge and chart-shaped
 * views: this module owns CSV reading, parsing, and the two GET shapes the API
 * still serves (locations, table). Charts go through the generic v3 adapter, which
 * loads every row via queryFullTable({ full: true }). Client components must query
 * the API route instead of importing this module directly.
 *
 * `Date` stays a "YYYY-MM" string (the v3 monthly period token). Blank measure
 * cells (measures a scenario does not have, early renter months, and the
 * hand-blanked 2013 Zillow error) parse to null and render as gaps.
 */

/* global process */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildFullTable, buildLocationList } from "@/lib/data/query_shapes";
import { ZILLOW_AFFORDABILITY_SCHEMA } from "@/lib/visualization/moduleSchemas/zillowAffordability";

const DATA_RELATIVE_PATH = path.join(
  "data",
  "data-cleaned",
  "zillow-affordability",
  "ZillowAffordability_Current.csv",
);
const DATA_PATH = path.join(process.cwd(), DATA_RELATIVE_PATH);

// Field metadata is owned by the client-safe module schema (single source of truth).
const NUMERIC_COLUMNS = new Set(ZILLOW_AFFORDABILITY_SCHEMA.numericColumns);

export const SUBSET_TO_LEVELS = ZILLOW_AFFORDABILITY_SCHEMA.subsets;
export const AVAILABLE_SUBSETS = Object.keys(SUBSET_TO_LEVELS);

let cachedRows = null;

// ── CSV parsing ───────────────────────────────────────────────────────────────

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

export function parseZillowAffordabilityCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    for (let c = 0; c < headers.length; c += 1) {
      const key = headers[c];
      const raw = cells[c];
      row[key] = NUMERIC_COLUMNS.has(key)
        ? raw === "" || raw === undefined ? null : Number.parseFloat(raw)
        : raw;
    }
    rows.push(row);
  }
  return rows;
}

export async function loadZillowAffordabilityData() {
  if (cachedRows) return cachedRows;
  let text;
  try {
    text = await readFile(DATA_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `Zillow Housing Affordability dataset not found at ${DATA_RELATIVE_PATH}. Run the zillow affordability pipeline to generate it.`,
      );
    }
    throw error;
  }
  cachedRows = parseZillowAffordabilityCsv(text);
  return cachedRows;
}

// ── Queries ───────────────────────────────────────────────────────────────────

function rowsForSubset(rows, subset) {
  const levels = SUBSET_TO_LEVELS[subset];
  if (!levels) throw new Error(`Unknown subset: ${subset}`);
  return rows.filter((row) => levels.includes(row["Geographic Level"]));
}

/** Distinct location names for one geographic subset, for the sidebar's multi-select. */
export async function queryLocations({ subset }) {
  const rows = rowsForSubset(await loadZillowAffordabilityData(), subset);
  return { subset, locations: buildLocationList(rows) };
}

/**
 * Full-width source table for the "View original data" step (view=table): every
 * CSV column, either the whole file (`full`) or one subset narrowed by locations
 * and an inclusive calendar-year range on the monthly `Date`.
 */
export async function queryFullTable({
  subset,
  locations = null,
  startYear = null,
  endYear = null,
  full = false,
} = {}) {
  const rows = await loadZillowAffordabilityData();
  if (full) return buildFullTable(rows, { full: true });
  const wanted = locations?.length ? new Set(locations) : null;
  const records = rowsForSubset(rows, subset).filter((row) => {
    const year = Number.parseInt(row.Date, 10);
    return (
      (!wanted || wanted.has(row.Location)) &&
      (startYear === null || year >= startYear) &&
      (endYear === null || year <= endYear)
    );
  });
  return { records, rowCount: records.length };
}
