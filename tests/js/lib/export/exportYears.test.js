/**
 * Tests for lib/export/exportYears.js — finding an export table's year column,
 * listing its years, and cutting the table down to the years a reader picked.
 */

import { describe, expect, it } from "vitest";

import {
  filterTableByYears,
  tableYears,
  temporalColumnNames,
  yearColumnIndex,
  yearOf,
} from "@/lib/export/exportYears";

const yearTable = {
  filename: "widgets-line.csv",
  columns: [{ name: "Location" }, { name: "Year" }, { name: "Value" }],
  rows: [
    ["Alameda", 2018, 1],
    ["Alameda", 2019, 2],
    ["Alameda", 2020, 3],
    ["Fresno", 2020, 4],
  ],
};

describe("yearOf", () => {
  it("reads integer years and strings that start with a year", () => {
    expect(yearOf(2020)).toBe(2020);
    expect(yearOf("2020")).toBe(2020);
    expect(yearOf("2010-01")).toBe(2010);
    expect(yearOf("2026-07-15 12:00:00")).toBe(2026);
  });

  it("rejects values that are not a year", () => {
    expect(yearOf(null)).toBeNull();
    expect(yearOf("")).toBeNull();
    expect(yearOf(12.5)).toBeNull();
    expect(yearOf(150000)).toBeNull();
    expect(yearOf("10/15/2013 - 10/15/2021")).toBeNull();
    expect(yearOf("20201")).toBeNull();
  });
});

describe("temporalColumnNames", () => {
  it("lists temporal fields, then the schema's named time column", () => {
    expect(
      temporalColumnNames({
        fields: { Year: { kind: "temporal" }, Total: { kind: "measure" } },
      }),
    ).toEqual(["Year"]);
    expect(temporalColumnNames({ fields: {}, temporalColumn: "Date" })).toEqual(["Date"]);
    expect(temporalColumnNames({ fields: {}, temporalField: "Snapshot Date" })).toEqual([
      "Snapshot Date",
    ]);
    expect(temporalColumnNames(null)).toEqual([]);
  });
});

describe("yearColumnIndex", () => {
  it("prefers the module's own time column over the shared fallbacks", () => {
    const table = {
      columns: [{ name: "Planning Period Start" }, { name: "Snapshot Date" }],
      rows: [["2013-10-15", "2026-07-15"]],
    };
    expect(yearColumnIndex(table, ["Snapshot Date"])).toBe(1);
  });

  it("matches names regardless of case and falls back to year-like names", () => {
    expect(
      yearColumnIndex({ columns: [{ name: "period" }], rows: [["2020"]] }),
    ).toBe(0);
    expect(
      yearColumnIndex({
        columns: [{ name: "City" }, { name: "Survey year" }],
        rows: [["Fresno", 2021]],
      }),
    ).toBe(1);
  });

  it("skips a year-named column whose values are not years", () => {
    const table = {
      columns: [{ name: "Planning Period" }, { name: "Year" }],
      rows: [["10/15/2013 - 10/15/2021", 2020]],
    };
    expect(yearColumnIndex(table)).toBe(1);
    expect(
      yearColumnIndex({ columns: [{ name: "Year" }], rows: [["n/a"]] }),
    ).toBe(-1);
  });

  it("returns -1 when there is no year column", () => {
    expect(
      yearColumnIndex({ columns: [{ name: "Location" }], rows: [["Alameda"]] }),
    ).toBe(-1);
    expect(yearColumnIndex(null)).toBe(-1);
  });
});

describe("tableYears", () => {
  it("lists distinct years oldest first", () => {
    expect(tableYears(yearTable)).toEqual([2018, 2019, 2020]);
  });

  it("collapses monthly dates into calendar years", () => {
    const monthly = {
      columns: [{ name: "Date" }, { name: "Total" }],
      rows: [["2011-02", 5], ["2010-12", 4], ["2010-01", 3]],
    };
    expect(tableYears(monthly)).toEqual([2010, 2011]);
  });

  it("is empty when the table has no year column", () => {
    expect(tableYears({ columns: [{ name: "Location" }], rows: [["Alameda"]] })).toEqual([]);
  });
});

describe("filterTableByYears", () => {
  it("keeps only rows in the chosen years", () => {
    const narrowed = filterTableByYears(yearTable, [2018, 2020]);
    expect(narrowed.rows).toEqual([
      ["Alameda", 2018, 1],
      ["Alameda", 2020, 3],
      ["Fresno", 2020, 4],
    ]);
    expect(narrowed.columns).toBe(yearTable.columns);
    expect(narrowed.filename).toBe("widgets-line.csv");
    // The source table (possibly cached) is not mutated.
    expect(yearTable.rows).toHaveLength(4);
  });

  it("filters exportRows in step with rows", () => {
    const table = {
      columns: [{ name: "Period" }, { name: "Value" }],
      rows: [["2019", "Not available"], ["2020", 10]],
      exportRows: [["2019", null], ["2020", 10]],
    };
    const narrowed = filterTableByYears(table, [2019]);
    expect(narrowed.rows).toEqual([["2019", "Not available"]]);
    expect(narrowed.exportRows).toEqual([["2019", null]]);
  });

  it("returns the table untouched for every year or no year column", () => {
    expect(filterTableByYears(yearTable, null)).toBe(yearTable);
    const noYears = { columns: [{ name: "Location" }], rows: [["Alameda"]] };
    expect(filterTableByYears(noYears, [2020])).toBe(noYears);
    expect(filterTableByYears(null, [2020])).toBeNull();
  });

  it("drops rows whose year cell is empty when years are chosen", () => {
    const table = {
      columns: [{ name: "Year" }, { name: "Value" }],
      rows: [[2020, 1], [null, 2]],
    };
    expect(filterTableByYears(table, [2020]).rows).toEqual([[2020, 1]]);
  });
});
