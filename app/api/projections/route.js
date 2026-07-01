/**
 * GET /api/projections
 *
 * Thin orchestrator for line, ranking, two-period, matrix, and county-map query
 * shapes over the Age, Sex & Race Projections dataset. Beyond the standard
 * location/year/view params, it accepts the module's stratification filters
 * (ageGroup, sex, raceEthnicity, source) and the optional `ageGrouping` preset
 * that sums the stored 5-year groups into a coarser bin server-side.
 */

import {
  AVAILABLE_SOURCES,
  AVAILABLE_SUBSETS,
  queryCategoryValues,
  queryGeoValues,
  queryLineSeries,
  queryMatrix,
  queryTwoPeriod,
} from "@/lib/data/demographic_projections";
import { integerParam, invalid, listParam } from "@/lib/data/apiParams";

const VIEWS = ["line", "category", "twoPeriod", "matrix", "geo"];
const CENSUS_SOURCE = "Census cc-est";
const DOF_SOURCE = "DoF P-3";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "line";
  const subset = searchParams.get("subset");
  const source = searchParams.get("source") || DOF_SOURCE;
  const locations = listParam(searchParams, "locations");
  const startYear = integerParam(searchParams, "startYear");
  const endYear = integerParam(searchParams, "endYear");
  const period = integerParam(searchParams, "period");
  const topN = integerParam(searchParams, "topN");
  const sort = searchParams.get("sort") || "value";
  const ageGroup = searchParams.get("ageGroup");
  const ageGrouping = searchParams.get("ageGrouping");
  const sex = searchParams.get("sex");
  const raceEthnicity = searchParams.get("raceEthnicity");

  if (!VIEWS.includes(view)) {
    return invalid(
      `Invalid 'view'. Expected one of: ${VIEWS.join(", ")}`,
      "projections API: view validation",
    );
  }
  if (!subset || !AVAILABLE_SUBSETS.includes(subset)) {
    return invalid(
      `Invalid or missing 'subset'. Expected one of: ${AVAILABLE_SUBSETS.join(", ")}`,
      "projections API: subset validation",
    );
  }
  if (!AVAILABLE_SOURCES.includes(source)) {
    return invalid(
      `Invalid 'source'. Expected one of: ${AVAILABLE_SOURCES.join(", ")}`,
      "projections API: source validation",
    );
  }
  if (subset === "US States" && source !== CENSUS_SOURCE) {
    return invalid(
      "National state data is only available for Census cc-est.",
      "projections API: source/subset validation",
    );
  }
  if (subset !== "US States" && source !== DOF_SOURCE) {
    return invalid(
      "California county, region, and state data is only available for DoF P-3.",
      "projections API: source/subset validation",
    );
  }
  if (startYear !== null && endYear !== null && startYear > endYear) {
    return invalid(
      "'startYear' cannot be later than 'endYear'.",
      "projections API: period validation",
    );
  }

  const common = {
    subset,
    source,
    locations,
    ageGroup,
    ageGrouping,
    sex,
    raceEthnicity,
  };
  const echo = { view, subset, source, ageGroup, ageGrouping, sex, raceEthnicity };

  try {
    if (view === "category") {
      const result = await queryCategoryValues({ ...common, period, topN, sort });
      return Response.json({ ...echo, ...result });
    }
    if (view === "twoPeriod") {
      const result = await queryTwoPeriod({ ...common, startYear, endYear });
      return Response.json({ ...echo, ...result });
    }
    if (view === "matrix") {
      const result = await queryMatrix({ ...common, startYear, endYear });
      return Response.json({ ...echo, ...result });
    }
    if (view === "geo") {
      const result = await queryGeoValues({ ...common, period });
      return Response.json({ ...echo, ...result });
    }

    const result = await queryLineSeries({ ...common, startYear, endYear });
    return Response.json({ ...echo, ...result });
  } catch (error) {
    return Response.json(
      { error: error.message, source: `projections API: ${view} query` },
      { status: 500 },
    );
  }
}
