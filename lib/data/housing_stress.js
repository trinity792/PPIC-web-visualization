/**
 * Server-side data-access module for the cleaned ACS Housing Stress dataset.
 *
 * Mirrors lib/data/demographic_projections.js: this module owns CSV reading,
 * parsing, stratification filtering, and query shaping. Client components must
 * query the API route instead of importing this module directly.
 *
 * The contract CSV stores four cost-burden measures per
 * (Year, Geographic Level, Location, Race/Ethnicity, Tenure). Pinning one race
 * and one tenure already yields exactly one row per (Location, Year), so — unlike
 * the projections module — no cross-stratum summation is needed. Shares are never
 * summed; a zero-denominator share arrives as null and is passed through as a gap.
 */

/* global process */
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildCategoryValues,
  buildLineSeries,
  buildMatrix,
  buildTwoPeriod,
  filterRows,
} from "@/lib/data/query_shapes";
import { getFeatureIdLookup } from "@/lib/data/geography";
import { HOUSING_STRESS_SCHEMA } from "@/lib/visualization/moduleSchemas/housingStress";

const DATA_RELATIVE_PATH = path.join(
  "data",
  "data-cleaned",
  "housing-stress",
  "HousingStress_Current.csv",
);

const DATA_PATH = path.join(process.cwd(), DATA_RELATIVE_PATH);

// Field metadata is owned by the client-safe module schema (single source of truth).
const NUMERIC_COLUMNS = new Set(HOUSING_STRESS_SCHEMA.numericColumns);
const MEASURE_MATRIX = HOUSING_STRESS_SCHEMA.measureMatrix;

export const SUBSET_TO_LEVELS = HOUSING_STRESS_SCHEMA.subsets;
export const AVAILABLE_SUBSETS = Object.keys(SUBSET_TO_LEVELS);
export const THRESHOLDS = HOUSING_STRESS_SCHEMA.thresholds;
export const BASES = HOUSING_STRESS_SCHEMA.bases.map((basis) => basis.key);

const DEFAULTS = Object.fromEntries(
  HOUSING_STRESS_SCHEMA.filterDimensions.map((dimension) => [
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

export async function loadHousingStressData() {
  if (cachedRows) return cachedRows;
  let text;
  try {
    text = await readFile(DATA_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `ACS Housing Stress dataset not found at ${DATA_RELATIVE_PATH}. Run the housing stress pipeline to generate it.`,
      );
    }
    throw error;
  }
  cachedRows = parseCsv(text);
  return cachedRows;
}

/**
 * Resolve the measure column a request selects. An explicit `parameter` wins when
 * valid; otherwise a `basis` ("number"|"share") and `threshold` (30|50) select
 * one of the four measure columns, falling back to the schema defaults.
 */
export function resolveMeasureColumn({ parameter = null, basis = null, threshold = null }) {
  if (parameter) {
    if (!NUMERIC_COLUMNS.has(parameter)) {
      throw new Error(`Unknown measure '${parameter}'.`);
    }
    return parameter;
  }
  const resolvedBasis = basis || HOUSING_STRESS_SCHEMA.defaultBasis;
  const resolvedThreshold = threshold ?? HOUSING_STRESS_SCHEMA.defaultThreshold;
  const column = MEASURE_MATRIX[resolvedBasis]?.[resolvedThreshold];
  if (!column) {
    throw new Error(`Unknown measure for basis '${resolvedBasis}' and threshold '${resolvedThreshold}'.`);
  }
  return column;
}

/** Filter to one geographic subset, race, and tenure — one row per (Location, Year). */
async function filteredRows({
  subset,
  locations = null,
  startYear = null,
  endYear = null,
  raceEthnicity = null,
  tenure = null,
}) {
  const levels = SUBSET_TO_LEVELS[subset];
  if (!levels) throw new Error(`Unknown subset: ${subset}`);

  const race = raceEthnicity || DEFAULTS["Race/Ethnicity"];
  const householderTenure = tenure || DEFAULTS.Tenure;

  return filterRows(await loadHousingStressData(), {
    levels,
    locations,
    startYear,
    endYear,
  }).filter(
    (row) => row["Race/Ethnicity"] === race && row.Tenure === householderTenure,
  );
}

export async function queryLineSeries(params) {
  const parameter = resolveMeasureColumn(params);
  const { startYear = null, endYear = null } = params;
  const rows = await filteredRows(params);
  return buildLineSeries(rows, parameter, [startYear, endYear]);
}

export async function queryCategoryValues(params) {
  const parameter = resolveMeasureColumn(params);
  const { period = null, topN = null, sort = "value" } = params;
  const rows = await filteredRows(params);
  return buildCategoryValues(rows, parameter, { period, topN, sort });
}

export async function queryTwoPeriod(params) {
  const parameter = resolveMeasureColumn(params);
  const { startYear = null, endYear = null } = params;
  const rows = await filteredRows(params);
  return buildTwoPeriod(rows, parameter, { startYear, endYear });
}

export async function queryMatrix(params) {
  const parameter = resolveMeasureColumn(params);
  const rows = await filteredRows(params);
  return buildMatrix(rows, parameter);
}

export async function queryGeoValues(params) {
  if (params.subset !== "Counties") {
    throw new Error("County geometry requires the Counties subset.");
  }
  const parameter = resolveMeasureColumn(params);
  const rows = await filteredRows(params);
  const result = buildCategoryValues(rows, parameter, {
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
