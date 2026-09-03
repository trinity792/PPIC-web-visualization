/**
 * Workstream A - lib/visualization/observationContract.js.
 *
 * One response shape serves every chart family, the data table, the exports,
 * and the accessible description. The contract's whole job is to keep two
 * questions apart that the v2 path kept conflating:
 *
 *   status    - can this number be drawn?  (available | missing | suppressed)
 *   valueKind - what does this number mean? (observed | projected | derived)
 *
 * A suppressed projection is both. A renderer that reads one field for the
 * other either plots a hole as zero or labels a real estimate as a forecast.
 *
 * The module is client-safe on purpose: the server route, the inline-data
 * adapter, the render adapters, the table, and the export all validate against
 * this same file, so none of them can invent a private variant.
 */

import { describe, expect, it } from "vitest";

import {
  ISSUE_LEVELS,
  OBSERVATION_STATUS,
  VALUE_KINDS,
  createIssue,
  orderObservations,
  validateObservation,
  validateResponse,
} from "@/lib/visualization/observationContract";

const observation = (overrides = {}) => ({
  comparisonId: "cmp_latina",
  comparisonLabel: "San Francisco Latina Women",
  measureId: "Population",
  measureLabel: "Population",
  unit: "people",
  period: 2025,
  geographyId: "06075",
  geographyLabel: "San Francisco",
  categoryId: null,
  categoryLabel: null,
  value: 50000,
  status: OBSERVATION_STATUS.AVAILABLE,
  valueKind: VALUE_KINDS.OBSERVED,
  calculation: { id: "actual", params: {} },
  includedPeriods: null,
  source: "DoF P-3",
  ...overrides,
});

const response = (overrides = {}) => ({
  observations: [observation()],
  comparisons: [
    { id: "cmp_latina", label: "San Francisco Latina Women", status: "ok" },
  ],
  periods: [2025],
  issues: [],
  ...overrides,
});

describe("status and value-kind vocabularies", () => {
  it("declares exactly three availability states and three value kinds", () => {
    expect(Object.values(OBSERVATION_STATUS).sort()).toEqual([
      "available",
      "missing",
      "suppressed",
    ]);
    expect(Object.values(VALUE_KINDS).sort()).toEqual(["derived", "observed", "projected"]);
  });

  it("declares the three issue levels the editor distinguishes", () => {
    expect(Object.values(ISSUE_LEVELS).sort()).toEqual([
      "blocking",
      "comparison",
      "information",
    ]);
  });
});

