/**
 * Seed questions for the selected-topic v3 editor surface.
 *
 * These are real module questions, not fixture responses: the editor sends
 * them through the same POST routes and observation adapters used by the v3
 * production boundary. Keeping the seeds here makes their validity testable
 * without exposing a development route in production.
 */

const REVIEW_SPECS = Object.freeze({
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
});

export const V3_REVIEW_MODULE_IDS = Object.freeze(Object.keys(REVIEW_SPECS));

export function getV3DevelopmentReviewSpec(moduleId) {
  const spec = REVIEW_SPECS[moduleId];
  return spec ? JSON.parse(JSON.stringify(spec)) : null;
}
