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
  it("reads short slash years month first by default and honors a chosen order", () => {
    expect(parseDateToken("10/4/26")).toMatchObject({ year: 2026, month: 10, day: 4 });
    expect(parseDateToken("10/4/26", { dateOrder: "dmy" })).toMatchObject({ year: 2026, month: 4, day: 10 });
    expect(parseDateToken("10/4/99")).toMatchObject({ year: 1999, month: 10, day: 4 });
    expect(parseDateToken("10/4/2026")).toMatchObject({ year: 2026, month: 10, day: 4 });
    expect(parseDateToken("31/1/26", { dateOrder: "mdy" })).toBeNull();
    expect(parseDateToken("1/31/26", { dateOrder: "dmy" })).toBeNull();
    expect(parseDateToken("2/29/26")).toBeNull();
    expect(inferColumnType(["10/4/26", "11/5/26"], { columnName: "date" })).toMatchObject({ type: "date", dateOrder: "mdy" });
  });
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
  it("infers group only from an exact Group or Category header", () => {
    expect(inferColumnType(["Education", "Occupation"]).type).toBe(COLUMN_TYPES.TEXT);
    expect(inferColumnType(["Education", "Occupation"]).type).not.toBe(COLUMN_TYPES.GROUP);
    expect(
      inferColumnType(["Education", "Occupation"], { columnName: "Group" }).type,
    ).toBe(COLUMN_TYPES.GROUP);
    expect(
      inferColumnType(["Education", "Occupation"], { columnName: " category " }).type,
    ).toBe(COLUMN_TYPES.GROUP);
    expect(
      inferColumnType(["Education", "Occupation"], { columnName: "Groups" }).type,
    ).toBe(COLUMN_TYPES.TEXT);
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

  it.each(["year", " YEAR ", "Calendar year", "Fiscal Year", "reporting_year", "Time", "Period"])(
    "uses a temporal header to recognize bare years: %s", (columnName) => {
      expect(inferColumnType(["1870", "1871", "2021", "", "n/a"], { columnName }))
        .toMatchObject({ type: "date", granularity: "year", confidence: 1 });
    },
  );

  it("does not treat unrelated four-digit values or invalid year data as dates", () => {
    for (const columnName of ["Code", "Population", "Income per year"]) {
      expect(inferColumnType(["1870", "1871"], { columnName }).type).toBe("text");
    }
    expect(inferColumnType(["12", "34"], { columnName: "Year" }).type).toBe("number");
    expect(inferColumnType(["North", "South"], { columnName: "Year" }).type).toBe("text");
    expect(inferColumnType(["2020", "unknown"], { columnName: "Year" }).type).toBe("text");
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

// Dataset-range plan, workstreams 1–3. Missing exports deliberately fail here
// at assertion time, without blocking the existing column-type tests.
import * as datasetColumnTypes from "@/lib/tabular/columnTypes";
describe("dataset range: column profiles", () => {
  const missing = ["", "n/a", "NA", "-", "–", "—", "..", "...", "null", "none"];
  const suppressed = ["(D)", "(X)", "(S)", "*", "**", "suppressed"];
  it("does not let missing or suppressed tokens decide a column's type", () => {
    const cells = ["12.5", ...missing, ...suppressed];
    expect(inferColumnType(cells)).toMatchObject({ type: "number", confidence: 1 });
    expect(coerceColumn(cells, "number")).toMatchObject({ values: [12.5, ...Array(16).fill(null)], failures: [] });
  });
  it.each([["12.3*", 12.3], ["12.3†", 12.3], ["12.3‡", 12.3], ["12.3 (r)", 12.3], ["−5", -5], ["+5", 5], ["1 234", 1234], ["1\u00a0234", 1234], ["1\u2009234", 1234]])(
    "reads footnote marks, a Unicode minus, and space separators: %s", (raw, value) => expect(parseNumber(raw)).toBe(value),
  );
  it("reports the decorated cells for the Check panel", () => {
    expect(coerceColumn(["12.3*", "4", "5 (r)"], "number")).toMatchObject({ values: [12.3, 4, 5], failures: [], footnotes: [{ row: 0, mark: "*" }, { row: 2, mark: "(r)" }] });
  });
  it("detects the decimal-comma convention per column", () => {
    const profile = inferColumnType(["1.234,5", "2.345,6"]);
    expect(profile).toMatchObject({ type: "number", locale: "eu", decimals: 1 });
    expect(coerceColumn(["1.234,5", "2.345,6"], profile.type, profile).values).toEqual([1234.5, 2345.6]);
    expect(inferColumnType(["1,234.5", "2,345.6"])).toMatchObject({ locale: "en" });
  });
  it.each([
    ["Share", ["45.12%", "54.88%", "20%"], "percent", 2],
    ["Budget", ["$1,200.50", "$2,400.50", "$3,000"], "usd", 2],
    ["Count", ["12", "34", "56.7"], "number", 0],
    ["Percent employed", ["0.4", "0.6"], "percent", 1],
    ["Cost", ["€12", "€34"], "number", 0],
  ])("profiles percent, usd, and plain number columns with their decimals: %s", (columnName, cells, unit, decimals) => {
    expect(inferColumnType(cells, { columnName })).toMatchObject({ type: "number", unit, decimals });
  });
  it.each(["% employed", "Percent employed", "pct employed", "Employment share"])("detects a percent header: %s", columnName => {
    expect(inferColumnType(["12", "34"], { columnName }).unit).toBe("percent");
  });
  it("requires 80 percent of filled cells to carry the unit symbol", () => {
    expect(inferColumnType(["1%", "2%", "3%", "4%", "5", ""]).unit).toBe("percent");
    expect(inferColumnType(["1%", "2%", "3%", "4", "5"]).unit).toBe("number");
  });
  it.each([{ rows: [["40", "60"], ["20", "80"]] }, { rows: [["0.4", "0.6"], ["0.2", "0.8"]] }])("detects rows that add up to 100 or to 1: $rows", ({ rows }) => {
    expect(datasetColumnTypes.rowShares({ columns: [{ name: "Yes" }, { name: "No" }], rows }, ["Yes", "No"])).toBe(true);
  });
  it("requires 90 percent share rows and respects the sum tolerance", () => {
    const table = rows => ({ columns: [{ name: "A" }, { name: "B" }], rows });
    const good = Array.from({ length: 9 }, () => ["40", "61.4"]);
    expect(datasetColumnTypes.rowShares(table([...good, ["1", "2"]]), ["A", "B"])).toBe(true);
    expect(datasetColumnTypes.rowShares(table([...good.slice(1), ["1", "2"], ["3", "4"]]), ["A", "B"])).toBe(false);
    expect(datasetColumnTypes.rowShares(table([["40", "62"]]), ["A", "B"])).toBe(false);
    expect(datasetColumnTypes.rowShares(table([]), ["A", "B"])).toBe(false);
  });
  it.each([
    ["Jan 2020", 2020, "month"], ["January 2020", 2020, "month"], ["2020 Jan", 2020, "month"],
    ["2020 January", 2020, "month"], ["2020/01", 2020, "month"],
    ["1/31/2020", 2020 + 30 / 366, "day"], ["31/01/2020", 2020 + 30 / 366, "day"],
    ["2019-20", 2019.5, "span"], ["2019-2020", 2019.5, "span"], ["FY 2019-20", 2019.5, "span"],
    // A bare FY names its ending year, following the July-to-June span convention.
    ["FY2020", 2019.5, "span"],
    ["2020", 2020, "year"], ["2020-07", 2020.5, "month"], ["2020 Q3", 2020.5, "quarter"],
    ["2020-02-29", 2020 + 59 / 366, "day"],
  ])("reads month names, slash dates, and fiscal and school years: %s", (raw, position, granularity) => {
    const result = parseDateToken(raw);
    expect(result).not.toBeNull();
    expect(result.position).toBeCloseTo(position, 8);
    expect(result.granularity).toBe(granularity);
  });
  it("gives every date a decimal-year position and a granularity", () => {
    expect(inferColumnType(["Jan 2020", "2020 Q2", "2020-07-04"])).toMatchObject({ type: "date", granularity: "day" });
  });
  it("decides day/month order per column and reports an ambiguous column", () => {
    const dayFirst = inferColumnType(["03/04/2020", "31/05/2020"]);
    expect(dayFirst).toMatchObject({ type: "date", dateOrder: "dmy" });
    expect(parseDateToken("03/04/2020", dayFirst)).toMatchObject({ month: 4, day: 3 });
    expect(inferColumnType(["03/04/2020", "05/31/2020"])).toMatchObject({ dateOrder: "mdy" });
    const ambiguous = inferColumnType(["03/04/2020", "05/06/2020"]);
    expect(ambiguous.dateOrder).toBe("mdy");
    expect(ambiguous.findings).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringMatching(/month.*day/i) })]));
  });
});
