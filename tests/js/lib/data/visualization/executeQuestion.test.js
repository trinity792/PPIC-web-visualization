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
        calculation: { id: "percentChange", params: {} },
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
  it("uses every adjacent pair in the selected time range for year-over-year percentage change", async () => {
    const result = await run(
      question({
        time: { contract: "range", startYear: 2020, endYear: 2030 },
        calculation: { id: "percentChange", params: {} },
      }),
    );

    expect(result.status).toBe("ok");
    expect(result.observations).toHaveLength(2);
    expect(result.periods).toEqual([2025, 2030]);
    expect(
      result.observations.map((row) => [
        row.period,
        row.value,
        row.includedPeriods,
        row.calculation,
      ]),
    ).toEqual([
      [2025, 25, [2020, 2025], { id: "percentChange", params: {} }],
      [2030, 20, [2025, 2030], { id: "percentChange", params: {} }],
    ]);
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
    expect(result.observations).toHaveLength(4);
    expect(
      Object.fromEntries(
        result.observations.map((row) => [
          `${row.geographyLabel}-${row.period}`,
          row.value,
        ]),
      ),
    ).toEqual({
      "Los Angeles-2025": 5,
      "Los Angeles-2030": expect.closeTo(4.761904762),
      "San Francisco-2025": 25,
      "San Francisco-2030": 20,
    });
    expect(
      result.observations.every(
        (row) => [2025, 2030].includes(row.period) && row.calculation.id === "percentChange",
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

  it("gives a materialized missing cell a source even with no sources axis", async () => {
    // Reproduces a real bug: modules with no `sources` axis (Housing Stress,
    // RHNA Progress, ...) never set `question.source`, so a materialized cell
    // with no matching row previously fell through to `source: undefined` and
    // failed the shared observation contract (`source` is required on every
    // row, missing or not). The fallback chain must reach something truthy
    // even when the adapter has neither a `label` nor a matched row.
    const sourcelessAdapter = {
      ...fixtureAdapter,
      label: undefined,
      select: () => [],
    };
    const result = await executeQuestion(
      {
        version: 3,
        question: {
          dataset: { kind: "module", moduleId: "projections" },
          outcome: { measureId: "Population" },
          geography: { subset: "Counties", locations: ["San Francisco"] },
          time: { contract: "snapshot", year: 2025 },
          calculation: { id: "actual", params: {} },
          comparisons: [comparison("cmp1", {})],
        },
      },
      { adapter: sourcelessAdapter },
    );

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({ status: OBSERVATION_STATUS.MISSING, value: null });
    expect(result.observations[0].source).toBeTruthy();
    expect(validateResponse(result).valid).toBe(true);
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

/**
 * Workstream Q - a module question can ask for a second and third measure.
 *
 * `question.outcomes` replaces `question.outcome`: the y measure first, then
 * the chart's extra roles ("x", "size"). The server still accepts the old
 * shape. Extra-measure rows carry `measureRole`; y rows stay untagged so every
 * chart that reads them today is unchanged.
 */
const MULTI_MEASURES = {
  Population: {
    id: "Population",
    label: "Population",
    unit: "people",
    aggregation: "notAllowed",
    calculations: ["actual", "percentChange"],
  },
  ShareOver30: {
    id: "ShareOver30",
    label: "Share Over 30%",
    unit: "percent",
    aggregation: "notAllowed",
    calculations: ["actual", "percentChange"],
  },
  MedianRent: {
    id: "MedianRent",
    label: "Median Rent",
    unit: "dollars",
    aggregation: "notAllowed",
    calculations: ["actual"],
  },
};

// [county]: [Population, ShareOver30, MedianRent]; null means suppressed.
const MULTI_VALUES = {
  Alameda: { Population: 1600000, ShareOver30: 20, MedianRent: 2400 },
  Fresno: { Population: 1000000, ShareOver30: 45, MedianRent: 1300 },
  Marin: { Population: 260000, ShareOver30: null, MedianRent: 3100 },
};

const multiAdapter = {
  id: "housing",
  measure(measureId) {
    return MULTI_MEASURES[measureId] || null;
  },
  availablePeriods: () => [2024, 2025],
  defaultReportingPeriod: () => 2025,
  select({ measure, periods }) {
    return periods.flatMap((period) =>
      Object.entries(MULTI_VALUES).map(([county, values]) => ({
        period,
        geographyId: county,
        geographyLabel: county,
        value: values[measure.id],
        status: values[measure.id] === null ? "suppressed" : "available",
        valueKind: "observed",
        source: "ACS",
      })),
    );
  },
};

function multiQuestion(overrides = {}) {
  return {
    version: 3,
    question: {
      dataset: { kind: "module", moduleId: "housing" },
      source: "ACS",
      outcomes: [{ role: "y", measureId: "Population" }],
      geography: { subset: "Counties", locations: ["Alameda", "Fresno", "Marin"] },
      time: { contract: "snapshot", year: 2025 },
      calculation: { id: "actual", params: {} },
      comparisons: [{ id: "cmp_all", dimensions: {} }],
      ...overrides,
    },
  };
}

const runMulti = (spec) => executeQuestion(spec, { adapter: multiAdapter });
const rowsOf = (result, measureId) =>
  result.observations.filter((row) => row.measureId === measureId);
const valueFor = (rows, county) => rows.find((row) => row.geographyId === county)?.value;

describe("Workstream Q: several measures in one question", () => {
  it("answers a question with only a y measure exactly as before", async () => {
    const result = await runMulti(multiQuestion());

    expect(result.status).toBe("ok");
    expect(result.observations).toHaveLength(3);
    for (const row of result.observations) {
      expect(row.measureId).toBe("Population");
      expect(row).not.toHaveProperty("measureRole");
    }
    expect(valueFor(result.observations, "Alameda")).toBe(1600000);
  });

  it("answers a question saved with the old outcome field", async () => {
    const old = multiQuestion().question;
    delete old.outcomes;
    old.outcome = { measureId: "Population" };
    const result = await runMulti({ version: 3, question: old });

    expect(result.status).toBe("ok");
    expect(result.observations).toHaveLength(3);
    expect(result.observations.every((row) => row.measureId === "Population")).toBe(true);
    expect(valueFor(result.observations, "Fresno")).toBe(1000000);
  });

  it("returns one row per extra measure, tagged with its role", async () => {
    const result = await runMulti(
      multiQuestion({
        outcomes: [
          { role: "y", measureId: "Population" },
          { role: "x", measureId: "ShareOver30" },
          { role: "size", measureId: "MedianRent" },
        ],
      }),
    );

    expect(result.status).toBe("ok");
    // 3 places x 3 measures.
    expect(result.observations).toHaveLength(9);
    const y = rowsOf(result, "Population");
    const x = rowsOf(result, "ShareOver30");
    const size = rowsOf(result, "MedianRent");
    expect(y.map((row) => row.measureRole)).toEqual([undefined, undefined, undefined]);
    expect(x.every((row) => row.measureRole === "x")).toBe(true);
    expect(size.every((row) => row.measureRole === "size")).toBe(true);
    // Each row carries its own measure's unit and label.
    expect(y[0].unit).toBe("people");
    expect(x[0].unit).toBe("percent");
    expect(x[0].measureLabel).toBe("Share Over 30%");
    expect(size[0].unit).toBe("dollars");
    expect(valueFor(x, "Alameda")).toBe(20);
    expect(valueFor(size, "Marin")).toBe(3100);
    expect(validateResponse(result).valid).toBe(true);
  });

  it("keeps a suppressed horizontal value as suppressed, not missing", async () => {
    const result = await runMulti(
      multiQuestion({
        outcomes: [
          { role: "y", measureId: "Population" },
          { role: "x", measureId: "ShareOver30" },
        ],
      }),
    );

    const marinX = rowsOf(result, "ShareOver30").find((row) => row.geographyId === "Marin");
    const marinY = rowsOf(result, "Population").find((row) => row.geographyId === "Marin");
    expect(marinX.status).toBe(OBSERVATION_STATUS.SUPPRESSED);
    expect(marinX.value).toBeNull();
    // The y value for the same place is untouched by the x suppression.
    expect(marinY.status).toBe(OBSERVATION_STATUS.AVAILABLE);
    expect(marinY.value).toBe(260000);
  });

  it("blocks an unknown measure and names its role", async () => {
    const result = await runMulti(
      multiQuestion({
        outcomes: [
          { role: "y", measureId: "Population" },
          { role: "x", measureId: "NotAMeasure" },
        ],
      }),
    );

    expect(result.status).toBe("blocked");
    const issue = result.issues.find((entry) => entry.code === "unknownOutcome");
    expect(issue).toBeDefined();
    expect(issue.level).toBe("blocking");
    expect(issue.role).toBe("x");
  });

  it("blocks the same measure in two roles", async () => {
    const result = await runMulti(
      multiQuestion({
        outcomes: [
          { role: "y", measureId: "Population" },
          { role: "x", measureId: "Population" },
        ],
      }),
    );

    expect(result.status).toBe("blocked");
    expect(result.issues.map((issue) => issue.code)).toContain("sameOutcomeTwice");
  });

  it("offers a calculation only when every measure's unit allows it", async () => {
    // Percent change suits people but not a percent, so one measure refuses it
    // for the whole question even though the y measure allows it.
    const refused = await runMulti(
      multiQuestion({
        outcomes: [
          { role: "y", measureId: "Population" },
          { role: "x", measureId: "ShareOver30" },
        ],
        time: { contract: "range", startYear: 2024, endYear: 2025 },
        calculation: { id: "percentChange", params: {} },
      }),
    );
    expect(refused.status).toBe("blocked");
    expect(refused.issues.map((issue) => issue.code)).toContain("calculationNotAllowedForUnit");

    const allowed = await runMulti(
      multiQuestion({
        time: { contract: "range", startYear: 2024, endYear: 2025 },
        calculation: { id: "percentChange", params: {} },
      }),
    );
    expect(allowed.issues.map((issue) => issue.code)).not.toContain("calculationNotAllowedForUnit");
  });

  it("ranks places by the chosen measure and keeps their other measures", async () => {
    const result = await runMulti(
      multiQuestion({
        outcomes: [
          { role: "y", measureId: "Population" },
          { role: "x", measureId: "ShareOver30" },
        ],
        // Fresno has the highest share (45) but not the highest population.
        calculation: {
          id: "actual",
          params: { ranking: { role: "x", direction: "top", n: 1 } },
        },
      }),
    );

    expect(result.status).toBe("ok");
    const places = (measureId) => rowsOf(result, measureId).map((row) => row.geographyId);
    expect(places("ShareOver30")).toEqual(["Fresno"]);
    // The y measure follows the place the x ranking kept; Alameda has the
    // largest population and is dropped, so measures were never mixed.
    expect(places("Population")).toEqual(["Fresno"]);
    expect(valueFor(rowsOf(result, "Population"), "Fresno")).toBe(1000000);
  });

  it("ranks by the y measure when no ranking measure is saved", async () => {
    const result = await runMulti(
      multiQuestion({
        outcomes: [
          { role: "y", measureId: "Population" },
          { role: "x", measureId: "ShareOver30" },
        ],
        calculation: { id: "actual", params: { ranking: { direction: "top", n: 2 } } },
      }),
    );

    expect(result.status).toBe("ok");
    const places = (measureId) =>
      rowsOf(result, measureId)
        .map((row) => row.geographyId)
        .sort();
    // Top two populations are Alameda and Fresno.
    expect(places("Population")).toEqual(["Alameda", "Fresno"]);
    expect(places("ShareOver30")).toEqual(["Alameda", "Fresno"]);
  });

  it("blocks a ranking measure the question has no measure for", async () => {
    const result = await runMulti(
      multiQuestion({
        calculation: {
          id: "actual",
          params: { ranking: { role: "size", direction: "top", n: 1 } },
        },
      }),
    );

    expect(result.status).toBe("blocked");
    expect(result.issues.map((issue) => issue.code)).toContain("unknownRankingMeasure");
  });
});

it("validates each measure against a comparison before selecting its rows", async () => {
  const checked = [];
  const result = await executeQuestion(multiQuestion({ outcomes: [
    { role: "y", measureId: "Population" }, { role: "x", measureId: "ShareOver30" },
  ] }), { adapter: {
    ...multiAdapter,
    validateComparison({ comparison, measure }) {
      checked.push(measure.id);
      return measure.id === "ShareOver30" ? [{ code: "unsupportedShare", level: "comparison", comparisonId: comparison.id, message: "Share is unavailable for this comparison." }] : [];
    },
  } });
  expect(checked).toEqual(["Population", "ShareOver30"]);
  expect(result.status).toBe("blocked");
  expect(result.comparisons[0].status).toBe("invalid");
  expect(result.observations).toEqual([]);
  expect(validateResponse(result).valid).toBe(true);
});
