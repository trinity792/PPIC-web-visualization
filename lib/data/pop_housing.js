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

/* global process */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { POPHOUSING_SCHEMA } from "@/lib/visualization/moduleSchemas/pophousing";
import { getFeatureIdLookup } from "@/lib/data/geography";
import {
  buildCategoryValues,
  buildFullTable,
  buildLineSeries,
  buildMatrix,
  buildMeasurePairs,
  buildTwoPeriod,
  filterRows,
} from "@/lib/data/query_shapes";

const DATA_PATH = path.join(
  process.cwd(),
  "data",
  "data-cleaned",
  "housing-population",
  "PopHousing_Current.csv",
);

// Field metadata is owned by the client-safe module schema (single source of
// truth). Columns that hold numeric metrics — everything else (Location,
// Geographic Level, Source) is kept as a string; Year is handled separately.
const NUMERIC_COLUMNS = new Set(POPHOUSING_SCHEMA.numericColumns);

// Curated metric columns exposed to the UI parameter selector.
export const AVAILABLE_PARAMETERS = POPHOUSING_SCHEMA.curatedMeasures;
export const AVAILABLE_MEASURES = POPHOUSING_SCHEMA.numericColumns;

// A "subset" is a friendly grouping that maps to one or more Geographic Level
// values. California (a State-level row) is always available alongside regions.
export const SUBSET_TO_LEVELS = POPHOUSING_SCHEMA.subsets;

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

  const rows = filterRows(await loadPopHousingData(), {
    levels,
    locations,
    startYear,
    endYear,
  });
  return buildLineSeries(rows, parameter, [startYear, endYear]);
}

function validateMeasure(parameter) {
  if (!NUMERIC_COLUMNS.has(parameter)) {
    throw new Error(`Unknown parameter: ${parameter}`);
  }
}

async function filteredRows({ subset, locations = null, startYear = null, endYear = null }) {
  const levels = SUBSET_TO_LEVELS[subset];
  if (!levels) throw new Error(`Unknown subset: ${subset}`);
  return filterRows(await loadPopHousingData(), {
    levels,
    locations,
    startYear,
    endYear,
  });
}

export async function queryCategoryValues({
  parameter,
  subset,
  period = null,
  topN = null,
  sort = "value",
  locations = null,
}) {
  validateMeasure(parameter);
  const rows = await filteredRows({ subset, locations });
  return buildCategoryValues(rows, parameter, { period, topN, sort });
}

export async function queryTwoPeriod({
  parameter,
  subset,
  startYear = null,
  endYear = null,
  locations = null,
}) {
  validateMeasure(parameter);
  const rows = await filteredRows({ subset, locations });
  return buildTwoPeriod(rows, parameter, { startYear, endYear });
}

export async function queryMeasurePairs({
  xMeasure,
  yMeasure,
  sizeMeasure = null,
  subset,
  period = null,
  locations = null,
}) {
  validateMeasure(xMeasure);
  validateMeasure(yMeasure);
  if (sizeMeasure) validateMeasure(sizeMeasure);
  const rows = await filteredRows({ subset, locations });
  return buildMeasurePairs(rows, { xMeasure, yMeasure, sizeMeasure, period });
}

export async function queryMatrix({
  parameter,
  subset,
  startYear = null,
  endYear = null,
  locations = null,
}) {
  validateMeasure(parameter);
  const rows = await filteredRows({ subset, locations, startYear, endYear });
  return buildMatrix(rows, parameter);
}

export async function queryGeoValues({
  parameter,
  subset,
  period = null,
}) {
  validateMeasure(parameter);
  if (subset !== "Counties") {
    throw new Error("County geometry requires the Counties subset.");
  }
  const rows = await filteredRows({ subset });
  const result = buildCategoryValues(rows, parameter, { period, sort: "name" });
  const ids = await getFeatureIdLookup("counties");
  const unmatched = result.records
    .filter((record) => !ids.has(record.location))
    .map((record) => record.location);
  return {
    period: result.period,
    featureidkey: "properties.GEOID",
    records: result.records
      .filter((record) => ids.has(record.location))
      .map((record) => ({ ...record, geoid: ids.get(record.location) })),
    unmatched,
  };
}

/**
 * Latest-year statewide snapshot for the landing-page stat cards. Returns the
 * most recent California (State-level) value for each requested measure.
 * @returns {Promise<{ year: number|null, values: Record<string, number|null> }>}
 */
export async function queryStatewideStats(parameters) {
  const rows = (await loadPopHousingData()).filter(
    (row) => row["Geographic Level"] === "State",
  );
  if (!rows.length) return { year: null, values: {} };
  const year = Math.max(...rows.map((row) => row.Year));
  const latest = rows.find((row) => row.Year === year);
  const values = {};
  for (const parameter of parameters) {
    values[parameter] = latest ? (latest[parameter] ?? null) : null;
  }
  return { year, values };
}

/**
 * Latest-year population + housing-unit totals per region, for the landing-page
 * region table. Sorted by population, descending.
 * @returns {Promise<{ year: number|null, rows: Array<{region, population, housingUnits}> }>}
 */
export async function queryRegionTable() {
  const rows = (await loadPopHousingData()).filter(
    (row) => row["Geographic Level"] === "Region",
  );
  if (!rows.length) return { year: null, rows: [] };
  const year = Math.max(...rows.map((row) => row.Year));
  const table = rows
    .filter((row) => row.Year === year)
    .map((row) => ({
      region: row.Location,
      population: row["Total Population"],
      housingUnits: row["Total Housing Units"],
    }))
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
  return { year, rows: table };
}

/**
 * Full-width source table for the "View original data" step (view=table): every
 * CSV column, either for the chart's current geography/source/period filters or,
 * when `full`, the entire file. Stratification is intentionally NOT applied — the
 * point is to reveal the columns a chart view collapses.
 */
export async function queryFullTable({
  subset,
  source = null,
  locations = null,
  startYear = null,
  endYear = null,
  full = false,
} = {}) {
  const rows = await loadPopHousingData();
  if (full) return buildFullTable(rows, { full: true });
  const levels = SUBSET_TO_LEVELS[subset];
  if (!levels) throw new Error(`Unknown subset: ${subset}`);
  return buildFullTable(rows, { levels, source, locations, startYear, endYear });
}
