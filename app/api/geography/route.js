/**
 * GET /api/geography
 *
 * Thin orchestrator over lib/data/geography.js: validates the requested level and
 * returns its GeoJSON FeatureCollection for choropleth rendering. The geometry is
 * stored under data/data-cleaned/ (not public/), so this route is how the browser
 * obtains it.
 *
 * Query params:
 *   level - geographic level (optional, default "counties"), e.g. "counties"
 *
 * On success, returns the raw GeoJSON FeatureCollection (what Plotly's choropleth
 * consumes) with a cache header. On failure, returns a non-200 JSON body
 * identifying the failure source, matching the other API routes.
 *
 * Usage (future map): fetch("/api/geography?level=counties") and set
 * `featureidkey` from lib/data/geography.js FEATURE_ID_KEYS (e.g.
 * "properties.GEOID"), joining the data's county ids/names to the geometry.
 */

import { AVAILABLE_GEO_LEVELS, loadGeometry } from "@/lib/data/geography";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const level = searchParams.get("level") || "counties";

  if (!AVAILABLE_GEO_LEVELS.includes(level)) {
    return Response.json(
      {
        error: `Invalid 'level'. Expected one of: ${AVAILABLE_GEO_LEVELS.join(", ")}`,
        source: "geography API: level validation",
      },
      { status: 400 },
    );
  }

  try {
    const geojson = await loadGeometry(level);
    return Response.json(geojson, {
      headers: {
        // Geometry is effectively static; cache aggressively.
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
