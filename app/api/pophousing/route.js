/**
 * GET /api/pophousing
 *
 * Thin orchestrator over lib/data/pop_housing.js: validates query params, delegates
 * filtering/aggregation to the data-access module, and shapes the JSON response. It
 * contains no transformation logic of its own.
 *
 * Query params:
 *   parameter  - metric column (required), e.g. "Total Population"
 *   subset     - geographic grouping (required), e.g. "Regions"
 *   locations  - optional comma-separated location names
 *   startYear  - optional integer
 *   endYear    - optional integer
 *
 * On failure, returns a non-200 JSON body identifying the failure source, per the
 * project's error-handling goal (AGENTS.md).
 */

import {
  AVAILABLE_PARAMETERS,
  AVAILABLE_SUBSETS,
  queryLineSeries,
} from "@/lib/data/pop_housing";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const parameter = searchParams.get("parameter");
  const subset = searchParams.get("subset");
  const locationsParam = searchParams.get("locations");
  const startYearParam = searchParams.get("startYear");
  const endYearParam = searchParams.get("endYear");

  if (!parameter || !AVAILABLE_PARAMETERS.includes(parameter)) {
    return Response.json(
      {
        error: `Invalid or missing 'parameter'. Expected one of: ${AVAILABLE_PARAMETERS.join(", ")}`,
        source: "pop_housing API: parameter validation",
      },
      { status: 400 },
    );
  }

  if (!subset || !AVAILABLE_SUBSETS.includes(subset)) {
    return Response.json(
      {
        error: `Invalid or missing 'subset'. Expected one of: ${AVAILABLE_SUBSETS.join(", ")}`,
        source: "pop_housing API: subset validation",
      },
      { status: 400 },
    );
  }

  const locations = locationsParam
    ? locationsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const startYear = startYearParam ? Number.parseInt(startYearParam, 10) : null;
  const endYear = endYearParam ? Number.parseInt(endYearParam, 10) : null;

  try {
    const { series, yearRange } = await queryLineSeries({
      parameter,
      subset,
      locations,
      startYear,
      endYear,
    });
    return Response.json({ parameter, subset, series, yearRange });
  } catch (error) {
    return Response.json(
      {
        error: error.message,
        source: "pop_housing API: data load / query",
      },
      { status: 500 },
    );
  }
}
