/**
 * The default v3 question each module opens on.
 *
 * These are real module questions, not fixture responses: `/[module]` seeds
 * the workbench with one, and the editor sends it through the same POST routes
 * and observation adapters as any reader-authored question. They are
 * deliberately unanswered where the module has real comparison dimensions
 * (no comparison until the reader adds one) and location-only elsewhere (one
 * blank `cmp_locations` envelope, no locations) - the workbench never chooses
 * a setting for the reader, so every default here renders as the skeleton
 * naming what is still to be set.
 *
 * Formerly `developmentReview.js`, which served the dev-only
 * `/visualization-v3-review` page until the module pages cut over (2026-09-14).
 */

const DEFAULT_QUESTIONS = Object.freeze({
  "demographic-projections": Object.freeze({
    version: 3,
    question: Object.freeze({
      dataset: Object.freeze({ kind: "module", moduleId: "demographic-projections" }),
      source: "DoF P-3",
      outcome: Object.freeze({ measureId: "Population" }),
      geography: Object.freeze({ subset: "", locations: Object.freeze([]) }),
      time: Object.freeze({ contract: "range", startYear: 2020, endYear: 2070 }),
      calculation: Object.freeze({ id: "actual", params: Object.freeze({}) }),
      // Start as an unanswered question. The comparison editor owns the empty
      // Comparison 1 draft; a saved comparison does not exist until the reader
      // completes the demographic selections and clicks Add comparison.
      comparisons: Object.freeze([]),
    }),
    presentation: Object.freeze({
      chartType: "line",
      comparisonPresentation: "combined",
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
      outcome: Object.freeze({ measureId: "Births" }),
      geography: Object.freeze({ subset: "", locations: Object.freeze([]) }),
      time: Object.freeze({ contract: "range", startYear: 1991, endYear: 2024 }),
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
      chartType: "line",
      comparisonPresentation: "combined",
      labels: Object.freeze({}),
      format: Object.freeze({}),
      appearance: Object.freeze({}),
      annotations: Object.freeze([]),
    }),
  }),
  pophousing: Object.freeze({
    version: 3,
    question: Object.freeze({
      dataset: Object.freeze({ kind: "module", moduleId: "pophousing" }),
      // No `source`: Source is per-row provenance here (E-5/E-8/Aggregated),
      // not a dataset toggle — omitting it reads as "all vintages", same as v2.
      outcome: Object.freeze({ measureId: "Total Population" }),
      geography: Object.freeze({ subset: "", locations: Object.freeze([]) }),
      time: Object.freeze({ contract: "range", startYear: 1991, endYear: 2026 }),
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
      outcome: Object.freeze({ measureId: "Share Over 30%" }),
      geography: Object.freeze({ subset: "", locations: Object.freeze([]) }),
      time: Object.freeze({ contract: "range", startYear: 2012, endYear: 2024 }),
      calculation: Object.freeze({ id: "actual", params: Object.freeze({}) }),
      // Race/Ethnicity and Tenure are real comparison dimensions here, so this
      // starts as an unanswered question, like demographic-projections.
      comparisons: Object.freeze([]),
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
      outcome: Object.freeze({ measureId: "Total" }),
      geography: Object.freeze({ subset: "", locations: Object.freeze([]) }),
      // Monthly tokens, not bare years — see `monthlyPeriods` in the schema.
      time: Object.freeze({ contract: "range", startYear: "2010-01", endYear: "2026-06" }),
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
      outcome: Object.freeze({ measureId: "On Track Score" }),
      geography: Object.freeze({ subset: "", locations: Object.freeze([]) }),
      // "snapshot" with no year: the schema publishes no static period list
      // (see rhnaProgress.js `time` comment), so this resolves server-side to
      // the adapter's own latest-row default, matching v2's hidden picker.
      time: Object.freeze({ contract: "snapshot" }),
      calculation: Object.freeze({ id: "actual", params: Object.freeze({}) }),
      // Income Level is a real comparison dimension, so this starts as an
      // unanswered question, like demographic-projections.
      comparisons: Object.freeze([]),
    }),
    presentation: Object.freeze({
      // Only bar and choroplethMap are supported (cross-sectional dataset).
      chartType: "bar",
      comparisonPresentation: "combined",
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
    outcome: Object.freeze({}),
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
    appearance: Object.freeze({}),
    annotations: Object.freeze([]),
  }),
});

/** A fresh, mutable copy of the module's (or the tool's) default question, or null. */
export function getDefaultQuestion(moduleId) {
  const spec = moduleId === "byod" ? BYOD_DEFAULT_QUESTION : DEFAULT_QUESTIONS[moduleId];
  return spec ? JSON.parse(JSON.stringify(spec)) : null;
}
