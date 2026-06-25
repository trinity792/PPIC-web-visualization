/**
 * Server-side data-access module for the cleaned Components of Change dataset.
 *
 * Mirrors lib/data/pop_housing.js: this module owns CSV reading, parsing, and
 * line-series filtering. Client components must query the API route instead of
 * importing this module directly.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

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

const NUMERIC_COLUMNS = new Set([
  "Total Population",
  "Percent Change in Population",
  "Numeric Change in Population",
  "Births",
  "Deaths",
  "Natural Increase",
  "Net Migration",
  "Net Foreign Immigration",
  "Net Domestic Migration",
  "Crude Birth Rate",
  "Crude Death Rate",
  "Crude Migration Rate",
  "Crude Domestic Migration Rate",
  "Crude Foreign Migration Rate",
]);

export const AVAILABLE_PARAMETERS = [
  "Total Population",
  "Births",
  "Deaths",
  "Natural Increase",
  "Net Migration",
  "Net Foreign Immigration",
  "Net Domestic Migration",
  "Crude Birth Rate",
  "Crude Death Rate",
  "Crude Migration Rate",
  "Crude Domestic Migration Rate",
  "Crude Foreign Migration Rate",
];

export const AVAILABLE_SOURCES = ["DoF", "Census"];

export const SUBSET_TO_LEVELS = {
  Regions: ["Region"],
  Counties: ["County"],
  States: ["State"],
};

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

  const rows = await loadComponentsOfChangeData();
  const locationFilter = locations ? new Set(locations) : null;
  const byLocation = new Map();

  for (const row of rows) {
    if (!levels.includes(row["Geographic Level"])) continue;
    if (row.Source !== source) continue;
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
