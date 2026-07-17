/**
 * Shared server-side query shaping for visualization data modules.
 * Callers remain responsible for validating module-specific fields/subsets.
 */

export function filterRows(
  rows,
  {
    levels,
    source = null,
    locations = null,
    startYear = null,
    endYear = null,
  },
) {
  const locationFilter = locations?.length ? new Set(locations) : null;
  // `source` accepts a single value or an array of provenance labels; an empty
  // array or null means "all sources" (the Population & Housing multi-select
  // defaults to all — refactor guide B3).
  const sourceFilter = Array.isArray(source)
    ? source.length
      ? new Set(source)
      : null
    : source
      ? new Set([source])
      : null;
  return rows.filter((row) => {
    if (!levels.includes(row["Geographic Level"])) return false;
    if (sourceFilter && !sourceFilter.has(row.Source)) return false;
    if (locationFilter && !locationFilter.has(row.Location)) return false;
    if (startYear !== null && row.Year < startYear) return false;
    if (endYear !== null && row.Year > endYear) return false;
    return true;
  });
}

/**
 * Full-width "original data" table for the View Data step: every column of the
 * source CSV, either narrowed to the chart's current geography/source/period
 * (`full: false`) or the entire parsed file (`full: true`). Row objects already
 * carry the CSV's columns in file order, so the client reconstructs the headers
 * from their keys — this deliberately keeps the stratification/measure columns a
 * chart view would otherwise collapse away.
 */
export function buildFullTable(
  rows,
  { levels, source = null, locations = null, startYear = null, endYear = null, full = false } = {},
) {
  const records = full
    ? rows
    : filterRows(rows, { levels, source, locations, startYear, endYear });
  return { records, rowCount: records.length };
}

export function yearRangeOf(rows, fallback = [null, null]) {
  if (!rows.length) return fallback;
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const row of rows) {
    minimum = Math.min(minimum, row.Year);
    maximum = Math.max(maximum, row.Year);
  }
  return [minimum, maximum];
}

function resolvedPeriod(rows, requestedPeriod) {
  if (requestedPeriod !== null && requestedPeriod !== undefined) {
    return requestedPeriod;
  }
  return yearRangeOf(rows)[1];
}

export function buildLineSeries(rows, parameter, fallbackRange) {
  const byLocation = new Map();
  for (const row of rows) {
    if (!byLocation.has(row.Location)) byLocation.set(row.Location, []);
    byLocation.get(row.Location).push(row);
  }

  const series = [...byLocation.entries()]
    .map(([location, locationRows]) => {
      locationRows.sort((a, b) => a.Year - b.Year);
      return {
        location,
        years: locationRows.map((row) => row.Year),
        values: locationRows.map((row) => row[parameter]),
      };
    })
    .sort((a, b) => a.location.localeCompare(b.location));

  return {
    series,
    yearRange: yearRangeOf(rows, fallbackRange),
  };
}

export function buildCategoryValues(
  rows,
  parameter,
  { period = null, topN = null, sort = "value" } = {},
) {
  const resolved = resolvedPeriod(rows, period);
  const records = rows
    .filter((row) => row.Year === resolved)
    .map((row) => ({
      location: row.Location,
      category: row.Location,
      value: row[parameter],
      year: row.Year,
    }));

  return { period: resolved, records: rankCategoryRecords(records, { topN, sort }) };
}

/** Sort and slice category records for Top/Bottom N ranking controls. */
export function rankCategoryRecords(
  records,
  { topN = null, sort = "value" } = {},
) {
  const ranked = [...records];

  if (sort === "value") {
    ranked.sort((a, b) => {
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      return b.value - a.value;
    });
  } else if (sort === "ascending") {
    ranked.sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
  } else {
    ranked.sort((a, b) => a.category.localeCompare(b.category));
  }

  return topN && topN > 0 ? ranked.slice(0, topN) : ranked;
}

export function buildTwoPeriod(
  rows,
  parameter,
  { startYear = null, endYear = null } = {},
) {
  const availableRange = yearRangeOf(rows);
  const start = startYear ?? availableRange[0];
  const end = endYear ?? availableRange[1];
  const byLocation = new Map();

  for (const row of rows) {
    if (row.Year !== start && row.Year !== end) continue;
    if (!byLocation.has(row.Location)) byLocation.set(row.Location, {});
    byLocation.get(row.Location)[row.Year] = row[parameter];
  }

  const records = [...byLocation.entries()]
    .filter(([, values]) =>
      Object.hasOwn(values, start) && Object.hasOwn(values, end),
    )
    .map(([location, values]) => ({
      location,
      category: location,
      start: values[start],
      end: values[end],
      startYear: start,
      endYear: end,
    }))
    .sort((a, b) => {
      const aChange = (a.end ?? 0) - (a.start ?? 0);
      const bChange = (b.end ?? 0) - (b.start ?? 0);
      return bChange - aChange;
    });

  return { startYear: start, endYear: end, records };
}

export function buildMeasurePairs(
  rows,
  { xMeasure, yMeasure, sizeMeasure = null, period = null },
) {
  const resolved = resolvedPeriod(rows, period);
  const records = rows
    .filter(
      (row) =>
        row.Year === resolved &&
        row[xMeasure] !== null &&
        row[yMeasure] !== null,
    )
    .map((row) => ({
      location: row.Location,
      x: row[xMeasure],
      y: row[yMeasure],
      ...(sizeMeasure ? { size: row[sizeMeasure] } : {}),
      year: row.Year,
    }))
    .sort((a, b) => a.location.localeCompare(b.location));
  return { period: resolved, records };
}

export function buildMatrix(rows, parameter) {
  const years = [...new Set(rows.map((row) => row.Year))].sort((a, b) => a - b);
  const locations = [...new Set(rows.map((row) => row.Location))].sort();
  const lookup = new Map(
    rows.map((row) => [`${row.Location}|${row.Year}`, row[parameter]]),
  );
  return {
    matrix: {
      x: years,
      y: locations,
      z: locations.map((location) =>
        years.map((year) => lookup.get(`${location}|${year}`) ?? null),
      ),
    },
    yearRange: years.length ? [years[0], years.at(-1)] : [null, null],
  };
}
