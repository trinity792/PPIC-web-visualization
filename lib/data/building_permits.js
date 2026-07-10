/**
 * Server-side data-access module for the cleaned Building Permits dataset.
 *
 * Pattern mirrors lib/data/pop_housing.js: this module owns CSV reading, parsing,
 * derivation, subset resolution, and query shaping. Client components query the
 * API route instead of importing this module directly (it uses node:fs).
 *
 * Building Permits is the only MONTHLY module — its temporal axis is `Date`
 * ("YYYY-MM"), not an integer Year — so it carries its own month-aware shaping
 * rather than the year-based lib/data/query_shapes.js. The stored CSV holds only
 * the five raw structure-size counts per (Date, Geographic Level, Location); this
 * layer derives `2+ Units`, the `Rest of US` location, and the 9-region aggregate
 * on demand, and applies the trailing-12-month ("year-to-date") and index-to-100
 * transforms. A zero baseline yields null (a chart gap), never Infinity — closing
 * the legacy divide-by-zero hole.
 */

/* global process */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getFeatureIdLookup } from "@/lib/data/geography";
import {
  METRO_TO_COUNTIES,
  METRO_TO_REGION,
  REGION_TO_METROS,
} from "@/lib/geography/californiaGeography";
import {
  BUILDING_PERMITS_SCHEMA,
  BUILDING_PERMITS_DERIVED_MEASURE,
} from "@/lib/visualization/moduleSchemas/buildingPermits";

const DATA_RELATIVE_PATH = path.join(
  "data",
  "data-cleaned",
  "building-permits",
  "BuildingPermits_Current.csv",
);
const DATA_PATH = path.join(process.cwd(), DATA_RELATIVE_PATH);

const RAW_MEASURES = BUILDING_PERMITS_SCHEMA.rawMeasures;
const NUMERIC_COLUMNS = new Set(BUILDING_PERMITS_SCHEMA.numericColumns);
const DERIVED_MEASURE = BUILDING_PERMITS_DERIVED_MEASURE; // "2+ Units"
const MULTIFAMILY_PARTS = ["2 Units", "3 and 4 Units", "5 Units or More"];
const REST_OF_US = BUILDING_PERMITS_SCHEMA.restOfUsLocation;
const REGION_SUBSET = BUILDING_PERMITS_SCHEMA.regionSubset;
const ROLLING_WINDOW = 12; // trailing-12-month ("year-to-date") sum

export const SUBSET_TO_LEVELS = BUILDING_PERMITS_SCHEMA.subsets;
export const AVAILABLE_SUBSETS = Object.keys(SUBSET_TO_LEVELS);
export const AVAILABLE_PARAMETERS = BUILDING_PERMITS_SCHEMA.curatedMeasures;

let cachedRows = null;

/* ------------------------------------------------------------------ parsing */

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
      row[key] = NUMERIC_COLUMNS.has(key)
        ? raw === "" || raw === undefined
          ? null
          : Number.parseFloat(raw)
        : raw;
    }
    // Derived measure: multifamily units (2+).
    row[DERIVED_MEASURE] = MULTIFAMILY_PARTS.reduce(
      (sum, part) => sum + (row[part] ?? 0),
      0,
    );
    rows.push(row);
  }
  return rows;
}

export async function loadBuildingPermitsData() {
  if (cachedRows) return cachedRows;
  let text;
  try {
    text = await readFile(DATA_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `Building Permits dataset not found at ${DATA_RELATIVE_PATH}. Run the building permits pipeline to generate it.`,
      );
    }
    throw error;
  }
  cachedRows = parseCsv(text);
  return cachedRows;
}

/* ------------------------------------------------------------- derivations */

function zeroMeasures() {
  const measures = {};
  for (const measure of RAW_MEASURES) measures[measure] = 0;
  return measures;
}

function finalizeDerived(row) {
  row[DERIVED_MEASURE] = MULTIFAMILY_PARTS.reduce(
    (sum, part) => sum + (row[part] ?? 0),
    0,
  );
  return row;
}

/** Sum all non-California state rows into a single "Rest of US" row per month. */
function buildRestOfUs(stateRows) {
  const byDate = new Map();
  for (const row of stateRows) {
    if (row.Location === "California") continue;
    let accumulator = byDate.get(row.Date);
    if (!accumulator) {
      accumulator = { "Geographic Level": "State", Location: REST_OF_US, Date: row.Date, ...zeroMeasures() };
      byDate.set(row.Date, accumulator);
    }
    for (const measure of RAW_MEASURES) accumulator[measure] += row[measure] ?? 0;
  }
  return [...byDate.values()].map(finalizeDerived);
}

/**
 * Sum the 26 metro rows into the 9 shared region aggregates per month, using the
 * JS mirror of metro_to_region_mapping. Region totals cover metropolitan counties
 * only (the caveat is surfaced by the API/UI, not hidden here).
 */
