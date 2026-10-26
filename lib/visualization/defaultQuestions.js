/**
 * The default v3 question each module opens on.
 *
 * These are real module questions, not fixture responses: `/[module]` seeds
 * the workbench with one, and the editor sends it through the same POST routes
 * and observation adapters as any reader-authored question. They are
 * complete on arrival so each topic immediately shows a useful chart. They
 * seed the editor only; subsequent changes and saved views keep their own state.
 *
 * Formerly `developmentReview.js`, which served the dev-only
 * `/visualization-v3-review` page until the module pages cut over (2026-09-14).
 */

import { CALIFORNIA_COUNTIES, REGION_NAMES } from "@/lib/geography/californiaGeography";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";

// Use the schema's published periods so a refreshed dataset also refreshes the
// opening range or snapshot, including Building Permits' monthly tokens.
function defaultTime(moduleId, contract = "range") {
  const { availablePeriods, defaultReportingPeriod } = getModuleSchema(moduleId).time;
  return Object.freeze(contract === "snapshot"
    ? { contract, year: defaultReportingPeriod ?? availablePeriods.at(-1) }
    : { contract, startYear: availablePeriods[0], endYear: availablePeriods.at(-1) });
}

const ALL_REGIONS = Object.freeze({ subset: "Regions", locations: REGION_NAMES });

const DEFAULT_QUESTIONS = Object.freeze({
  "demographic-projections": Object.freeze({
    version: 3,
    question: Object.freeze({
      dataset: Object.freeze({ kind: "module", moduleId: "demographic-projections" }),
      source: "DoF P-3",
      outcomes: Object.freeze([{ role: "y", measureId: "Population" }]),
      geography: Object.freeze({
        subset: "Regions",
        locations: Object.freeze(["Bay Area", "Inland Empire", "Central Coast", "San Diego (Regional)"]),
      }),
      time: defaultTime("demographic-projections"),
      calculation: Object.freeze({ id: "actual", params: Object.freeze({}) }),
      comparisons: Object.freeze([
        Object.freeze({
          id: "cmp_women",
          dimensions: Object.freeze({ "Race/Ethnicity": "All", Sex: "Female", "Age Group": "All Ages" }),
          customLabel: null,
          color: null,
        }),
        Object.freeze({
          id: "cmp_men",
          dimensions: Object.freeze({ "Race/Ethnicity": "All", Sex: "Male", "Age Group": "All Ages" }),
          customLabel: null,
          color: null,
        }),
      ]),
    }),
    presentation: Object.freeze({
      chartType: "line",
      comparisonPresentation: "tabs",
      // These are automatic defaults, not authored labels. Leaving them empty
      // lets a chart-type switch derive the correct axes without overwriting
      // anything the reader types.
      labels: Object.freeze({}),
      format: Object.freeze({}),
      // With no explicit palette, the adapter selects the official PPIC group
      // sized to the rendered series (for example nine regions or three years).
      appearance: Object.freeze({}),
      annotations: Object.freeze([]),
    }),
  }),
  "components-of-change": Object.freeze({
    version: 3,
    question: Object.freeze({
      dataset: Object.freeze({ kind: "module", moduleId: "components-of-change" }),
      source: "DoF",
      outcomes: Object.freeze([{ role: "y", measureId: "Net Migration" }]),
      geography: ALL_REGIONS,
      time: defaultTime("components-of-change", "snapshot"),
      calculation: Object.freeze({ id: "actual", params: Object.freeze({}) }),
      comparisons: Object.freeze([
        Object.freeze({
          // Execution still requires one comparison envelope, but Components
          // of Change derives its visible series from the selected locations.
          id: "cmp_locations",
          dimensions: Object.freeze({}),
          customLabel: null,
          color: null,
        }),
      ]),
    }),
    presentation: Object.freeze({
      chartType: "bar",
      comparisonPresentation: "combined",
      labels: Object.freeze({}),
      format: Object.freeze({}),
      appearance: Object.freeze({ sort: "descending" }),
      annotations: Object.freeze([]),
    }),
  }),
  pophousing: Object.freeze({
    version: 3,
    question: Object.freeze({
      dataset: Object.freeze({ kind: "module", moduleId: "pophousing" }),
      // No `source`: Source is per-row provenance here (E-5/E-8/Aggregated),
      // not a dataset toggle — omitting it reads as "all vintages", same as v2.
      outcomes: Object.freeze([{ role: "y", measureId: "Total Population" }]),
      geography: ALL_REGIONS,
      time: defaultTime("pophousing"),
      calculation: Object.freeze({ id: "actual", params: Object.freeze({}) }),
      comparisons: Object.freeze([
        // Location-only comparisons, like Components of Change.
        Object.freeze({
          id: "cmp_locations",
          dimensions: Object.freeze({}),
          customLabel: null,
          color: null,
        }),
      ]),
    }),
    presentation: Object.freeze({
      chartType: "line",
      comparisonPresentation: "combined",
      labels: Object.freeze({}),
      format: Object.freeze({}),
      appearance: Object.freeze({}),
      annotations: Object.freeze([]),
    }),
  }),
  "housing-stress": Object.freeze({
    version: 3,
    question: Object.freeze({
      dataset: Object.freeze({ kind: "module", moduleId: "housing-stress" }),
      // No `source`: Housing Stress has no dataset-source axis.
      outcomes: Object.freeze([{ role: "y", measureId: "Number Over 50%" }]),
      geography: ALL_REGIONS,
      time: defaultTime("housing-stress"),
      calculation: Object.freeze({ id: "actual", params: Object.freeze({}) }),
      comparisons: Object.freeze([
        Object.freeze({
          id: "cmp_all_households",
          dimensions: Object.freeze({ "Race/Ethnicity": "All", Tenure: "Total" }),
          customLabel: null,
          color: null,
        }),
      ]),
    }),
    presentation: Object.freeze({
      chartType: "line",
      comparisonPresentation: "combined",
      labels: Object.freeze({}),
      format: Object.freeze({}),
      appearance: Object.freeze({}),
      annotations: Object.freeze([]),
    }),
  }),
  "building-permits": Object.freeze({
    version: 3,
    question: Object.freeze({
      dataset: Object.freeze({ kind: "module", moduleId: "building-permits" }),
      // No `source`: Building Permits has no dataset-source axis.
      outcomes: Object.freeze([{ role: "y", measureId: "Total" }]),
      geography: ALL_REGIONS,
      // Monthly tokens, not bare years — see `monthlyPeriods` in the schema.
      time: defaultTime("building-permits"),
      calculation: Object.freeze({ id: "actual", params: Object.freeze({}) }),
      comparisons: Object.freeze([
        // Location-only comparisons, like Components of Change.
        Object.freeze({
          id: "cmp_locations",
          dimensions: Object.freeze({}),
          customLabel: null,
          color: null,
        }),
      ]),
    }),
    presentation: Object.freeze({
      chartType: "line",
      comparisonPresentation: "combined",
      labels: Object.freeze({}),
      format: Object.freeze({}),
      appearance: Object.freeze({}),
      annotations: Object.freeze([]),
    }),
  }),
  "rhna-progress": Object.freeze({
    version: 3,
    question: Object.freeze({
      dataset: Object.freeze({ kind: "module", moduleId: "rhna-progress" }),
      // No `source`: RHNA Progress has no dataset-source axis.
      outcomes: Object.freeze([{ role: "y", measureId: "On Track Score" }]),
      // HCD uses "County" suffixes and lists San Francisco as a City only.
      geography: Object.freeze({
        subset: "Counties",
        locations: Object.freeze(CALIFORNIA_COUNTIES
          .filter((county) => county !== "San Francisco")
          .map((county) => `${county} County`)),
      }),
      // "snapshot" with no year: the schema publishes no static period list
      // (see rhnaProgress.js `time` comment), so this resolves server-side to
      // the adapter's own latest-row default, matching v2's hidden picker.
      time: Object.freeze({ contract: "snapshot" }),
      calculation: Object.freeze({ id: "actual", params: Object.freeze({}) }),
      comparisons: Object.freeze([
        Object.freeze({
          id: "cmp_total_income",
          dimensions: Object.freeze({ "Income Level": "Total" }),
          customLabel: null,
          color: null,
        }),
      ]),
    }),
    presentation: Object.freeze({
      chartType: "choroplethMap",
      comparisonPresentation: "tabs",
      labels: Object.freeze({}),
      format: Object.freeze({}),
      appearance: Object.freeze({}),
      annotations: Object.freeze([]),
    }),
  }),
});

