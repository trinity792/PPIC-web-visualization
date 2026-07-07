/**
 * Tests for lib/data/apiParams.js — shared query-param parsing for the
 * visualization API routes.
 */

import { describe, expect, it } from "vitest";

import {
  integerParam,
  listParam,
  periodParam,
} from "@/lib/data/apiParams";

const params = (query) => new URLSearchParams(query);

describe("integerParam", () => {
  it("parses a valid integer", () => {
    expect(integerParam(params({ year: "2020" }), "year")).toBe(2020);
  });

  it("returns null when absent or non-numeric", () => {
    expect(integerParam(params({}), "year")).toBeNull();
    expect(integerParam(params({ year: "not-a-year" }), "year")).toBeNull();
  });
});

describe("listParam", () => {
  it("splits and trims a comma-separated list", () => {
    expect(listParam(params({ locations: "Alameda, Butte ,Colusa" }), "locations")).toEqual([
      "Alameda",
      "Butte",
      "Colusa",
    ]);
  });

  it("returns null when absent", () => {
    expect(listParam(params({}), "locations")).toBeNull();
  });
});

describe("periodParam", () => {
  it("returns null when the param is absent", () => {
    expect(periodParam(params({}), "period")).toBeNull();
  });

  it("parses a bare year", () => {
    expect(periodParam(params({ period: "2020" }), "period")).toEqual({
      year: 2020,
      month: null,
    });
  });

  it("parses an explicit YYYY-MM month", () => {
    expect(periodParam(params({ period: "2020-06" }), "period")).toEqual({
      year: 2020,
      month: "2020-06",
    });
  });

  it("returns undefined for a malformed value (bad-format signal)", () => {
    expect(periodParam(params({ period: "June 2020" }), "period")).toBeUndefined();
    expect(periodParam(params({ period: "20-06" }), "period")).toBeUndefined();
  });
});

