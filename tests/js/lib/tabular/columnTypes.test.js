/**
 * Tests for lib/tabular/columnTypes.js — column type inference and coercion
 * for inline (bring-your-own-data) tables.
 */

import { describe, expect, it } from "vitest";

import {
  COLUMN_TYPES,
  coerceColumn,
  inferColumnType,
  parseDateToken,
  parseNumber,
} from "@/lib/tabular/columnTypes";

describe("parseNumber", () => {
  it("parses en-locale thousands + decimal separators", () => {
    expect(parseNumber("1,234.5")).toBe(1234.5);
  });

  it("parses eu-locale thousands + decimal separators", () => {
    expect(parseNumber("1.234,5", "eu")).toBe(1234.5);
  });

  it("strips a currency symbol", () => {
    expect(parseNumber("$1,200")).toBe(1200);
  });

  it("strips a trailing percent sign without dividing by 100", () => {
    expect(parseNumber("45%")).toBe(45);
  });

  it("handles a leading minus sign", () => {
    expect(parseNumber("-12.5")).toBe(-12.5);
  });

  it("handles accounting-style negative parentheses", () => {
    expect(parseNumber("(12.5)")).toBe(-12.5);
  });

  it("returns null for non-numeric text", () => {
    expect(parseNumber("Fresno County")).toBeNull();
  });

  it("returns null for a blank or missing value", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });
});

describe("parseDateToken", () => {
  it("parses a bare 4-digit year", () => {
    expect(parseDateToken("2020")).toMatchObject({ kind: "year", year: 2020, value: 2020 });
  });

  it("parses a YYYY-MM token", () => {
    const token = parseDateToken("2020-06");
    expect(token.kind).toBe("yearMonth");
    expect(token.year).toBe(2020);
    expect(token.month).toBe(6);
    expect(token.label).toBe("2020-06");
  });

  it("parses an ISO calendar date", () => {
    const token = parseDateToken("2020-06-15");
    expect(token.kind).toBe("iso");
    expect(token.year).toBe(2020);
    expect(token.month).toBe(6);
    expect(token.day).toBe(15);
  });

  it("parses a year-first quarter token", () => {
    expect(parseDateToken("2020 Q1")).toMatchObject({ kind: "quarter", year: 2020, quarter: 1 });
  });

  it("parses a quarter-first token", () => {
    expect(parseDateToken("Q1 2020")).toMatchObject({ kind: "quarter", year: 2020, quarter: 1 });
  });

  it("returns null for text that isn't a date token", () => {
    expect(parseDateToken("Fresno County")).toBeNull();
    expect(parseDateToken("12345")).toBeNull();
  });
});

describe("inferColumnType", () => {
  it("never infers the manual-only group type", () => {
    expect(inferColumnType(["Education", "Occupation"]).type).toBe(COLUMN_TYPES.TEXT);
    expect(inferColumnType(["Education", "Occupation"]).type).not.toBe(COLUMN_TYPES.GROUP);
  });

  it("infers number for currency/percent/thousands-formatted values", () => {
    expect(inferColumnType(["$1,200", "$3,400", "45%"]).type).toBe("number");
  });

  it("infers date for YYYY-MM values (unambiguous — fails number parsing)", () => {
    expect(inferColumnType(["2020-01", "2020-02", "2020-03"]).type).toBe("date");
  });

  it("infers date for quarter tokens", () => {
    expect(inferColumnType(["2020 Q1", "2020 Q2"]).type).toBe("date");
  });

  it("infers text for place names", () => {
    expect(inferColumnType(["Fresno", "Kern", "Alpine"]).type).toBe("text");
  });

  it("resolves a number/date tie to text, never guessing numeric", () => {
    // Bare years parse as BOTH a number and a date token — an intentional tie.
    const result = inferColumnType(["2020", "2021", "2022"]);
    expect(result.type).toBe("text");
  });

  it("treats an empty/blank column as text with zero confidence", () => {
    expect(inferColumnType([])).toEqual({ type: "text", confidence: 0 });
    expect(inferColumnType(["", null, undefined])).toEqual({ type: "text", confidence: 0 });
  });
});

describe("coerceColumn", () => {
  it("coerces a number column, collecting failure row indexes", () => {
    const { values, failures } = coerceColumn(["1", "abc", "3"], "number");
    // A failed coercion becomes null (not the raw string) so a numeric column
    // never carries mixed types downstream; the row index is recorded instead.
    expect(values).toEqual([1, null, 3]);
    expect(failures).toEqual([1]);
  });

  it("coerces blank cells to null without counting them as failures", () => {
    const { values, failures } = coerceColumn(["1", "", "3"], "number");
    expect(values).toEqual([1, null, 3]);
    expect(failures).toEqual([]);
  });

  it("coerces a date column to a sortable numeric value", () => {
    const { values, failures } = coerceColumn(["2020", "not a date"], "date");
    expect(values[0]).toBe(2020);
    expect(failures).toEqual([1]);
  });

  it("never fails to coerce text (anything stringifies)", () => {
    const { values, failures } = coerceColumn(["Fresno", "123", ""], "text");
    expect(values).toEqual(["Fresno", "123", null]);
    expect(failures).toEqual([]);
  });

  it("coerces group columns through the same trimmed-string path as text", () => {
    const { values, failures } = coerceColumn([" Education ", "123", ""], "group");
    expect(values).toEqual(["Education", "123", null]);
    expect(failures).toEqual([]);
  });

  it("respects the eu locale when coercing numbers", () => {
    const { values, failures } = coerceColumn(["1.234,5"], "number", { locale: "eu" });
    expect(values).toEqual([1234.5]);
    expect(failures).toEqual([]);
  });
});
