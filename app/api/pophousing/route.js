/**
 * GET /api/pophousing
 *
 * Thin orchestrator for all visualization query shapes. `view` selects the
 * server-side query; filtering and shaping remain in lib/data/pop_housing.js.
 */

import {
  AVAILABLE_MEASURES,
  AVAILABLE_SUBSETS,
  queryCategoryValues,
  queryGeoValues,
  queryLineSeries,
  queryMatrix,
  queryFullTable,
  queryMeasurePairs,
  queryTwoPeriod,
} from "@/lib/data/pop_housing";
import { integerParam, invalid, listParam } from "@/lib/data/apiParams";

const VIEWS = ["line", "category", "twoPeriod", "pairs", "matrix", "geo", "table"];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "line";
  const subset = searchParams.get("subset");
  const parameter = searchParams.get("parameter");
  const xMeasure = searchParams.get("xMeasure");
  const yMeasure = searchParams.get("yMeasure");
  const sizeMeasure = searchParams.get("sizeMeasure");
  const locations = listParam(searchParams, "locations");
  const startYear = integerParam(searchParams, "startYear");
  const endYear = integerParam(searchParams, "endYear");
  const period = integerParam(searchParams, "period");
  const topN = integerParam(searchParams, "topN");
  const sort = searchParams.get("sort") || "value";
  const full = searchParams.get("full") === "1";

  if (!VIEWS.includes(view)) {
    return invalid(
      `Invalid 'view'. Expected one of: ${VIEWS.join(", ")}`,
      "pop_housing API: view validation",
    );
  }
  if (!subset || !AVAILABLE_SUBSETS.includes(subset)) {
    return invalid(
      `Invalid or missing 'subset'. Expected one of: ${AVAILABLE_SUBSETS.join(", ")}`,
      "pop_housing API: subset validation",
    );
  }
  // The full-table view carries no measure/parameter, so it must resolve before
  // the parameter validation below.
  if (view === "table") {
    try {
      const result = await queryFullTable({ subset, locations, startYear, endYear, full });
      return Response.json({ view, ...result });
    } catch (error) {
      return Response.json(
        { error: error.message, source: "pop_housing API: table query" },
        { status: 500 },
      );
    }
  }
  if (view === "pairs") {
    if (!AVAILABLE_MEASURES.includes(xMeasure) || !AVAILABLE_MEASURES.includes(yMeasure)) {
      return invalid(
        "'xMeasure' and 'yMeasure' must be valid measure fields.",
        "pop_housing API: paired-measure validation",
      );
    }
    if (sizeMeasure && !AVAILABLE_MEASURES.includes(sizeMeasure)) {
      return invalid(
        "'sizeMeasure' must be a valid measure field.",
        "pop_housing API: size-measure validation",
      );
    }
  } else if (!parameter || !AVAILABLE_MEASURES.includes(parameter)) {
    return invalid(
      `Invalid or missing 'parameter'. Expected one of: ${AVAILABLE_MEASURES.join(", ")}`,
      "pop_housing API: parameter validation",
    );
  }
  if (startYear !== null && endYear !== null && startYear > endYear) {
    return invalid(
      "'startYear' cannot be later than 'endYear'.",
      "pop_housing API: period validation",
    );
  }

  try {
    if (view === "category") {
      const result = await queryCategoryValues({
        parameter,
        subset,
        period,
        topN,
        sort,
        locations,
      });
      return Response.json({ view, parameter, subset, ...result });
    }
    if (view === "twoPeriod") {
      const result = await queryTwoPeriod({
        parameter,
        subset,
        startYear,
        endYear,
        locations,
      });
      return Response.json({ view, parameter, subset, ...result });
    }
    if (view === "pairs") {
      const result = await queryMeasurePairs({
        xMeasure,
        yMeasure,
        sizeMeasure,
        subset,
        period,
        locations,
      });
      return Response.json({
        view,
        xMeasure,
        yMeasure,
        sizeMeasure,
        subset,
        ...result,
      });
    }
    if (view === "matrix") {
      const result = await queryMatrix({
        parameter,
        subset,
        startYear,
        endYear,
        locations,
      });
      return Response.json({ view, parameter, subset, ...result });
    }
    if (view === "geo") {
      const result = await queryGeoValues({ parameter, subset, period });
      return Response.json({ view, parameter, subset, ...result });
    }

    const result = await queryLineSeries({
      parameter,
      subset,
      locations,
      startYear,
      endYear,
    });
    return Response.json({ view, parameter, subset, ...result });
  } catch (error) {
    return Response.json(
      { error: error.message, source: `pop_housing API: ${view} query` },
      { status: 500 },
    );
  }
}
