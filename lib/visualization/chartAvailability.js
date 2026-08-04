/**
 * chartAvailability.js — which chart types a surface can actually draw, and the
 * geographic level a map-shaped chart has to sit on.
 *
 * A chart type used to be offered wherever it was registered, and three things
 * were checked separately (or not at all): the module's `supportedChartTypes`
 * allowlist and — for the two map
 * types — whether any geometry existed to draw them with. The third was missed,
 * which is how Symbol Map came to be offered on modules that hold no county
 * geometry and on the standalone tool, where it can only ever draw an empty
 * chart. This module is the single owner of that question, so the two tile
 * grids, the geographic-level select, and the store all read one answer.
 *
 * Client-safe: no `node:fs`, matching chartRegistry.js's constraint. The
 * server's own list of levels it holds geometry for is `AVAILABLE_GEO_LEVELS`
 * in lib/data/geography.js; `GEOMETRY_SUBSET` is the schema-side name for the
 * same fact, and `tests/js/architecture/geometryLoaders.test.js` keeps the
 * loader wiring honest alongside it.
 */

import { hasInlineShape } from "@/lib/tabular/toSeries";
import { CHART_TYPE_IDS, getChartType } from "@/lib/visualization/chartRegistry";

/**
 * The one geographic level we hold geometry for, named as module schemas name
 * it. Counties is the only entry in the server's AVAILABLE_GEO_LEVELS; when a
 * second level gains geometry this becomes a list and `geometrySubsetFor`
 * grows a preference order.
 */
export const GEOMETRY_SUBSET = "Counties";

/** The level a map-shaped chart can draw on this schema, or null if there is none. */
export function geometrySubsetFor(schema) {
  return schema?.subsets?.[GEOMETRY_SUBSET] ? GEOMETRY_SUBSET : null;
}

/** Does this chart type need geometry (polygons or derived points) to draw? */
export function requiresGeometry(chartTypeId) {
  return Boolean(getChartType(chartTypeId)?.requiresGeometry);
}

/**
 * Is this chart type offerable on this schema? Three gates, in order of how
 * much they exclude:
 *
 *   1. An unregistered id is never offered. `divergingBar` used to be
 *      registered-but-`hidden` here during its grace period; the descriptor
 *      is gone now, and `RETIRED_CHART_TYPES` (chartSpec.js) is what keeps a
 *      bookmarked link resolving, by rewriting the id before anything asks
 *      this question. A future retirement should use the same route.
 *   2. A module's `supportedChartTypes` allowlist narrows the set when present.
 *   3. A `requiresGeometry` chart type needs something to join to: the level we
 *      hold geometry for on a module, or an inline shape builder on the
 *      standalone tool. Building Permits (Metros/Regions/States) fails the
 *      first; Symbol Map on pasted data fails the second, because a pasted
 *      table has no coordinate contract to read lat/lon from.
 */
export function isChartTypeAvailable(chartTypeId, schema) {
  const chart = getChartType(chartTypeId);
  if (!chart) return false;
  if (schema?.supportedChartTypes && !schema.supportedChartTypes.includes(chartTypeId)) {
    return false;
  }
  if (!chart.requiresGeometry) return true;
  return schema?.inlineOnly
    ? hasInlineShape(chartTypeId)
    : Boolean(geometrySubsetFor(schema));
}

/** Every offerable chart type for a schema, in registry order. */
export function availableChartTypes(schema) {
  return CHART_TYPE_IDS.filter((id) => isChartTypeAvailable(id, schema));
}
