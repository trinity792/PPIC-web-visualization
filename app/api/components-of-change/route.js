/**
 * GET /api/components-of-change
 *
 * Thin orchestrator for line, ranking, two-period, paired-measure, matrix, and
 * county-map query shapes.
 */

import {
  AVAILABLE_MEASURES,
  AVAILABLE_SOURCES,
  AVAILABLE_SUBSETS,
  queryCategoryValues,
  queryGeoValues,
  queryLineSeries,
  queryMatrix,
  queryFullTable,
  queryLocations,
  queryMeasurePairs,
  queryTwoPeriod,
} from "@/lib/data/components_of_change";
import { integerParam, invalid, listParam } from "@/lib/data/apiParams";
import { executeQuestion } from "@/lib/data/visualization/executeQuestion";
import { componentsOfChangeAdapter } from "@/lib/data/visualization/moduleAdapters";

const VIEWS = [
  "line",
  "category",
  "twoPeriod",
  "pairs",
  "matrix",
  "geo",
  "table",
  "locations",
];

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { status: "blocked", observations: [], comparisons: [], periods: [], issues: [
        { code: "malformedJson", level: "blocking", comparisonId: null, message: "Send valid JSON." },
      ] },
      { status: 400 },
    );
  }
  try {
    const result = await executeQuestion(body, { adapter: componentsOfChangeAdapter });
    return Response.json(result, { status: result.status === "blocked" ? 400 : 200 });
  } catch (error) {
    return Response.json(
      { status: "blocked", observations: [], comparisons: [], periods: [], issues: [
        { code: "serverError", level: "blocking", comparisonId: null, message: error.message },
      ] },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "line";
  const subset = searchParams.get("subset");
  const source = searchParams.get("source") || "DoF";
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
      "components_of_change API: view validation",
    );
  }
  if (!subset || !AVAILABLE_SUBSETS.includes(subset)) {
    return invalid(
      `Invalid or missing 'subset'. Expected one of: ${AVAILABLE_SUBSETS.join(", ")}`,
      "components_of_change API: subset validation",
    );
  }
  // The locations view describes the geography, not the dataset, so it resolves
  // before the source/subset pairing rules below (a Census-only subset still has
  // a location list). Its response is deliberately just { subset, locations }.
  if (view === "locations") {
    try {
      return Response.json(await queryLocations({ subset }));
    } catch (error) {
      return Response.json(
        { error: error.message, source: "components_of_change API: locations query" },
        { status: 500 },
      );
    }
  }
  if (!AVAILABLE_SOURCES.includes(source)) {
    return invalid(
      `Invalid 'source'. Expected one of: ${AVAILABLE_SOURCES.join(", ")}`,
      "components_of_change API: source validation",
    );
  }
  if (subset === "States" && source !== "Census") {
    return invalid(
      "National state data is only available for Census.",
      "components_of_change API: source/subset validation",
    );
  }
  // The full-table view carries no measure/parameter, so it must resolve before
  // the parameter validation below.
  if (view === "table") {
    try {
      const result = await queryFullTable({
        subset,
        source,
        locations,
        startYear,
        endYear,
        full,
      });
      return Response.json({ view, ...result });
    } catch (error) {
      return Response.json(
        { error: error.message, source: "components_of_change API: table query" },
        { status: 500 },
      );
    }
  }
  if (view === "pairs") {
    if (!AVAILABLE_MEASURES.includes(xMeasure) || !AVAILABLE_MEASURES.includes(yMeasure)) {
      return invalid(
        "'xMeasure' and 'yMeasure' must be valid measure fields.",
        "components_of_change API: paired-measure validation",
      );
    }
    if (sizeMeasure && !AVAILABLE_MEASURES.includes(sizeMeasure)) {
      return invalid(
        "'sizeMeasure' must be a valid measure field.",
        "components_of_change API: size-measure validation",
      );
    }
  } else if (!parameter || !AVAILABLE_MEASURES.includes(parameter)) {
    return invalid(
      `Invalid or missing 'parameter'. Expected one of: ${AVAILABLE_MEASURES.join(", ")}`,
      "components_of_change API: parameter validation",
    );
  }
  if (startYear !== null && endYear !== null && startYear > endYear) {
    return invalid(
      "'startYear' cannot be later than 'endYear'.",
      "components_of_change API: period validation",
    );
  }

  const common = { subset, source, locations };
  try {
    if (view === "category") {
      const result = await queryCategoryValues({
        ...common,
        parameter,
        period,
        topN,
        sort,
      });
      return Response.json({ view, parameter, subset, source, ...result });
    }
    if (view === "twoPeriod") {
      const result = await queryTwoPeriod({
        ...common,
        parameter,
        startYear,
        endYear,
      });
      return Response.json({ view, parameter, subset, source, ...result });
    }
    if (view === "pairs") {
      const result = await queryMeasurePairs({
        ...common,
        xMeasure,
        yMeasure,
        sizeMeasure,
        period,
      });
      return Response.json({
        view,
        xMeasure,
        yMeasure,
        sizeMeasure,
        subset,
        source,
        ...result,
      });
    }
    if (view === "matrix") {
      const result = await queryMatrix({
        ...common,
        parameter,
        startYear,
        endYear,
      });
      return Response.json({ view, parameter, subset, source, ...result });
    }
    if (view === "geo") {
      const result = await queryGeoValues({
        parameter,
        subset,
        source,
        period,
      });
      return Response.json({ view, parameter, subset, source, ...result });
    }

    const result = await queryLineSeries({
      ...common,
      parameter,
      startYear,
      endYear,
    });
    return Response.json({ view, parameter, subset, source, ...result });
  } catch (error) {
    return Response.json(
      { error: error.message, source: `components_of_change API: ${view} query` },
      { status: 500 },
    );
  }
}
