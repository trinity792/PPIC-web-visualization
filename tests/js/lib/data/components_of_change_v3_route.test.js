/**
 * Workstream C - the v3 POST handler on app/api/components-of-change/route.js,
 * verified end to end against the committed Components of Change CSV.
 *
 * Components of Change is the second first-implementation because it is where
 * units bite: a population stock, component counts, and crude rates live in one
 * module, and the calculation a reader may choose depends on which of the three
 * they picked. It is also the module that proves adapters do not invent their
 * own response shapes - the fields below must match the Projections route
 * exactly, or every renderer downstream needs a per-module branch.
 */

import { describe, expect, it } from "vitest";

import { POST as COMPONENTS_OF_CHANGE_POST } from "@/app/api/components-of-change/route";
import { POST as PROJECTIONS_POST } from "@/app/api/projections/route";
import { validateResponse } from "@/lib/visualization/observationContract";

async function postTo(handler, path, body) {
  const res = await handler(
    new Request(`http://test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

const post = (body) =>
  postTo(COMPONENTS_OF_CHANGE_POST, "/api/components-of-change", body);

const comparison = (id, dimensions = {}) => ({ id, dimensions });

function question(overrides = {}) {
  return {
    version: 3,
    question: {
      dataset: { kind: "module", moduleId: "components-of-change" },
      source: "DoF",
      outcome: { measureId: "Total Population" },
      geography: { subset: "Counties", locations: [] },
      time: { contract: "snapshot" },
      calculation: { id: "actual", params: {} },
      comparisons: [comparison("cmp_all")],
      ...overrides,
    },
  };
}

describe("components-of-change v3 POST", () => {
  it("returns count and rate calculations allowed by their units", async () => {
    const change = await post(
      question({
        outcome: { measureId: "Births" },
        time: { contract: "twoPeriods", startYear: 2015, endYear: 2020 },
        calculation: { id: "percentChange", params: { startYear: 2015, endYear: 2020 } },
      }),
    );
    expect(change.status).toBe(200);
    expect(change.body.observations[0].calculation.id).toBe("percentChange");

    // A crude rate is already per 1,000 people. Percent change of a rate is a
    // number with no readable meaning, so the schema gates it out.
    const invalid = await post(
      question({
        outcome: { measureId: "Crude Birth Rate" },
        time: { contract: "twoPeriods", startYear: 2015, endYear: 2020 },
        calculation: { id: "percentChange", params: { startYear: 2015, endYear: 2020 } },
      }),
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.issues).toEqual([
      expect.objectContaining({ code: "calculationNotAllowedForUnit", level: "blocking" }),
    ]);

    // The same rate takes percentage-point change.
    const points = await post(
      question({
        outcome: { measureId: "Crude Birth Rate" },
        time: { contract: "twoPeriods", startYear: 2015, endYear: 2020 },
        calculation: {
          id: "percentagePointChange",
          params: { startYear: 2015, endYear: 2020 },
        },
      }),
    );
    expect(points.status).toBe(200);
    expect(points.body.observations[0].unit).toBe("percentagePoints");
  });

  it("ranks the displayed calculation on the server", async () => {
    const { status, body } = await post(
      question({
        outcome: { measureId: "Total Population" },
        time: { contract: "twoPeriods", startYear: 2015, endYear: 2020 },
        calculation: {
          id: "percentChange",
          params: { startYear: 2015, endYear: 2020, ranking: { direction: "top", n: 5 } },
        },
      }),
    );

    expect(status).toBe(200);
    expect(body.observations).toHaveLength(5);
    // Top 5 by percent change, not the top 5 counties by population that
    // happen to carry a percent change. The values arrive already ordered, so
    // no client re-sort can disagree with the ranking that chose the five.
    const values = body.observations.map((row) => row.value);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
    for (const row of body.observations) {
      expect(row.calculation.id).toBe("percentChange");
      expect(row.rank).toEqual(expect.any(Number));
    }
  });

  it("keeps an unavailable value out of the ranked marks", async () => {
    const { body } = await post(
      question({
        outcome: { measureId: "Crude Birth Rate" },
        calculation: { id: "actual", params: { ranking: { direction: "bottom", n: 5 } } },
      }),
    );

    for (const row of body.observations) {
      // Nothing unavailable may occupy a ranked slot, in either direction.
      expect(row.status).toBe("available");
      expect(Number.isFinite(row.value)).toBe(true);
    }
  });

  it("returns the same observation fields as Projections", async () => {
    const [coc, projections] = await Promise.all([
      post(question()),
      postTo(PROJECTIONS_POST, "/api/projections", {
        version: 3,
        question: {
          dataset: { kind: "module", moduleId: "projections" },
          source: "DoF P-3",
          outcome: { measureId: "Population" },
          geography: { subset: "Counties", locations: ["San Francisco"] },
          time: { contract: "snapshot" },
          calculation: { id: "actual", params: {} },
          comparisons: [
            {
              id: "cmp_latina",
              dimensions: {
                "Race/Ethnicity": "Hispanic",
                Sex: "Female",
                "Age Group": "All Ages",
              },
            },
          ],
        },
      }),
    ]);

    expect(coc.status).toBe(200);
    expect(projections.status).toBe(200);

    // Adapters resolve field names, sources, geography, and aggregate rules.
    // They do not get to shape the response: one contract, or every renderer
    // grows a per-module branch.
    expect(Object.keys(coc.body).sort()).toEqual(Object.keys(projections.body).sort());
    expect(Object.keys(coc.body.observations[0]).sort()).toEqual(
      Object.keys(projections.body.observations[0]).sort(),
    );
    expect(validateResponse(coc.body).valid).toBe(true);
    expect(validateResponse(projections.body).valid).toBe(true);
  });

  it("returns stable geography ids for a map join", async () => {
    const { body } = await post(question({ geography: { subset: "Counties", locations: [] } }));
    for (const row of body.observations) {
      // A five-digit county GEOID, not a display name: the geometry join
      // happens after the calculation and must not be able to change a value.
      expect(row.geographyId).toMatch(/^\d{5}$/);
      expect(row.geographyLabel).toEqual(expect.any(String));
    }
  });

  it("keeps its two sources apart", async () => {
    const dof = await post(question({ source: "DoF" }));
    const census = await post(question({ source: "Census" }));

    expect(dof.body.observations.every((row) => row.source === "DoF")).toBe(true);
    expect(census.body.observations.every((row) => row.source === "Census")).toBe(true);
  });

  it("rejects an unknown source as a shared blocking issue", async () => {
    const { status, body } = await post(question({ source: "Nowhere" }));
    expect(status).toBe(400);
    expect(body.issues).toEqual([
      expect.objectContaining({ code: "invalidSource", level: "blocking" }),
    ]);
  });
});
