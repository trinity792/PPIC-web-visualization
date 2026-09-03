/**
 * Workstream C - lib/data/visualization/executeQuestion.js.
 *
 * One question in, one set of common observations out. The v2 path chose an API
 * view from the chart id (`QUERY_SHAPES` in `chartData.js`), so a switch from
 * Line to Bar changed the response shape and moved where the arithmetic
 * happened. This module is the replacement boundary: it validates the shared
 * question once, runs each comparison independently, materializes every
 * requested cell, calls the shared calculation layer, and returns one contract.
 *
 * Partial failure is a product result, not an error. One invalid comparison
 * must not blank the chart, and it must not vanish either - the reader has to
 * be told which of their ten comparisons could not be answered and why.
 *
 * The adapter here is a fake over the shared fixture. It exists to prove the
 * boundary, not the module: a real adapter resolves field names, sources, and
 * geography, and returns exactly these base rows.
 */

import { describe, expect, it } from "vitest";

import { executeQuestion } from "@/lib/data/visualization/executeQuestion";
import { OBSERVATION_STATUS, validateResponse } from "@/lib/visualization/observationContract";
import {
  PROJECTIONS_ROWS,
  PROJECTIONS_TIME,
} from "@/tests/fixtures/visualization-v3/projections";

const POPULATION = {
  id: "Population",
  label: "Population",
  unit: "people",
  aggregation: "notAllowed",
  calculations: ["actual", "numericChange", "percentChange", "indexed", "ranking"],
};

/** A minimal module adapter over the Projections fixture. */
const fixtureAdapter = {
  id: "projections",
  measure(measureId) {
    return measureId === "Population" ? POPULATION : null;
  },
  availablePeriods() {
    return [...PROJECTIONS_TIME.availablePeriods];
  },
  defaultReportingPeriod() {
    return PROJECTIONS_TIME.defaultReportingPeriod;
  },
  validateComparison({ question, comparison }) {
    // The one domain rule this fake keeps: US-state geography only exists in
    // the Census vintage, mirroring the real subset/source guard.
    if (question.geography.subset === "US States" && question.source !== "Census cc-est") {
      return [
        {
          code: "invalidSourceForSubset",
          level: "comparison",
          comparisonId: comparison.id,
          message: "US States are only available from Census cc-est.",
        },
      ];
    }
    return [];
  },
  select({ question, comparison }) {
    const wanted = { Source: question.source, ...comparison.dimensions };
    return PROJECTIONS_ROWS.filter(
      (row) =>
        question.geography.locations.includes(row.Location) &&
        Object.entries(wanted).every(([key, value]) => row[key] === value),
    ).map((row) => ({
      period: row.Year,
      geographyId: row.Location,
      geographyLabel: row.Location,
      value: row.Population,
      status: row.status,
      valueKind: row.valueKind,
      source: row.Source,
    }));
  },
};

const comparison = (id, dimensions) => ({ id, dimensions });

function question(overrides = {}) {
  return {
    version: 3,
    question: {
      dataset: { kind: "module", moduleId: "projections" },
      source: "DoF P-3",
      outcome: { measureId: "Population" },
      geography: { subset: "Counties", locations: ["San Francisco"] },
      time: { contract: "snapshot", year: 2025 },
      calculation: { id: "actual", params: {} },
      comparisons: [
        comparison("cmp_latina", {
          "Race/Ethnicity": "Hispanic",
          Sex: "Female",
          "Age Group": "All Ages",
        }),
      ],
      ...overrides,
    },
  };
}

const run = (spec) => executeQuestion(spec, { adapter: fixtureAdapter });

describe("one coordinated execution", () => {
  it("executes ten independent comparisons in one request", async () => {
    // Ten distinct populations, answered together. The v2 path would have sent
    // ten chart-shaped GET requests and stitched them in the browser.
    const comparisons = [
      ["Hispanic", "Female"],
      ["Hispanic", "Male"],
      ["White", "Female"],
      ["White", "Male"],
      ["Black", "Female"],
      ["Hispanic", "Both Sexes"],
      ["AIAN", "Male"],
      ["Hispanic", "Female"],
      ["White", "Female"],
      ["Black", "Female"],
    ].map(([race, sex], index) =>
      comparison(`cmp_${index}`, {
        "Race/Ethnicity": race,
        Sex: sex,
        "Age Group": "All Ages",
      }),
    );

    const result = await run(question({ comparisons }));

    expect(result.status).toBe("ok");
    expect(result.comparisons.map((entry) => entry.id)).toEqual(
      comparisons.map((entry) => entry.id),
    );
    // Every requested id is answered, and no observation belongs to an id that
    // was not asked for.
    const answered = new Set(result.observations.map((row) => row.comparisonId));
    for (const id of answered) {
      expect(comparisons.map((entry) => entry.id)).toContain(id);
    }
    expect(validateResponse(result).valid).toBe(true);
  });

  it("returns a response that satisfies the shared observation contract", async () => {
    const result = await run(question());
    expect(validateResponse(result).valid).toBe(true);
    expect(result.periods).toEqual([2025]);
    for (const row of result.observations) {
      expect(row.measureId).toBe("Population");
      expect(row.comparisonLabel).toEqual(expect.any(String));
      expect(row.source).toBe("DoF P-3");
    }
  });

  it("does not vary its response shape with a chart type", async () => {
    // There is nowhere in the request to put one. This is the property that
    // retires QUERY_SHAPES.
    const spec = question();
    expect(JSON.stringify(spec)).not.toContain("chartType");
    const result = await run(spec);
    expect(Object.keys(result).sort()).toEqual(
      ["comparisons", "issues", "observations", "periods", "status"].sort(),
    );
  });
});

