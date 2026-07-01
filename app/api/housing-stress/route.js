/**
 * GET /api/housing-stress
 *
 * Thin orchestrator for line, ranking, two-period, matrix, and county-map query
 * shapes over the ACS Housing Stress dataset. Beyond the standard
 * location/year/view params, it accepts the module's stratification filters
 * (raceEthnicity, tenure) and the measure selector (basis + threshold, or an
 * explicit parameter) that pins one of the four cost-burden columns.
 */

import {
  AVAILABLE_SUBSETS,
  BASES,
  THRESHOLDS,
  queryCategoryValues,
  queryGeoValues,
  queryLineSeries,
  queryMatrix,
  queryTwoPeriod,
  resolveMeasureColumn,
} from "@/lib/data/housing_stress";
import { integerParam, invalid, listParam } from "@/lib/data/apiParams";

const VIEWS = ["line", "category", "twoPeriod", "matrix", "geo"];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "line";
  const subset = searchParams.get("subset");
  const locations = listParam(searchParams, "locations");
  const startYear = integerParam(searchParams, "startYear");
  const endYear = integerParam(searchParams, "endYear");
  const period = integerParam(searchParams, "period");
  const topN = integerParam(searchParams, "topN");
  const sort = searchParams.get("sort") || "value";
  const raceEthnicity = searchParams.get("raceEthnicity");
  const tenure = searchParams.get("tenure");
  const basis = searchParams.get("basis");
  const threshold = integerParam(searchParams, "threshold");
  const parameter = searchParams.get("parameter");

  if (!VIEWS.includes(view)) {
    return invalid(
      `Invalid 'view'. Expected one of: ${VIEWS.join(", ")}`,
      "housing-stress API: view validation",
    );
  }
  if (!subset || !AVAILABLE_SUBSETS.includes(subset)) {
    return invalid(
      `Invalid or missing 'subset'. Expected one of: ${AVAILABLE_SUBSETS.join(", ")}`,
      "housing-stress API: subset validation",
    );
  }
  if (basis && !BASES.includes(basis)) {
    return invalid(
      `Invalid 'basis'. Expected one of: ${BASES.join(", ")}`,
      "housing-stress API: basis validation",
    );
  }
  if (threshold !== null && !THRESHOLDS.includes(threshold)) {
    return invalid(
      `Invalid 'threshold'. Expected one of: ${THRESHOLDS.join(", ")}`,
      "housing-stress API: threshold validation",
    );
  }
  if (startYear !== null && endYear !== null && startYear > endYear) {
    return invalid(
      "'startYear' cannot be later than 'endYear'.",
      "housing-stress API: period validation",
    );
  }

  let measure;
  try {
    measure = resolveMeasureColumn({ parameter, basis, threshold });
  } catch (error) {
    return invalid(error.message, "housing-stress API: measure validation");
  }

  const common = { subset, locations, raceEthnicity, tenure, basis, threshold, parameter };
  const echo = { view, subset, raceEthnicity, tenure, measure };

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
      { error: error.message, source: `housing-stress API: ${view} query` },
      { status: 500 },
    );
  }
}