export function aggregateToRegions(metroRows) {
  const byKey = new Map();
  for (const row of metroRows) {
    const region = METRO_TO_REGION[row.Location];
    if (!region) continue;
    const key = `${region}|${row.Date}`;
    let accumulator = byKey.get(key);
    if (!accumulator) {
      accumulator = { "Geographic Level": "Region", Location: region, Date: row.Date, ...zeroMeasures() };
      byKey.set(key, accumulator);
    }
    for (const measure of RAW_MEASURES) accumulator[measure] += row[measure] ?? 0;
  }
  return [...byKey.values()].map(finalizeDerived);
}

/** Resolve the full row set backing a subset (before location/month filtering). */
function subsetRows(allRows, subset) {
  if (subset === "States") {
    const states = allRows.filter((row) => row["Geographic Level"] === "State");
    return states.concat(buildRestOfUs(states));
  }
  if (subset === "Metros") {
    return allRows.filter((row) => row["Geographic Level"] === "Metro");
  }
  if (subset === REGION_SUBSET) {
    return aggregateToRegions(allRows.filter((row) => row["Geographic Level"] === "Metro"));
  }
  throw new Error(`Unknown subset: ${subset}`);
}

/* --------------------------------------------------------------- filtering */

function resolvePermitType(permitType) {
  const measure = permitType || "Total";
  if (!NUMERIC_COLUMNS.has(measure)) {
    throw new Error(`Unknown permit type '${permitType}'.`);
  }
  return measure;
}

/** Year param (int) → inclusive month bound; explicit YYYY-MM wins. */
function monthBound(month, year, edge) {
  if (month) return month;
  if (year === null || year === undefined) return null;
  return edge === "start" ? `${year}-01` : `${year}-12`;
}

function filterMonthlyRows(rows, { locations, startMonth, endMonth }) {
  const locationFilter = locations?.length ? new Set(locations) : null;
  return rows.filter((row) => {
    if (locationFilter && !locationFilter.has(row.Location)) return false;
    if (startMonth && row.Date < startMonth) return false;
    if (endMonth && row.Date > endMonth) return false;
    return true;
  });
}

async function resolveRows(params) {
  const { subset } = params;
  if (!SUBSET_TO_LEVELS[subset]) throw new Error(`Unknown subset: ${subset}`);
  const rows = subsetRows(await loadBuildingPermitsData(), subset);
  return filterMonthlyRows(rows, {
    locations: params.locations ?? null,
    startMonth: monthBound(params.startMonth, params.startYear, "start"),
    endMonth: monthBound(params.endMonth, params.endYear, "end"),
  });
}

/* ---------------------------------------------------------------- shaping */

function monthRangeOf(rows) {
  if (!rows.length) return [null, null];
  let min = rows[0].Date;
  let max = rows[0].Date;
  for (const row of rows) {
    if (row.Date < min) min = row.Date;
    if (row.Date > max) max = row.Date;
  }
  return [min, max];
}

/** Trailing-N rolling sum over a contiguous monthly value array (null until full). */
function trailingSum(values, window) {
  return values.map((_, index) => {
    if (index + 1 < window) return null;
    let sum = 0;
    for (let k = index - window + 1; k <= index; k += 1) {
      if (values[k] === null || values[k] === undefined) return null;
      sum += values[k];
    }
    return sum;
  });
}

/** Index a value array to 100 at the baseline (given month, else first non-null). */
function indexToHundred(dates, values, baselineMonth) {
  let baseIndex = -1;
  if (baselineMonth) baseIndex = dates.indexOf(baselineMonth);
  if (baseIndex < 0) baseIndex = values.findIndex((value) => value !== null && value !== undefined);
  const base = baseIndex >= 0 ? values[baseIndex] : null;
  // Zero (or missing) baseline → the whole series is a gap, never Infinity.
  if (!base) return values.map(() => null);
  return values.map((value) => (value === null || value === undefined ? null : (value / base) * 100));
}

function buildLineSeries(rows, measure, { aggregated, indexed, baselineMonth }) {
  const byLocation = new Map();
  for (const row of rows) {
    if (!byLocation.has(row.Location)) byLocation.set(row.Location, []);
    byLocation.get(row.Location).push(row);
  }

  const series = [...byLocation.entries()]
    .map(([location, locationRows]) => {
      locationRows.sort((a, b) => a.Date.localeCompare(b.Date));
      const dates = locationRows.map((row) => row.Date);
      let values = locationRows.map((row) => row[measure]);
      if (aggregated) values = trailingSum(values, ROLLING_WINDOW);
      if (indexed) values = indexToHundred(dates, values, baselineMonth);
      // The render/transform layer keys on `years`; monthly labels ride that key.
      return { location, years: dates, values };
    })
    .sort((a, b) => a.location.localeCompare(b.location));

  const [minMonth, maxMonth] = monthRangeOf(rows);
  return { series, yearRange: [minMonth, maxMonth], monthRange: [minMonth, maxMonth] };
}

