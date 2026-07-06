/**
 * Client-safe visualization schema for the Building Permits module.
 *
 * Mirror of `moduleSchemas/housingStress.js`. SINGLE SOURCE OF TRUTH for this
 * module's field catalog, curated measures, subsets, canonical CSV columns, and
 * the module-specific toggles. CLIENT-SAFE (no node:fs) — consumed by both client
 * components and the server-only `lib/data/building_permits.js`.
 *
 * Building Permits measures monthly authorized new housing units from the Census
 * Building Permits Survey, split by structure size, for 50 US states and CA CBSA
 * metros. Unlike the other modules its temporal axis is MONTHLY (`Date` =
 * "YYYY-MM"), not an integer Year. The 9-region view is a frontend aggregate of
 * the metros (not a stored level); region totals cover metropolitan counties only
 * and under-count rural (no-CBSA) counties — surfaced as a caveat when active.
 */

import { FIELD_KINDS, UNITS, isMeasure } from "../fieldTypes";

const { TEMPORAL, DIMENSION, MEASURE } = FIELD_KINDS;

// Counts of authorized units; index-to-100 and two-period change are stock-style
// transforms. The trailing-12-month ("year-to-date") sum is a separate toggle.
const PERMIT_TRANSFORMS = ["actual", "numericChange", "percentChange", "indexed"];
const FULL_ROLES = ["xMeasure", "yMeasure", "size", "color"];

const measureField = (label, { curated = true } = {}) => ({
  kind: MEASURE,
  label,
  unit: UNITS.HOUSING_UNITS,
  comparisonGroup: "buildingPermits",
  aggregation: "sum", // structure-size counts sum across locations (region roll-up)
  transforms: PERMIT_TRANSFORMS,
  chartRoles: FULL_ROLES,
  curated,
});

export const BUILDING_PERMITS_FIELDS = Object.freeze({
  // ----- temporal (monthly) -----
  Date: { kind: TEMPORAL, label: "Month", formatter: "month", granularity: "month" },

  // ----- dimensions -----
  Location: {
    kind: DIMENSION,
    label: "Location",
    cardinality: "high",
    supportsComparison: true,
  },
  "Geographic Level": {
    kind: DIMENSION,
    label: "Geographic level",
    values: ["State", "Metro", "Region"],
  },

  // ----- measures: 5 raw structure-size counts + 1 derived -----
  Total: measureField("Total units"),
  "1 Unit": measureField("1 unit"),
  "2 Units": measureField("2 units"),
  "3 and 4 Units": measureField("3–4 units"),
  "5 Units or More": measureField("5+ units"),
  // Derived in the data-access layer: 2 Units + 3 and 4 Units + 5 Units or More.
  "2+ Units": measureField("2+ units (multifamily)"),
});

/** Friendly subset name → the stored Geographic Level(s) it draws from. */
export const BUILDING_PERMITS_SUBSETS = Object.freeze({
  Metros: ["Metro"], // 26 CA CBSA metros at native BPS grain
  Regions: ["Metro"], // 9 CA regions: metros aggregated on demand in the data layer
  States: ["State"], // 50 states (+ derived "Rest of US")
});

/**
 * Which subsets require the metro→region aggregation, and the caveat surfaced
 * whenever the Regions subset is active (region totals under-count rural counties
 * covered by no CBSA).
 */
export const BUILDING_PERMITS_REGION_SUBSET = "Regions";
export const BUILDING_PERMITS_REGION_CAVEAT =
  "Region totals sum only the metropolitan (CBSA) counties in each region and " +
  "under-count rural counties that no CBSA covers.";

/** The derived "Rest of US" location (sum of all non-California states per month). */
export const BUILDING_PERMITS_REST_OF_US = "Rest of US";

const measureKeys = Object.keys(BUILDING_PERMITS_FIELDS).filter((key) =>
  isMeasure(BUILDING_PERMITS_FIELDS[key]),
);

/** The derived measure computed in the data layer (not present in the CSV). */
export const BUILDING_PERMITS_DERIVED_MEASURE = "2+ Units";

/** Only the raw measure columns present in the CSV (drives numeric parsing). */
export const BUILDING_PERMITS_RAW_MEASURES = Object.freeze(
  measureKeys.filter((key) => key !== BUILDING_PERMITS_DERIVED_MEASURE),
);

/** Every measure the API can select (raw + derived). */
export const BUILDING_PERMITS_NUMERIC_COLUMNS = Object.freeze(measureKeys);

/** Curated measures exposed in the UI selector. */
export const BUILDING_PERMITS_CURATED_MEASURES = Object.freeze(
  measureKeys.filter((key) => BUILDING_PERMITS_FIELDS[key].curated),
);

/** Full CSV column order (cleaned BuildingPermits_Current.csv header, verbatim). */
export const BUILDING_PERMITS_CANONICAL_COLUMNS = Object.freeze([
  "Geographic Level",
  "Location",
  "Date",
  "Total",
  "1 Unit",
  "2 Units",
  "3 and 4 Units",
  "5 Units or More",
]);

export const BUILDING_PERMITS_SCHEMA = Object.freeze({
  id: "building-permits",
  label: "Building Permits",
  apiPath: "/api/building-permits",
  fields: BUILDING_PERMITS_FIELDS,
  canonicalColumns: BUILDING_PERMITS_CANONICAL_COLUMNS,
  numericColumns: BUILDING_PERMITS_NUMERIC_COLUMNS,
  rawMeasures: BUILDING_PERMITS_RAW_MEASURES,
  curatedMeasures: BUILDING_PERMITS_CURATED_MEASURES,
  derivedMeasure: BUILDING_PERMITS_DERIVED_MEASURE,
  subsets: BUILDING_PERMITS_SUBSETS,
  regionSubset: BUILDING_PERMITS_REGION_SUBSET,
  regionCaveat: BUILDING_PERMITS_REGION_CAVEAT,
  restOfUsLocation: BUILDING_PERMITS_REST_OF_US,
  // Monthly axis: the slider is year-granular, the data is monthly. yearRange
  // drives the slider; the API also accepts explicit YYYY-MM month bounds.
  temporalColumn: "Date",
  temporalGranularity: "month",
  yearRange: [2010, 2026],
  // The editor presets for this module have not been built yet, so the detailed
  // page renders the UnderConstruction placeholder instead of the editor. Remove
  // this flag once the graph-editor overhaul wires up Building Permits presets.
  underConstruction: true,
});
