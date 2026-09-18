/**
 * chartData.js — the v3 request boundary on the client.
 *
 * One coordinated POST answers a whole question (every comparison, every
 * period) and comes back as status-aware observations; the renderer never
 * shapes the request. Pasted data answers the same question locally. Geometry
 * for map-shaped charts is fetched beside the answer, never mixed into it.
 *
 * Until the 2026-09-14 cutover this file also held the chart-shaped GET
 * loader (`QUERY_SHAPES` / `loadChartData`, one API view per chart id) and its
 * client-side ranking and legend helpers. That half is quarantined at
 * `.trash/visualization-backend/components/chart-builder/chartData.js` and
 * recorded in the visualization backend removal ledger.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Module API routes (POST) selected through schema.apiPath
 *   - lib/tabular/toObservations.js for pasted data — no fetch
 *   - /api/geography for map polygons and representative points
 */

import { executeInlineQuestion } from "@/lib/tabular/toObservations";
import { validateResponse } from "@/lib/visualization/observationContract";

function blockedResponse(code, message) {
  return {
    blocked: true,
    observations: [],
    comparisons: [],
    periods: [],
    issues: [{ code, level: "blocking", comparisonId: null, message }],
  };
}

/** Load one v3 question without leaking presentation state into the request. */
export async function loadObservations(spec, { apiPath, signal } = {}) {
  if (spec?.question?.dataset?.kind === "inline") {
    const response = executeInlineQuestion(spec);
    return { ...response, blocked: response.status === "blocked" };
  }
  const request = { version: spec.version, question: spec.question };
  let response;
  try {
    const result = await fetch(apiPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    response = await result.json();
  } catch (error) {
    return blockedResponse("requestFailed", error.message);
  }
  const validation = validateResponse(response);
  if (!validation.valid) {
    return blockedResponse("invalidResponse", validation.errors.join(" "));
  }
  return { ...response, blocked: response.status === "blocked" };
}

/**
 * The route's full-table view for the "View original data" step: every CSV
 * column for the question's geographic level and source. Pasted data has no
 * route, and a module with no route has nothing to fetch.
 */
export function fullTableUrl(config, schema) {
  if (!schema?.apiPath || config?.question?.dataset?.kind === "inline") return null;
  const params = new URLSearchParams({ view: "table", full: "1" });
  const subset = config?.question?.geography?.subset;
  if (subset) params.set("subset", subset);
  const source = config?.question?.source;
  if (source) params.set("source", source);
  return `${schema.apiPath}?${params}`;
}

/**
 * Fetch the entire cleaned dataset as `{ records }`. Throws with the route's
 * `{ error, source }` message so callers can surface where it failed.
 */
export async function loadFullTable(config, schema, signal) {
  const url = fullTableUrl(config, schema);
  if (!url) return null;
  const response = await fetch(url, { signal });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || "The full dataset could not be loaded.");
    error.source = body.source;
    throw error;
  }
  return { records: body.records || [] };
}

function geometryLevelForSubset(subset) {
  if (!subset) return "counties";
  return subset === "Counties" ? "counties" : subset.toLowerCase();
}

// Parsed geometry is static; cache per level so changing the measure/period on a
// choropleth doesn't re-fetch and re-parse the GeoJSON each time.
const geometryCache = new Map();

async function loadGeometry(level, signal) {
  if (geometryCache.has(level)) return geometryCache.get(level);
  const response = await fetch(`/api/geography?level=${level}`, { signal });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || "County geometry could not be loaded.");
    error.source = body.source;
    throw error;
  }
  geometryCache.set(level, body);
  return body;
}

// A symbol map's coordinates are derived and just as static as the polygons
// they come from; cache per level the same way loadGeometry does.
const pointsCache = new Map();

async function loadPoints(level, signal) {
  if (pointsCache.has(level)) return pointsCache.get(level);
  const response = await fetch(`/api/geography?level=${level}&type=points`, { signal });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || "County coordinates could not be loaded.");
    error.source = body.source;
    throw error;
  }
  pointsCache.set(level, body);
  return body;
}

/** Load the geometry a v3 observation adapter needs without mixing it into the question. */
export async function loadObservationGeometry(chartType, subset, signal) {
  if (!subset) return null;
  const level = geometryLevelForSubset(subset);
  if (chartType === "choroplethMap") return loadGeometry(level, signal);
  if (chartType === "symbolMap") {
    const [points, geojson] = await Promise.all([
      loadPoints(level, signal),
      loadGeometry(level, signal),
    ]);
    return { points, geojson };
  }
  return null;
}
