/**
 * Server-side data-access module for the cleaned Age, Sex & Race Projections dataset.
 *
 * Mirrors lib/data/components_of_change.js: this module owns CSV reading,
 * parsing, stratification filtering, and query shaping. Client components must
 * query the API route instead of importing this module directly.
 *
 * The contract CSV stores one Population value per
 * (Location, Year, Age Group, Sex, Race/Ethnicity, Source), including the
 * precomputed "All Ages" / "Both Sexes" / "All" aggregate rows. Every query pins
 * one value per stratification dimension, then sums to one Population per
 * (Location, Year) before shaping — so a single 5-year group, a precomputed
 * aggregate, or an `ageGrouping` preset (summed from its 5-year bins) all reduce
 * to a clean per-location time series.
 */

/* global process */
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildCategoryValues,
  buildFullTable,
  buildLineSeries,
  buildMatrix,
  buildTwoPeriod,
  filterRows,
} from "@/lib/data/query_shapes";
import { getFeatureIdLookup } from "@/lib/data/geography";
import { DEMOGRAPHIC_PROJECTIONS_SCHEMA } from "@/lib/visualization/moduleSchemas/demographicProjections";

const DATA_RELATIVE_PATH = path.join(
  "data",
  "data-cleaned",
  "demographic-projections",
  "DemographicProjections_Current.csv",
);

const DATA_PATH = path.join(process.cwd(), DATA_RELATIVE_PATH);

// Field metadata is owned by the client-safe module schema (single source of truth).
const NUMERIC_COLUMNS = new Set(DEMOGRAPHIC_PROJECTIONS_SCHEMA.numericColumns);
const PARAMETER = "Population";

export const SUBSET_TO_LEVELS = DEMOGRAPHIC_PROJECTIONS_SCHEMA.subsets;
export const AVAILABLE_SUBSETS = Object.keys(SUBSET_TO_LEVELS);
export const AVAILABLE_SOURCES = DEMOGRAPHIC_PROJECTIONS_SCHEMA.sources;
export const AGE_PRESETS = DEMOGRAPHIC_PROJECTIONS_SCHEMA.ageGroupPresets;

const DEFAULTS = Object.fromEntries(
  DEMOGRAPHIC_PROJECTIONS_SCHEMA.filterDimensions.map((dimension) => [
    dimension.column,
    dimension.default,
  ]),
);

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
      if (key === "Year") {
        row[key] = Number.parseInt(raw, 10);
      } else if (NUMERIC_COLUMNS.has(key)) {
        row[key] = raw === "" || raw === undefined ? null : Number.parseFloat(raw);
      } else {
        row[key] = raw;
      }
    }
    rows.push(row);
  }
  return rows;
}

export async function loadProjectionsData() {
  if (cachedRows) return cachedRows;
  let text;
  try {
    text = await readFile(DATA_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `Demographic Projections dataset not found at ${DATA_RELATIVE_PATH}. Run the projections pipeline to generate it.`,
      );
    }
    throw error;
  }
  cachedRows = parseCsv(text);
  return cachedRows;
}

/**
 * Resolve which stored Age Group labels a request selects. When `ageGrouping`
 * is supplied it names either a default preset or an explicit comma/JSON list of
 * 5-year groups to sum; otherwise a single `ageGroup` (default "All Ages").
 */
function resolveAgeGroups({ ageGroup = null, ageGrouping = null }) {
  if (!ageGrouping) {
    return [ageGroup || DEFAULTS["Age Group"]];
  }
  if (AGE_PRESETS[ageGrouping]) {
    return AGE_PRESETS[ageGrouping];
  }
  const trimmed = ageGrouping.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error("'ageGrouping' JSON must be an array of 5-year age-group labels.");
    }
    return parsed;
  }
  return trimmed.split(",").map((value) => value.trim()).filter(Boolean);
}

/** Filter to one stratum, then sum to a single Population per (Location, Year). */
function stratifiedRows(rows, {
  levels,
  source,
  locations,
  startYear,
  endYear,
  ageGroups,
  sex,
  race,
}) {
  const ageFilter = new Set(ageGroups);
  const base = filterRows(rows, { levels, source, locations, startYear, endYear }).filter(
    (row) =>
      ageFilter.has(row["Age Group"]) &&
      row.Sex === sex &&
      row["Race/Ethnicity"] === race,
  );

  const byLocationYear = new Map();
  for (const row of base) {
    const key = `${row.Location}|${row.Year}`;
    const existing = byLocationYear.get(key);
    if (existing) {
      existing[PARAMETER] += row[PARAMETER] ?? 0;
    } else {
      byLocationYear.set(key, {
        Location: row.Location,
        Year: row.Year,
        [PARAMETER]: row[PARAMETER] ?? 0,
      });
    }
  }
  return [...byLocationYear.values()];
}

async function filteredRows({
  subset,
  source,
  locations = null,
  startYear = null,
  endYear = null,
  ageGroup = null,
  ageGrouping = null,
  sex = null,
  raceEthnicity = null,
}) {
  const levels = SUBSET_TO_LEVELS[subset];
  if (!levels) throw new Error(`Unknown subset: ${subset}`);
  if (!AVAILABLE_SOURCES.includes(source)) throw new Error(`Unknown source: ${source}`);

  return stratifiedRows(await loadProjectionsData(), {
    levels,
    source,
    locations,
    startYear,
    endYear,
    ageGroups: resolveAgeGroups({ ageGroup, ageGrouping }),
    sex: sex || DEFAULTS.Sex,
    race: raceEthnicity || DEFAULTS["Race/Ethnicity"],
  });
}

export async function queryLineSeries(params) {
  const { startYear = null, endYear = null } = params;
  const rows = await filteredRows(params);
  return buildLineSeries(rows, PARAMETER, [startYear, endYear]);
}

export async function queryCategoryValues(params) {
  const { period = null, topN = null, sort = "value" } = params;
  const rows = await filteredRows(params);
  return buildCategoryValues(rows, PARAMETER, { period, topN, sort });
}

export async function queryTwoPeriod(params) {
  const { startYear = null, endYear = null } = params;
  const rows = await filteredRows(params);
  return buildTwoPeriod(rows, PARAMETER, { startYear, endYear });
}

export async function queryMatrix(params) {
  const rows = await filteredRows(params);
  return buildMatrix(rows, PARAMETER);
}

export async function queryGeoValues(params) {
  if (params.subset !== "Counties") {
    throw new Error("County geometry requires the Counties subset.");
  }
  const rows = await filteredRows(params);
  const result = buildCategoryValues(rows, PARAMETER, {
    period: params.period ?? null,
    sort: "name",
  });
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
 * Full-width source table for the "View original data" step (view=table): every
 * CSV column, either for the chart's current geography/source/period filters or,
 * when `full`, the entire file. Stratification (age/sex/race) is intentionally
 * NOT applied — the point is to reveal the columns a chart view collapses.
 */
export async function queryFullTable({
  subset,
  source = null,
  locations = null,
  startYear = null,
  endYear = null,
  full = false,
} = {}) {
  const rows = await loadProjectionsData();
  if (full) return buildFullTable(rows, { full: true });
  const levels = SUBSET_TO_LEVELS[subset];
  if (!levels) throw new Error(`Unknown subset: ${subset}`);
  return buildFullTable(rows, { levels, source, locations, startYear, endYear });
}
