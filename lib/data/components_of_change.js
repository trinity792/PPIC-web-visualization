/**
 * Server-side data-access module for the cleaned Components of Change dataset.
 *
 * Mirrors lib/data/pop_housing.js: this module owns CSV reading, parsing, and
 * line-series filtering. Client components must query the API route instead of
 * importing this module directly.
 */

/* global process */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { COMPONENTS_OF_CHANGE_SCHEMA } from "@/lib/visualization/moduleSchemas/componentsOfChange";
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

const DATA_RELATIVE_PATH = path.join(
  "data",
  "data-cleaned",
  "components-of-change",
  "ComponentsOfChange_Current.csv",
);

const DATA_PATH = path.join(
  process.cwd(),
  DATA_RELATIVE_PATH,
);

// Field metadata is owned by the client-safe module schema (single source of truth).
const NUMERIC_COLUMNS = new Set(COMPONENTS_OF_CHANGE_SCHEMA.numericColumns);

export const AVAILABLE_PARAMETERS = COMPONENTS_OF_CHANGE_SCHEMA.curatedMeasures;
export const AVAILABLE_MEASURES = COMPONENTS_OF_CHANGE_SCHEMA.numericColumns;

export const AVAILABLE_SOURCES = COMPONENTS_OF_CHANGE_SCHEMA.sources;

export const SUBSET_TO_LEVELS = COMPONENTS_OF_CHANGE_SCHEMA.subsets;

export const AVAILABLE_SUBSETS = Object.keys(SUBSET_TO_LEVELS);

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

export async function loadComponentsOfChangeData() {
  if (cachedRows) return cachedRows;
  let text;
  try {
    text = await readFile(DATA_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `Components of Change dataset not found at ${DATA_RELATIVE_PATH}. Run the Components pipeline to generate it.`,
      );
    }
    throw error;
  }
  cachedRows = parseCsv(text);
  return cachedRows;
}

export async function queryLineSeries({
  parameter,
  subset,
  source,
  locations = null,
  startYear = null,
  endYear = null,
}) {
  const levels = SUBSET_TO_LEVELS[subset];
  if (!levels) throw new Error(`Unknown subset: ${subset}`);
  if (!NUMERIC_COLUMNS.has(parameter)) {
    throw new Error(`Unknown parameter: ${parameter}`);
  }
  if (!AVAILABLE_SOURCES.includes(source)) {
    throw new Error(`Unknown source: ${source}`);
  }

  const rows = filterRows(await loadComponentsOfChangeData(), {
    levels,
    source,
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

async function filteredRows({
  subset,
  source,
  locations = null,
  startYear = null,
  endYear = null,
}) {
  const levels = SUBSET_TO_LEVELS[subset];
  if (!levels) throw new Error(`Unknown subset: ${subset}`);
  if (!AVAILABLE_SOURCES.includes(source)) throw new Error(`Unknown source: ${source}`);
  return filterRows(await loadComponentsOfChangeData(), {
    levels,
    source,
    locations,
    startYear,
    endYear,
  });
}

export async function queryCategoryValues({
  parameter,
  subset,
  source,
  period = null,
  topN = null,
  sort = "value",
  locations = null,
}) {
  validateMeasure(parameter);
  const rows = await filteredRows({ subset, source, locations });
  return buildCategoryValues(rows, parameter, { period, topN, sort });
}

export async function queryTwoPeriod({
  parameter,
  subset,
  source,
  startYear = null,
  endYear = null,
  locations = null,
}) {
  validateMeasure(parameter);
  const rows = await filteredRows({ subset, source, locations });
  return buildTwoPeriod(rows, parameter, { startYear, endYear });
}

export async function queryMeasurePairs({
  xMeasure,
  yMeasure,
  sizeMeasure = null,
  subset,
  source,
  period = null,
  locations = null,
}) {
  validateMeasure(xMeasure);
  validateMeasure(yMeasure);
  if (sizeMeasure) validateMeasure(sizeMeasure);
  const rows = await filteredRows({ subset, source, locations });
  return buildMeasurePairs(rows, { xMeasure, yMeasure, sizeMeasure, period });
}

export async function queryMatrix({
  parameter,
  subset,
  source,
  startYear = null,
  endYear = null,
  locations = null,
}) {
  validateMeasure(parameter);
  const rows = await filteredRows({
    subset,
    source,
    locations,
    startYear,
    endYear,
  });
  return buildMatrix(rows, parameter);
}

export async function queryGeoValues({
  parameter,
  subset,
  source,
  period = null,
}) {
  validateMeasure(parameter);
  if (subset !== "Counties") {
    throw new Error("County geometry requires the Counties subset.");
  }
  const rows = await filteredRows({ subset, source });
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
  const rows = await loadComponentsOfChangeData();
  if (full) return buildFullTable(rows, { full: true });
  const levels = SUBSET_TO_LEVELS[subset];
  if (!levels) throw new Error(`Unknown subset: ${subset}`);
  return buildFullTable(rows, { levels, source, locations, startYear, endYear });
}
