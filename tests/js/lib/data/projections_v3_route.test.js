/**
 * Workstream C - the v3 POST handler on app/api/projections/route.js, verified
 * end to end against the committed Projections CSV.
 *
 * Why POST: ten comparisons, each with its own dimension selections and
 * optional Advanced Mode geography and time overrides, do not fit in a query
 * string, and encoding them there is how the chart type crept into the request
 * in the first place. The narrow GET endpoints (location lookups) stay.
 *
 * Projections is one of the two first server implementations because its
 * fixture surface is the widest: demographic strata, precomputed aggregates,
 * two vintages, and both observed and projected values.
 */

import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/projections/route";
import { OBSERVATION_STATUS, validateResponse } from "@/lib/visualization/observationContract";
import { PROJECTIONS_TIME } from "@/tests/fixtures/visualization-v3/projections";

async function post(body) {
  const res = await POST(
    new Request("http://test/api/projections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

const comparison = (id, dimensions, extra = {}) => ({ id, dimensions, ...extra });

function question(overrides = {}) {
  return {
    version: 3,
    question: {
      dataset: { kind: "module", moduleId: "projections" },
      source: "DoF P-3",
      outcome: { measureId: "Population" },
      geography: { subset: "Counties", locations: ["San Francisco"] },
      time: { contract: "snapshot" },
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

describe("projections v3 POST", () => {
  it("accepts a v3 POST with irregular age sex and race comparisons", async () => {
    // Not a cross-product: Black women, White men, and everyone aged 0-4. A
    // generator would have produced twelve populations the user never asked
    // about, and the v2 scalar filters could hold only one of the three.
    const { status, body } = await post(
      question({
        comparisons: [
          comparison("cmp_black_women", {
            "Race/Ethnicity": "Black",
            Sex: "Female",
            "Age Group": "All Ages",
          }),
          comparison("cmp_white_men", {
            "Race/Ethnicity": "White",
            Sex: "Male",
            "Age Group": "All Ages",
          }),
          comparison("cmp_under_five", {
            "Race/Ethnicity": "All",
            Sex: "Both Sexes",
            "Age Group": "0-4",
          }),
        ],
      }),
    );

    expect(status).toBe(200);
    expect(validateResponse(body).valid).toBe(true);
    expect(body.comparisons.map((entry) => entry.id)).toEqual([
      "cmp_black_women",
      "cmp_white_men",
      "cmp_under_five",
    ]);
    // Each comparison is applied independently: three different populations,
    // three different values.
    const values = body.observations.map((row) => row.value);
    expect(new Set(values).size).toBe(3);
  });

  it("defaults a snapshot to the declared 2025 reporting year", async () => {
    const { status, body } = await post(question());

    expect(status).toBe(200);
    expect(body.periods).toEqual([PROJECTIONS_TIME.defaultReportingPeriod]);
    expect(body.periods).toEqual([2025]);
    // The dataset runs to 2070. The projection horizon is not a default: it is
    // the far end of a forecast, and nobody opens a chart wanting to start
    // there.
    expect(body.periods).not.toContain(2070);
    expect(body.observations.every((row) => row.period === 2025)).toBe(true);
  });

  it("rejects an invalid source and geography pair as a comparison issue", async () => {
    // US States live only in the Census cc-est vintage. The rule predates the
    // refactor and has to survive the new contract unchanged.
    const { status, body } = await post(
      question({
        source: "DoF P-3",
        geography: { subset: "US States", locations: ["Texas"] },
      }),
    );

    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          comparisonId: "cmp_latina",
          message: expect.stringMatching(/Census cc-est/),
        }),
      ]),
    );
    // No comparison survives, so this is a chart-level failure even though the
    // shared fields parsed.
    expect(status).toBe(400);
    expect(body.status).toBe("blocked");
  });

  it("rejects an unfinished comparison instead of aggregating every demographic row", async () => {
    const { status, body } = await post(
      question({ comparisons: [comparison("cmp_unfinished", {})] }),
    );

    expect(status).toBe(400);
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "incompleteComparison",
          comparisonId: "cmp_unfinished",
          message: expect.stringMatching(/Race\/ethnicity.*Sex.*Age group/i),
        }),
      ]),
    );
    expect(body.observations).toEqual([]);
  });

  it("returns observed and projected value kinds separately from status", async () => {
    const { status, body } = await post(
      question({ time: { contract: "range", startYear: 2020, endYear: 2040 } }),
    );

    expect(status).toBe(200);
    const kinds = new Set(body.observations.map((row) => row.valueKind));
    expect(kinds).toContain("observed");
    expect(kinds).toContain("projected");
    // "projected" is a statement about meaning, never about availability. An
    // available projection is still available.
    for (const row of body.observations) {
      expect(["available", "missing", "suppressed"]).toContain(row.status);
      expect(["observed", "projected", "derived"]).toContain(row.valueKind);
      if (row.status === OBSERVATION_STATUS.AVAILABLE) {
        expect(Number.isFinite(row.value), `${row.period}`).toBe(true);
      } else {
        expect(row.value, `${row.period}`).toBeNull();
      }
    }
  });

  it("selects the stored aggregate row rather than summing its components", async () => {
    const [aggregate, components] = await Promise.all([
      post(
        question({
          comparisons: [
            comparison("cmp_all_ages", {
              "Race/Ethnicity": "All",
              Sex: "Both Sexes",
              "Age Group": "All Ages",
            }),
          ],
        }),
      ),
      post(
        question({
          comparisons: [
            comparison("cmp_two_bins", {
              "Race/Ethnicity": "All",
              Sex: "Both Sexes",
              "Age Group": ["0-4", "5-9"],
            }),
          ],
        }),
      ),
    ]);

    // "All Ages" is a precomputed row in the CSV, not the sum of the bins the
    // second request asks for. Confusing the two double-counts a population.
    expect(aggregate.body.observations[0].value).toBeGreaterThan(
      components.body.observations[0].value,
    );
  });

  it("returns the source that produced each value", async () => {
    const { body } = await post(question({ source: "DoF P-3" }));
    expect(body.observations.every((row) => row.source === "DoF P-3")).toBe(true);
  });

  it("keeps geography out of the demographic comparison label", async () => {
    const { body } = await post(question());

    expect(body.comparisons[0].label).toBe("Latina Women");
    expect(body.observations.every((row) => row.comparisonLabel === "Latina Women")).toBe(true);
    expect(body.observations[0].geographyLabel).toBe("San Francisco");
  });

  it("keeps a structured comparison geography override out of its demographic label", async () => {
    const overridden = comparison(
      "cmp_latina",
      {
        "Race/Ethnicity": "Hispanic",
        Sex: "Female",
        "Age Group": "All Ages",
      },
      { geography: { subset: "Counties", locations: ["Alameda"] } },
    );
    const { status, body } = await post(question({ comparisons: [overridden] }));

    expect(status).toBe(200);
    expect(body.comparisons[0].label).toBe("Latina Women");
    expect(body.observations.every((row) => row.comparisonLabel === "Latina Women")).toBe(true);
    expect(body.observations[0].geographyLabel).toBe("Alameda");
  });

  it("rejects malformed JSON with a failing status", async () => {
    const res = await POST(
      new Request("http://test/api/projections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a v2 body without attempting to interpret it", async () => {
    const { status, body } = await post({
      version: 2,
      module: "projections",
      chartType: "line",
      filters: { subset: "Counties", raceEthnicity: "Hispanic", sex: "Female" },
      period: { startYear: 2020, endYear: 2030 },
    });

    expect(status).toBe(400);
    expect(body.issues).toEqual([
      expect.objectContaining({ code: "unsupportedVersion", level: "blocking" }),
    ]);
  });

  it("does not accept a chart type anywhere in the question", async () => {
    const { status } = await post(
      question({ presentation: { chartType: "line" } }),
    );
    // Extra presentation keys are ignored rather than honoured: nothing about
    // the renderer may reach the data question.
    expect(status).toBe(200);
  });
});