export const DEFAULT_QUESTION_MODULE_IDS = Object.freeze(Object.keys(DEFAULT_QUESTIONS));

/**
 * The standalone Visualization Tool's opening question: an inline dataset with
 * no table yet. The Import step supplies the table and the store derives the
 * outcome, comparisons, and time from its columns.
 */
const BYOD_DEFAULT_QUESTION = Object.freeze({
  version: 3,
  question: Object.freeze({
    dataset: Object.freeze({ kind: "inline", inline: null, bindings: Object.freeze({}) }),
    outcomes: Object.freeze([]),
    geography: Object.freeze({ subset: "", locations: Object.freeze([]) }),
    time: Object.freeze({ contract: "none" }),
    calculation: Object.freeze({ id: "actual", params: Object.freeze({}) }),
    comparisons: Object.freeze([]),
  }),
  presentation: Object.freeze({
    chartType: "line",
    comparisonPresentation: "combined",
    labels: Object.freeze({}),
    format: Object.freeze({}),
    // An imported table has no data source to cite, so the custom tool starts
    // with the source-and-notes (footnote) box switched off; the reader can turn
    // it on from Appearance. Module charts keep it on by default.
    appearance: Object.freeze({ showSource: false }),
    annotations: Object.freeze([]),
  }),
});

/** A fresh, mutable copy of the module's (or the tool's) default question, or null. */
export function getDefaultQuestion(moduleId) {
  const spec = moduleId === "byod" ? BYOD_DEFAULT_QUESTION : DEFAULT_QUESTIONS[moduleId];
  return spec ? JSON.parse(JSON.stringify(spec)) : null;
}
