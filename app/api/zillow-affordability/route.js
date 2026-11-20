/**
 * /api/zillow-affordability
 *
 * POST answers every chart through the generic v3 module adapter. GET serves only
 * the two non-chart shapes: view=locations (the location picker) and view=table
 * (the "View original data" step and full-table download). The older
 * chart-shaped GET views other topics still carry are deliberately not added.
 */

import {
  AVAILABLE_SUBSETS,
  queryFullTable,
  queryLocations,
} from "@/lib/data/zillow_affordability";
import { integerParam, invalid, listParam } from "@/lib/data/apiParams";
import { handleQuestionPost } from "@/lib/data/visualization/handleQuestionPost";
import { zillowAffordabilityAdapter } from "@/lib/data/visualization/moduleAdapters";

const VIEWS = ["locations", "table"];

export async function POST(request) {
  return handleQuestionPost(request, zillowAffordabilityAdapter);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "table";
  const subset = searchParams.get("subset");
  const locations = listParam(searchParams, "locations");
  const startYear = integerParam(searchParams, "startYear");
  const endYear = integerParam(searchParams, "endYear");
  const full = searchParams.get("full") === "1";

  if (!VIEWS.includes(view)) {
    return invalid(
      `Invalid 'view'. Expected one of: ${VIEWS.join(", ")}`,
      "zillow-affordability API: view validation",
    );
  }
  if ((view === "locations" || !full) && (!subset || !AVAILABLE_SUBSETS.includes(subset))) {
    return invalid(
      `Invalid or missing 'subset'. Expected one of: ${AVAILABLE_SUBSETS.join(", ")}`,
      "zillow-affordability API: subset validation",
    );
  }
  if (startYear !== null && endYear !== null && startYear > endYear) {
    return invalid(
      "'startYear' cannot be later than 'endYear'.",
      "zillow-affordability API: period validation",
    );
  }

  try {
    if (view === "locations") {
      return Response.json(await queryLocations({ subset }));
    }
    const result = await queryFullTable({ subset, locations, startYear, endYear, full });
    return Response.json({ view, ...result });
  } catch (error) {
    return Response.json(
      { error: error.message, source: `zillow-affordability API: ${view} query` },
      { status: 500 },
    );
  }
}
