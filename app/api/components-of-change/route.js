/**
 * GET /api/components-of-change
 *
 * Thin orchestrator over lib/data/components_of_change.js: validates query
 * params, delegates filtering to the data-access module, and shapes the JSON
 * response. It performs no transformation logic itself.
 */

import {
  AVAILABLE_PARAMETERS,
  AVAILABLE_SOURCES,
  AVAILABLE_SUBSETS,
  queryLineSeries,
} from "@/lib/data/components_of_change";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const parameter = searchParams.get("parameter");
  const subset = searchParams.get("subset");
  const source = searchParams.get("source") || "DoF";
  const locationsParam = searchParams.get("locations");
  const startYearParam = searchParams.get("startYear");
  const endYearParam = searchParams.get("endYear");

  if (!parameter || !AVAILABLE_PARAMETERS.includes(parameter)) {
    return Response.json(
      {
        error: `Invalid or missing 'parameter'. Expected one of: ${AVAILABLE_PARAMETERS.join(", ")}`,
        source: "components_of_change API: parameter validation",
      },
      { status: 400 },
    );
  }

  if (!subset || !AVAILABLE_SUBSETS.includes(subset)) {
    return Response.json(
      {
        error: `Invalid or missing 'subset'. Expected one of: ${AVAILABLE_SUBSETS.join(", ")}`,
        source: "components_of_change API: subset validation",
      },
      { status: 400 },
    );
  }

  if (!AVAILABLE_SOURCES.includes(source)) {
    return Response.json(
      {
        error: `Invalid 'source'. Expected one of: ${AVAILABLE_SOURCES.join(", ")}`,
        source: "components_of_change API: source validation",
      },
      { status: 400 },
    );
  }

  if (subset === "States" && source !== "Census") {
    return Response.json(
      {
        error: "National state data is only available for Census.",
        source: "components_of_change API: source/subset validation",
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
      source,
      locations,
      startYear,
      endYear,
    });
    return Response.json({ parameter, subset, source, series, yearRange });
  } catch (error) {
    return Response.json(
      {
        error: error.message,
        source: "components_of_change API: data load / query",
      },
      { status: 500 },
    );
  }
}
