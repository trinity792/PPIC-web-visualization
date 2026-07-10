/**
 * GET /api/building-permits
 *
 * Thin orchestrator for the line, two-period, and choropleth query shapes over the
 * monthly Building Permits dataset. Beyond the standard location/subset params it
 * accepts the module's permit-type selector, the monthly time bounds (YYYY-MM, or
 * year ints that expand to a full year), and the two derived-view toggles
 * (aggregated = trailing-12-month sum; indexed = index-to-100 from a baseline).
 */

import {
  AVAILABLE_PARAMETERS,
  AVAILABLE_SUBSETS,
  queryFullTable,
  queryGeoValues,
  queryLineSeries,
  queryTwoPeriod,
} from "@/lib/data/building_permits";
import { integerParam, invalid, listParam } from "@/lib/data/apiParams";

const VIEWS = ["line", "twoPeriod", "geoValues", "table"];
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function monthParam(searchParams, key) {
  const raw = searchParams.get(key);
  if (!raw) return null;
  return MONTH_PATTERN.test(raw) ? raw : undefined; // undefined signals a bad format
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "line";
  const subset = searchParams.get("subset");
  const permitType = searchParams.get("permitType") || "Total";
  const locations = listParam(searchParams, "locations");
  const startMonth = monthParam(searchParams, "startMonth");
  const endMonth = monthParam(searchParams, "endMonth");
  const period = monthParam(searchParams, "period");
  const baselineMonth = monthParam(searchParams, "baselineMonth");
  const startYear = integerParam(searchParams, "startYear");
  const endYear = integerParam(searchParams, "endYear");
  const aggregated = searchParams.get("aggregated") === "true";
  const indexed = searchParams.get("indexed") === "true";
  const full = searchParams.get("full") === "1";

  if (!VIEWS.includes(view)) {
    return invalid(`Invalid 'view'. Expected one of: ${VIEWS.join(", ")}`, "building-permits API: view validation");
  }
  if (!subset || !AVAILABLE_SUBSETS.includes(subset)) {
    return invalid(
      `Invalid or missing 'subset'. Expected one of: ${AVAILABLE_SUBSETS.join(", ")}`,
      "building-permits API: subset validation",
    );
  }
  if (permitType && !AVAILABLE_PARAMETERS.includes(permitType)) {
    return invalid(
      `Invalid 'permitType'. Expected one of: ${AVAILABLE_PARAMETERS.join(", ")}`,
      "building-permits API: permitType validation",
    );
  }
  for (const [key, value] of [
    ["startMonth", startMonth],
    ["endMonth", endMonth],
    ["period", period],
    ["baselineMonth", baselineMonth],
  ]) {
    if (value === undefined) {
      return invalid(`Invalid '${key}'. Expected a YYYY-MM month.`, "building-permits API: month validation");
    }
  }
  if (startMonth && endMonth && startMonth > endMonth) {
    return invalid("'startMonth' cannot be later than 'endMonth'.", "building-permits API: period validation");
  }

  const common = { subset, permitType, locations, startMonth, endMonth, startYear, endYear };
  const echo = { view, subset, permitType, aggregated, indexed };

  try {
    if (view === "table") {
      const result = await queryFullTable({ ...common, full });
      return Response.json({ view, ...result });
    }
    if (view === "twoPeriod") {
      const result = await queryTwoPeriod(common);
      return Response.json({ ...echo, ...result });
    }
    if (view === "geoValues") {
      const result = await queryGeoValues({ ...common, period });
      return Response.json({ ...echo, ...result });
    }
    const result = await queryLineSeries({ ...common, aggregated, indexed, baselineMonth });
    return Response.json({ ...echo, ...result });
  } catch (error) {
    return Response.json(
      { error: error.message, source: `building-permits API: ${view} query` },
      { status: 500 },
    );
  }
}
