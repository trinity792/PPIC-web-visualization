/**
 * Server-side geography (geometry) access module.
 *
 * Mirrors the other lib/data/* modules: it owns reading, parsing, and caching of
 * the cleaned GeoJSON used by choropleth maps. The API route is a thin
 * orchestrator on top of it; client components fetch the route, never the file.
 *
 * The geometry lives under data/data-cleaned/ (not public/), so it is NOT served
 * as a static asset — this server module + /api/geography are how the browser
 * reaches it.
 *
 * NOTE: server-only (uses node:fs) — must not be imported into a "use client"
 * component.
 *
 * Each county feature carries both `properties.GEOID` (canonical FIPS id, e.g.
 * "06001") and `properties.NAME` (e.g. "Alameda"). A choropleth should join on
 * GEOID where possible (guardrail #5: join on canonical ids, not display names);
 * NAME matches the dataset's `Location` values for the simple case.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

// Cleaned GeoJSON paths, scoped under process.cwd()/data/data-cleaned/geography
// (its own leaf folder, like the sibling datasets). Counties exist today;
// regions/states can be added as new statically-known consts + switch arms.
const COUNTIES_GEOJSON = path.join(
  process.cwd(),
  "data",
  "data-cleaned",
  "geography",
  "california-counties.geojson",
);

/** Geographic levels with available geometry. (Currently just "counties".) */
export const AVAILABLE_GEO_LEVELS = ["counties"];

/** Property key holding the canonical id, by level — the choropleth featureidkey. */
export const FEATURE_ID_KEYS = Object.freeze({
  counties: "properties.GEOID",
});

// Parsed-geometry cache so each GeoJSON is read and parsed once per server process.
const cache = new Map();

/**
 * Read the raw GeoJSON for a level. Each arm passes a statically-known path to
 * readFile so the bundler can scope file tracing (a dynamic path lookup makes
 * Turbopack trace the whole project).
 */
function readGeojsonText(level) {
  switch (level) {
    case "counties":
      return readFile(COUNTIES_GEOJSON, "utf8");
    default:
      return null;
  }
}

/**
 * Load and cache the GeoJSON FeatureCollection for a geographic level.
 * @param {string} level e.g. "counties"
 * @returns {Promise<object>} a GeoJSON FeatureCollection
 */
export async function loadGeometry(level) {
  if (!AVAILABLE_GEO_LEVELS.includes(level)) {
    throw new Error(`Unknown geographic level: ${level}`);
  }
  if (cache.has(level)) return cache.get(level);

  let text;
  try {
    text = await readGeojsonText(level);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `Geometry for "${level}" not found. Add the cleaned GeoJSON to generate it.`,
      );
    }
    throw error;
  }

  const geojson = JSON.parse(text);
  cache.set(level, geojson);
  return geojson;
}

/**
 * Build a display-name → canonical feature-id lookup for joining cleaned data
 * rows to geometry. The returned ids match FEATURE_ID_KEYS for the level.
 */
export async function getFeatureIdLookup(level) {
  const geojson = await loadGeometry(level);
  const lookup = new Map();
  for (const feature of geojson.features || []) {
    const name = feature.properties?.NAME;
    const id = feature.properties?.GEOID;
    if (name && id) lookup.set(name, id);
  }
  return lookup;
}