describe("partial comparison failure", () => {
  it("keeps valid observations when one comparison is invalid", async () => {
    const result = await executeQuestion(
      question({
        geography: { subset: "Counties", locations: ["San Francisco"] },
        comparisons: [
          comparison("cmp_ok", {
            "Race/Ethnicity": "Hispanic",
            Sex: "Female",
            "Age Group": "All Ages",
          }),
          comparison("cmp_bad", {
            "Race/Ethnicity": "White",
            Sex: "Female",
            "Age Group": "All Ages",
          }),
        ],
      }),
      {
        adapter: {
          ...fixtureAdapter,
          // Only the second comparison trips the domain rule.
          validateComparison: ({ comparison: entry }) =>
            entry.id === "cmp_bad"
              ? [
                  {
                    code: "invalidSourceForSubset",
                    level: "comparison",
                    comparisonId: entry.id,
                    message: "US States are only available from Census cc-est.",
                  },
                ]
              : [],
        },
      },
    );

    expect(result.status).toBe("ok");
    // The good card is drawn...
    expect(result.observations.map((row) => row.comparisonId)).toEqual(["cmp_ok"]);
    // ...and the bad one is explained rather than dropped in silence.
    expect(result.issues).toEqual([
      expect.objectContaining({ level: "comparison", comparisonId: "cmp_bad" }),
    ]);
    expect(result.comparisons.map((entry) => [entry.id, entry.status])).toEqual([
      ["cmp_ok", "ok"],
      ["cmp_bad", "invalid"],
    ]);
  });

  it("attributes the failure to the comparison that caused it", async () => {
    const result = await run(
      question({
        geography: { subset: "Counties", locations: ["San Francisco"] },
        comparisons: [
          comparison("cmp_ok", {
            "Race/Ethnicity": "Hispanic",
            Sex: "Female",
            "Age Group": "All Ages",
          }),
          comparison("cmp_bad", {
            "Race/Ethnicity": "Hispanic",
            Sex: "Female",
            "Age Group": "All Ages",
          }),
        ],
        calculation: { id: "percentChange", params: { startYear: 2025, endYear: 2025 } },
      }),
    );

    // Whatever the specific code, the reader must be able to tell WHICH card
    // failed. Renderers are forbidden from inferring it from an absent trace.
    for (const issue of result.issues.filter((entry) => entry.level === "comparison")) {
      expect(issue.comparisonId).toEqual(expect.any(String));
      expect(result.comparisons.map((entry) => entry.id)).toContain(issue.comparisonId);
    }
  });

  it("blocks when the shared outcome is unknown", async () => {
    const result = await run(question({ outcome: { measureId: "NoSuchMeasure" } }));

    // A shared error is not a partial result: there is no valid interpretation
    // of the question at all.
    expect(result.status).toBe("blocked");
    expect(result.observations).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "unknownOutcome", level: "blocking" }),
    ]);
  });

  it("blocks when the shared time request is malformed", async () => {
    const result = await run(question({ time: { contract: "snapshot", year: 1066 } }));
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "periodNotAvailable", level: "blocking" }),
    ]);
  });

  it("blocks when no comparison remains valid", async () => {
    const result = await run(
      question({
        geography: { subset: "US States", locations: ["San Francisco"] },
        comparisons: [
          comparison("cmp_a", { "Race/Ethnicity": "Hispanic", Sex: "Female" }),
          comparison("cmp_b", { "Race/Ethnicity": "White", Sex: "Female" }),
        ],
      }),
    );

    // Both comparisons trip the source rule. The shared fields were valid, but
    // an empty valid set is still a chart-level failure.
    expect(result.status).toBe("blocked");
    expect(result.issues.filter((issue) => issue.level === "comparison")).toHaveLength(2);
    expect(result.issues.some((issue) => issue.level === "blocking")).toBe(true);
  });
});

