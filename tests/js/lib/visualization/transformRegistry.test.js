/**
 * Tests for lib/visualization/transformRegistry.js — the pure series
 * transforms and their field gating (guardrail #4).
 */

import { describe, expect, it } from "vitest";

import {
  TRANSFORMS,
  applyTransform,
  isTransformAllowed,
} from "@/lib/visualization/transformRegistry";

const series = (values, years = values.map((_, i) => 2020 + i)) => ({
  location: "Testville",
  years,
  values,
});

const countField = {
  kind: "measure",
  unit: "people",
  transforms: ["actual", "indexed", "numericChange", "percentChange"],
};
const rateField = {
  kind: "measure",
  unit: "percent",
  transforms: ["actual", "percentagePointChange"],
};

describe("TRANSFORMS.actual", () => {
  it("returns the input unchanged", () => {
    const input = series([1, 2, 3]);
    expect(TRANSFORMS.actual(input)).toBe(input);
  });
});

describe("TRANSFORMS.indexed", () => {
  it("indexes every value to 100 at the base year", () => {
    const out = TRANSFORMS.indexed(series([50, 100, 150]), { baseYear: 2020 });
    expect(out.values).toEqual([100, 200, 300]);
  });

  it("falls back to the first non-null value when the base year is missing", () => {
    const out = TRANSFORMS.indexed(series([null, 100, 150]), { baseYear: 1900 });
    expect(out.values).toEqual([null, 100, 150]);
  });

  it("preserves nulls instead of coercing them to zero", () => {
    const out = TRANSFORMS.indexed(series([100, null, 150]), { baseYear: 2020 });
    expect(out.values).toEqual([100, null, 150]);
  });

  it("does not mutate the input series", () => {
    const input = series([100, 200]);
    TRANSFORMS.indexed(input, { baseYear: 2020 });
    expect(input.values).toEqual([100, 200]);
  });
});

describe("TRANSFORMS.numericChange", () => {
  it("subtracts the base-year value from every value", () => {
    const out = TRANSFORMS.numericChange(series([100, 130, 90]), { baseYear: 2020 });
    expect(out.values).toEqual([0, 30, -10]);
  });
});

describe("TRANSFORMS.percentChange", () => {
  it("computes percent change from the base-year value", () => {
    const out = TRANSFORMS.percentChange(series([100, 150, 50]), { baseYear: 2020 });
    expect(out.values).toEqual([0, 50, -50]);
  });
});

describe("TRANSFORMS.percentagePointChange", () => {
  it("subtracts the base value (point difference, not ratio)", () => {
    const out = TRANSFORMS.percentagePointChange(series([5.0, 7.5]), { baseYear: 2020 });
    expect(out.values).toEqual([0, 2.5]);
  });
});

describe("TRANSFORMS.differenceFromBenchmark", () => {
  it("subtracts the benchmark value aligned by year", () => {
    const benchmark = { years: [2020, 2021, 2022], values: [10, 20, 30] };
    const out = TRANSFORMS.differenceFromBenchmark(series([15, 25, 25]), { benchmark });
    expect(out.values).toEqual([5, 5, -5]);
  });

  it("returns null where either side is missing", () => {
    const benchmark = { years: [2020, 2021], values: [10, null] };
    const out = TRANSFORMS.differenceFromBenchmark(series([15, 25]), { benchmark });
    expect(out.values).toEqual([5, null]);
  });

  it("returns the series unchanged when no benchmark is provided", () => {
    const input = series([1, 2]);
    expect(TRANSFORMS.differenceFromBenchmark(input, {})).toBe(input);
  });
});

describe("isTransformAllowed", () => {
  it("permits a transform the field catalog declares", () => {
    expect(isTransformAllowed(countField, "percentChange")).toBe(true);
  });

  it("blocks percent change on a rate field (guardrail #4)", () => {
    expect(isTransformAllowed(rateField, "percentChange")).toBe(false);
    expect(isTransformAllowed(rateField, "percentagePointChange")).toBe(true);
  });

  it("only allows actual when a field declares no transforms", () => {
    expect(isTransformAllowed({ kind: "measure" }, "actual")).toBe(true);
    expect(isTransformAllowed({ kind: "measure" }, "indexed")).toBe(false);
  });
});

describe("applyTransform", () => {
  it("applies an allowed transform across every series", () => {
    const { series: out, applied, blocked } = applyTransform(
      "numericChange",
      [series([100, 130]), series([10, 5])],
      countField,
      { baseYear: 2020 },
    );
    expect(blocked).toBe(false);
    expect(applied).toBe("numericChange");
    expect(out[0].values).toEqual([0, 30]);
    expect(out[1].values).toEqual([0, -5]);
  });

  it("falls back to actual with blocked=true for a disallowed transform", () => {
    const input = [series([5, 6])];
    const { series: out, applied, blocked } = applyTransform(
      "percentChange",
      input,
      rateField,
      { baseYear: 2020 },
    );
    expect(blocked).toBe(true);
    expect(applied).toBe("actual");
    expect(out).toBe(input);
  });

  it("falls back to actual with blocked=true for an unknown transform id", () => {
    const { applied, blocked } = applyTransform("noSuchTransform", [series([1])], countField);
    expect(blocked).toBe(true);
    expect(applied).toBe("actual");
  });
});
