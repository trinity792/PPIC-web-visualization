/**
 * GET /api/geography
 *
 * Thin orchestrator over lib/data/geography.js: validates the requested level and
 * returns either its GeoJSON FeatureCollection (choropleth) or a derived
 * representative point per feature, keyed by GEOID (symbol map). The geometry is
 * stored under data/data-cleaned/ (not public/), so this route is how the browser
 * obtains it.
 *
 * Query params:
 *   level - geographic level (optional, default "counties"), e.g. "counties"
 *   type  - "polygons" (default) or "points"
 *
 * On success, returns the raw GeoJSON FeatureCollection or the `{ geoid: [lon, lat] }`
 * point map, with a cache header. On failure, returns a non-200 JSON body
 * identifying the failure source, matching the other API routes.
 *
 * Usage: fetch("/api/geography?level=counties") for polygons, set `featureidkey`
 * from lib/data/geography.js FEATURE_ID_KEYS (e.g. "properties.GEOID"), joining
 * the data's county ids/names to the geometry. fetch("/api/geography?level=counties&type=points")
 * for symbol-map coordinates, joined by GEOID the same way.
 */

import {
  AVAILABLE_GEO_LEVELS,
  loadGeometry,
  loadRepresentativePoints,
} from "@/lib/data/geography";
import { invalid } from "@/lib/data/apiParams";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const level = searchParams.get("level") || "counties";
  const type = searchParams.get("type") || "polygons";

  if (!AVAILABLE_GEO_LEVELS.includes(level)) {
    return invalid(
      `Invalid 'level'. Expected one of: ${AVAILABLE_GEO_LEVELS.join(", ")}`,
      "geography API: level validation",
    );
  }
  if (type !== "polygons" && type !== "points") {
    return invalid(
      `Invalid 'type'. Expected one of: polygons, points`,
      "geography API: type validation",
    );
  }

  try {
    const body =
      type === "points" ? await loadRepresentativePoints(level) : await loadGeometry(level);
    return Response.json(body, {
      headers: {
        // Geometry (and the points derived from it) is effectively static;
        // cache aggressively.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error.message,
        source: "geography API: geometry load",
      },
      { status: 500 },
    );
  }
}