describe("materialized cells", () => {
  it("uses the selected time range as change endpoints when parameters are omitted", async () => {
    const result = await run(
      question({
        time: { contract: "range", startYear: 2020, endYear: 2030 },
        calculation: { id: "percentChange", params: {} },
      }),
    );

    expect(result.status).toBe("ok");
    expect(result.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "distinctPeriodsRequired" })]),
    );
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      period: 2030,
      includedPeriods: [2020, 2030],
      calculation: {
        id: "percentChange",
        params: { startYear: 2020, endYear: 2030 },
      },
    });
  });

  it("calculates a change independently for every selected geography", async () => {
    const result = await run(
      question({
        geography: { subset: "Counties", locations: ["San Francisco", "Los Angeles"] },
        time: { contract: "range", startYear: 2020, endYear: 2030 },
        calculation: { id: "percentChange", params: {} },
      }),
    );

    expect(result.status).toBe("ok");
    expect(result.observations).toHaveLength(2);
    expect(
      Object.fromEntries(
        result.observations.map((row) => [row.geographyLabel, row.value]),
      ),
    ).toEqual({
      "Los Angeles": 10,
      "San Francisco": 50,
    });
    expect(
      result.observations.every(
        (row) => row.period === 2030 && row.calculation.id === "percentChange",
      ),
    ).toBe(true);
  });

  it("materializes a requested missing cell", async () => {
    const result = await run(
      question({
        // California has no Black rows at all in the fixture.
        geography: { subset: "Counties", locations: ["San Francisco", "California"] },
        comparisons: [
          comparison("cmp_black_women", {
            "Race/Ethnicity": "Black",
            Sex: "Female",
            "Age Group": "All Ages",
          }),
        ],
        time: { contract: "snapshot", year: 2030 },
      }),
    );

    const california = result.observations.find((row) => row.geographyId === "California");
    // Absence becomes an explicit row. It never becomes zero and it never
    // becomes a gap the renderer has to notice for itself.
    expect(california).toMatchObject({
      status: OBSERVATION_STATUS.MISSING,
      value: null,
      comparisonId: "cmp_black_women",
    });
  });

  it("returns one cell per requested comparison, period, and geography", async () => {
    const result = await run(
      question({
        geography: { subset: "Counties", locations: ["San Francisco", "Los Angeles"] },
        time: { contract: "range", startYear: 2020, endYear: 2030 },
        comparisons: [
          comparison("cmp_latina", {
            "Race/Ethnicity": "Hispanic",
            Sex: "Female",
            "Age Group": "All Ages",
          }),
          comparison("cmp_white_women", {
            "Race/Ethnicity": "White",
            Sex: "Female",
            "Age Group": "All Ages",
          }),
        ],
      }),
    );

    // 2 comparisons x 3 periods x 2 geographies.
    expect(result.observations).toHaveLength(12);
    expect(result.periods).toEqual([2020, 2025, 2030]);
  });

  it("preserves a requested suppressed cell", async () => {
    const result = await run(
      question({
        comparisons: [
          comparison("cmp_black_women", {
            "Race/Ethnicity": "Black",
            Sex: "Female",
            "Age Group": "All Ages",
          }),
        ],
      }),
    );

    const row = result.observations[0];
    expect(row.status).toBe(OBSERVATION_STATUS.SUPPRESSED);
    expect(row.value).toBeNull();
    // Suppression is distinguishable from absence, because the two mean
    // different things to a reader and to a citation.
    expect(row.status).not.toBe(OBSERVATION_STATUS.MISSING);
  });

  it("keeps an unavailable cell in the comparison summary", async () => {
    const result = await run(
      question({
        comparisons: [
          comparison("cmp_black_women", {
            "Race/Ethnicity": "Black",
            Sex: "Female",
            "Age Group": "All Ages",
          }),
        ],
      }),
    );

    // A comparison whose every cell is unavailable still has a summary row, so
    // the editor can show the card as "no data" instead of dropping it.
    expect(result.comparisons).toEqual([
      expect.objectContaining({ id: "cmp_black_women", status: "noData" }),
    ]);
  });

  it("defaults a snapshot to the adapter's declared reporting period", async () => {
    const spec = question({ time: { contract: "snapshot" } });
    const result = await run(spec);
    expect(result.periods).toEqual([PROJECTIONS_TIME.defaultReportingPeriod]);
    expect(result.periods).not.toContain(Math.max(...PROJECTIONS_TIME.availablePeriods));
  });
});