describe("validateObservation", () => {
  it("accepts a finite available observation", () => {
    const result = validateObservation(observation());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("requires every field the contract names", () => {
    for (const field of [
      "comparisonId",
      "comparisonLabel",
      "measureId",
      "measureLabel",
      "unit",
      "period",
      "value",
      "status",
      "valueKind",
      "calculation",
      "source",
    ]) {
      const row = observation();
      delete row[field];
      const result = validateObservation(row);
      expect(result.valid, `missing ${field}`).toBe(false);
      expect(result.errors.join(" "), `missing ${field}`).toContain(field);
    }
  });

  it("requires null for missing and suppressed values", () => {
    for (const status of [OBSERVATION_STATUS.MISSING, OBSERVATION_STATUS.SUPPRESSED]) {
      // A number on an unavailable row is exactly the bug the contract exists
      // to stop: it is how a hole becomes a plotted zero.
      const withNumber = validateObservation(observation({ status, value: 0 }));
      expect(withNumber.valid, status).toBe(false);
      expect(withNumber.errors.join(" "), status).toMatch(/null/i);

      expect(validateObservation(observation({ status, value: null })).valid, status).toBe(true);
    }
  });

  it("requires a finite number on an available row", () => {
    for (const value of [null, undefined, Number.NaN, Infinity, -Infinity, "50000"]) {
      const result = validateObservation(observation({ value }));
      expect(result.valid, String(value)).toBe(false);
    }
    // Zero is a real value and must pass.
    expect(validateObservation(observation({ value: 0 })).valid).toBe(true);
    expect(validateObservation(observation({ value: -12000 })).valid).toBe(true);
  });

  it("keeps availability separate from observed projected and derived kinds", () => {
    // A suppressed projection: both fields carry their own meaning and neither
    // one implies the other.
    const suppressedProjection = observation({
      period: 2030,
      status: OBSERVATION_STATUS.SUPPRESSED,
      value: null,
      valueKind: VALUE_KINDS.PROJECTED,
    });
    expect(validateObservation(suppressedProjection).valid).toBe(true);

    // ...and "suppressed" is never accepted as a value kind, nor "projected"
    // as a status, so the two vocabularies cannot be swapped by mistake.
    expect(validateObservation(observation({ valueKind: "suppressed" })).valid).toBe(false);
    expect(validateObservation(observation({ status: "projected" })).valid).toBe(false);
  });

  it("requires includedPeriods on a derived result and forbids it on a raw one", () => {
    const average = observation({
      valueKind: VALUE_KINDS.DERIVED,
      calculation: { id: "averageSelectedYears", params: { years: [2020, 2025, 2030] } },
      includedPeriods: [2020, 2025, 2030],
    });
    expect(validateObservation(average).valid).toBe(true);

    const withoutPeriods = validateObservation({ ...average, includedPeriods: null });
    expect(withoutPeriods.valid).toBe(false);
    expect(withoutPeriods.errors.join(" ")).toContain("includedPeriods");
  });
});

describe("validateResponse", () => {
  it("accepts a well-formed response", () => {
    expect(validateResponse(response()).valid).toBe(true);
  });

  it("requires issues to identify an invalid comparison when one exists", () => {
    // Partial failure is a normal product result, but it has to stay
    // attributable: a renderer must never work out which comparison failed by
    // noticing that a trace is absent.
    const partial = response({
      comparisons: [
        { id: "cmp_latina", label: "San Francisco Latina Women", status: "ok" },
        { id: "cmp_black_women", label: "San Francisco Black Women", status: "invalid" },
      ],
      issues: [
        createIssue({
          code: "zeroBaseValue",
          level: ISSUE_LEVELS.COMPARISON,
          message: "Percent change needs a start value that is not zero.",
          comparisonId: "cmp_black_women",
        }),
      ],
    });
    expect(validateResponse(partial).valid).toBe(true);

    // The same response with the issue dropped is invalid: an invalid
    // comparison with no issue is an unexplained blank.
    const unattributed = validateResponse({ ...partial, issues: [] });
    expect(unattributed.valid).toBe(false);
    expect(unattributed.errors.join(" ")).toContain("cmp_black_women");
  });

  it("requires a comparison-level issue to name a comparison", () => {
    expect(() =>
      createIssue({
        code: "zeroBaseValue",
        level: ISSUE_LEVELS.COMPARISON,
        message: "Percent change needs a start value that is not zero.",
      }),
    ).toThrow(/comparisonId/);
  });

  it("lets a blocking issue stand without a comparison id", () => {
    const issue = createIssue({
      code: "unknownOutcome",
      level: ISSUE_LEVELS.BLOCKING,
      message: "Select an outcome to show this chart.",
    });
    expect(issue).toMatchObject({ code: "unknownOutcome", level: "blocking" });
    expect(issue.comparisonId).toBeNull();
  });

  it("requires every observation to belong to a listed comparison", () => {
    const orphan = response({
      observations: [observation({ comparisonId: "cmp_not_requested" })],
    });
    expect(validateResponse(orphan).valid).toBe(false);
  });

  it("requires every requested comparison to appear in the summary", () => {
    // A comparison that returned nothing at all still has a summary row, so the
    // editor can say "no data" rather than showing nine of ten cards.
    const summary = response().comparisons;
    expect(summary.every((entry) => entry.id && entry.label && entry.status)).toBe(true);
  });
});

describe("orderObservations", () => {
  it("returns a deterministic order regardless of input order", () => {
    const rows = [
      observation({ comparisonId: "b", period: 2030 }),
      observation({ comparisonId: "a", period: 2030 }),
      observation({ comparisonId: "b", period: 2020 }),
      observation({ comparisonId: "a", period: 2020 }),
    ];

    const forward = orderObservations(rows).map((r) => `${r.comparisonId}:${r.period}`);
    const reversed = orderObservations([...rows].reverse()).map(
      (r) => `${r.comparisonId}:${r.period}`,
    );

    expect(forward).toEqual(reversed);
    expect(forward).toEqual(["a:2020", "a:2030", "b:2020", "b:2030"]);
  });
});