function buildTwoPeriod(rows, measure, { startMonth, endMonth }) {
  const [available0, available1] = monthRangeOf(rows);
  const start = startMonth ?? available0;
  const end = endMonth ?? available1;
  const byLocation = new Map();
  for (const row of rows) {
    if (row.Date !== start && row.Date !== end) continue;
    if (!byLocation.has(row.Location)) byLocation.set(row.Location, {});
    byLocation.get(row.Location)[row.Date] = row[measure];
  }

  const records = [...byLocation.entries()]
    .filter(([, values]) => Object.hasOwn(values, start) && Object.hasOwn(values, end))
    .map(([location, values]) => ({
      location,
      category: location,
      start: values[start],
      end: values[end],
      // Percent change against a zero baseline is a gap, never Infinity.
      percentChange: values[start] ? ((values[end] - values[start]) / values[start]) * 100 : null,
      numericChange: (values[end] ?? 0) - (values[start] ?? 0),
      startYear: start,
      endYear: end,
    }))
    .sort((a, b) => b.numericChange - a.numericChange);

  return { startYear: start, endYear: end, records };
}

/* ----------------------------------------------------------------- queries */

export async function queryLineSeries(params) {
  const measure = resolvePermitType(params.permitType);
  const rows = await resolveRows(params);
  const result = buildLineSeries(rows, measure, {
    aggregated: Boolean(params.aggregated),
    indexed: Boolean(params.indexed),
    baselineMonth: params.baselineMonth ?? null,
  });
  return withRegionCaveat(params.subset, result);
}

export async function queryTwoPeriod(params) {
  const measure = resolvePermitType(params.permitType);
  const rows = await resolveRows(params);
  const result = buildTwoPeriod(rows, measure, {
    startMonth: monthBound(params.startMonth, params.startYear, "start"),
    endMonth: monthBound(params.endMonth, params.endYear, "end"),
  });
  return withRegionCaveat(params.subset, result);
}

/**
 * Choropleth values. BPS cannot split a multi-county CBSA into counties, so a
 * metro/region value is BROADCAST across its member-county polygons (a display
 * choice, per the spec) — no random-bin imputation. Returns one record per county.
 */
export async function queryGeoValues(params) {
  const measure = resolvePermitType(params.permitType);
  const rows = await resolveRows(params);
  const [, latest] = monthRangeOf(rows);
  const period = params.period ?? latest;

  const countyIds = await getFeatureIdLookup("counties");
  const records = [];
  const unmatched = [];
  for (const row of rows) {
    if (row.Date !== period) continue;
    const counties =
      params.subset === REGION_SUBSET
        ? (REGION_TO_METROS[row.Location] ?? []).flatMap((metro) => METRO_TO_COUNTIES[metro] ?? [])
        : METRO_TO_COUNTIES[row.Location] ?? [];
    for (const county of counties) {
      if (!countyIds.has(county)) {
        unmatched.push(county);
        continue;
      }
      records.push({
        location: county,
        geoid: countyIds.get(county),
        group: row.Location,
        value: row[measure],
        period,
      });
    }
  }
  records.sort((a, b) => a.location.localeCompare(b.location));
  return withRegionCaveat(params.subset, {
    period,
    featureidkey: "properties.GEOID",
    records,
    unmatched: [...new Set(unmatched)],
  });
}

function withRegionCaveat(subset, result) {
  if (subset === REGION_SUBSET) {
    return { ...result, caveat: BUILDING_PERMITS_SCHEMA.regionCaveat };
  }
  return result;
}

/**
 * Full-width source table for the "View original data" step (view=table): every
 * CSV column, either for the chart's current subset/location/month window or,
 * when `full`, the entire parsed file (raw metro/state rows, no derived
 * regions/rest-of-US). The permit-type narrowing a chart view applies is
 * intentionally dropped so all measure columns are visible.
 */
export async function queryFullTable({
  subset,
  locations = null,
  startMonth = null,
  endMonth = null,
  startYear = null,
  endYear = null,
  full = false,
} = {}) {
  const rows = await loadBuildingPermitsData();
  if (full) return { records: rows, rowCount: rows.length };
  if (!SUBSET_TO_LEVELS[subset]) throw new Error(`Unknown subset: ${subset}`);
  const records = filterMonthlyRows(subsetRows(rows, subset), {
    locations,
    startMonth: monthBound(startMonth, startYear, "start"),
    endMonth: monthBound(endMonth, endYear, "end"),
  });
  return { records, rowCount: records.length };
}
