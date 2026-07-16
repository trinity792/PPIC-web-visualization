/**
 * GET /api/rhna-progress
 *
 * Thin orchestrator for category (ranking), line (snapshot trend), table, and the
 * two landing-dashboard query shapes over the RHNA Progress dataset. Beyond the
 * standard subset/location params it accepts the module's Income Level pin and an
 * explicit measure `parameter` (defaulting to the headline On Track Score).
 */

import {
  AVAILABLE_SUBSETS,
  INCOME_LEVELS,
  queryBestWorst,
  queryCategoryValues,
  queryFullTable,
  queryLineSeries,
  queryRegionalOnTrack,
  resolveMeasureColumn,
} from "@/lib/data/rhna_progress";
import { integerParam, invalid, listParam } from "@/lib/data/apiParams";

const VIEWS = ["category", "line", "table", "bestWorst", "regional"];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "category";
  const subset = searchParams.get("subset") || "Jurisdictions";
  const locations = listParam(searchParams, "locations");
  const incomeLevel = searchParams.get("incomeLevel");
  const cycle = integerParam(searchParams, "cycle");
  const topN = integerParam(searchParams, "topN");
  const sort = searchParams.get("sort") || "value";
  const parameter = searchParams.get("parameter");
  const full = searchParams.get("full") === "1";

  if (!VIEWS.includes(view)) {
    return invalid(`Invalid 'view'. Expected one of: ${VIEWS.join(", ")}`, "rhna-progress API: view validation");
  }
  if (!AVAILABLE_SUBSETS.includes(subset)) {
    return invalid(
      `Invalid 'subset'. Expected one of: ${AVAILABLE_SUBSETS.join(", ")}`,
      "rhna-progress API: subset validation",
    );
  }
  if (incomeLevel && !INCOME_LEVELS.includes(incomeLevel)) {
    return invalid(
      `Invalid 'incomeLevel'. Expected one of: ${INCOME_LEVELS.join(", ")}`,
      "rhna-progress API: incomeLevel validation",
    );
  }

  let measure;
  try {
    measure = resolveMeasureColumn({ parameter });
  } catch (error) {
    return invalid(error.message, "rhna-progress API: measure validation");
  }

  const common = { subset, locations, incomeLevel, cycle, parameter };
  const echo = { view, subset, incomeLevel: incomeLevel || "Total", measure };

  try {
    if (view === "table") {
      const result = await queryFullTable({ subset, locations, incomeLevel, full });
      return Response.json({ view, ...result });
    }
    if (view === "line") {
      const result = await queryLineSeries(common);
      return Response.json({ ...echo, ...result });
    }
    if (view === "bestWorst") {
      const result = await queryBestWorst({ subset, topN: topN ?? 10 });
      return Response.json({ view, subset, ...result });
    }
    if (view === "regional") {
      const result = await queryRegionalOnTrack({ subset });
      return Response.json({ view, subset, ...result });
    }
    const result = await queryCategoryValues({ ...common, topN, sort });
    return Response.json({ ...echo, ...result });
  } catch (error) {
    return Response.json(
      { error: error.message, source: `rhna-progress API: ${view} query` },
      { status: 500 },
    );
  }
}
