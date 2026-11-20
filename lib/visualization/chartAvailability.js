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
 * in lib/data/geography.js; `GEOMETRY_LEVEL_BY_SUBSET` is the schema-side name
 * for the same fact, and `tests/js/architecture/geometryLoaders.test.js` keeps
 * the loader wiring honest alongside it.
 */

import { hasInlineShape } from "@/lib/tabular/toSeries";
import { CHART_TYPE_IDS, getChartCapabilities, getChartType } from "@/lib/visualization/chartRegistry";

/**
 * The geographic levels we hold geometry for, named as module schemas name them,
 * and the server level (`AVAILABLE_GEO_LEVELS`) each draws from. The order is the
 * preference order when a map has to pick a level for the reader. Other subsets
 * have no shapes: `State` and `California` hold only California, and we hold no
 * shapes for `Cities` or `Jurisdictions`. `Metros` covers the 26 California
 * metros Zillow and Building Permits report.
 */
export const GEOMETRY_LEVEL_BY_SUBSET = Object.freeze({
  Counties: "counties",
  Regions: "regions",
  States: "states",
  "US States": "states",
  Metros: "metros",
});

/** The server geometry level for a schema subset, or null if it has no shapes. */
export function geometryLevelFor(subset) {
  return Object.hasOwn(GEOMETRY_LEVEL_BY_SUBSET, subset ?? "")
    ? GEOMETRY_LEVEL_BY_SUBSET[subset]
    : null;
}

/** Every level a map-shaped chart can draw on this schema, most preferred first. */
export function geometrySubsetsFor(schema) {
  return Object.keys(GEOMETRY_LEVEL_BY_SUBSET).filter((subset) => schema?.subsets?.[subset]);
}

/**
 * The level a map-shaped chart should sit on: the reader's `current` level when
 * it can be mapped, otherwise the most preferred one, or null if there is none.
 */
export function geometrySubsetFor(schema, current) {
  const subsets = geometrySubsetsFor(schema);
  return subsets.includes(current) ? current : subsets[0] || null;
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
 *      A module also needs enough measures for a chart's extra outcome roles,
 *      and cannot offer a chart that draws interval bounds (the forest plot),
 *      which only a pasted table supplies.
 *   3. A `requiresGeometry` chart type needs something to join to: a level we
 *      hold geometry for on a module, or an inline shape builder on the
 *      standalone tool. Symbol Map on pasted data fails the second, because a
 *      pasted table has no coordinate contract to read lat/lon from.
 */
export function isChartTypeAvailable(chartTypeId, schema) {
  const chart = getChartType(chartTypeId);
  if (!chart) return false;
  if (schema?.supportedChartTypes && !schema.supportedChartTypes.includes(chartTypeId)) {
    return false;
  }
  if (!schema?.inlineOnly && chart.additionalOutcomeRoles?.length) {
    const count = Object.values(schema?.fields || {}).filter((field) => field.kind === "measure").length;
    if (count < 1 + chart.additionalOutcomeRoles.length) return false;
  }
  // A forest plot draws an estimate and its interval, and only a pasted table's
  // column mapping produces those rows (`toObservations`). No module question
  // returns interval bounds, so on a module it could only draw an empty chart.
  if (!schema?.inlineOnly && getChartCapabilities(chartTypeId)?.intervalEndpoints === "measure") {
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
