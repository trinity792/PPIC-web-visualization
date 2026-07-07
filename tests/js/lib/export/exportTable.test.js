/**
 * Tests for lib/export/exportTable.js - Phase 5's canonical displayed-data
 * export path. These are acceptance tests for the pending export phase: the
 * CSV/XLSX export, generated R/Stata code, and chart data must all share the
 * exact same table object.
 */

import { describe, expect, it, vi } from "vitest";

import {
  copyText,
  displayTable,
  toCsv,
  toXlsxBlob,
} from "@/lib/export/exportTable";
import { toRCode } from "@/lib/visualization/codebridge/toRCode";
import { toStataCode } from "@/lib/visualization/codebridge/toStataCode";

const baseSpec = {
  version: 2,
  module: "widgets",
  data: { source: "module" },
  filters: {},
  period: {},
  transform: "actual",
  comparisonMode: "places",
  labels: {},
  format: {},
  appearance: {},
  annotations: [],
  layers: [],
  referenceLines: [],
  tier: "moderate",
};

describe("displayTable", () => {
  it("flattens a line chart result into the canonical export/codebridge table", () => {
    const spec = {
      ...baseSpec,
      chartType: "line",
      bindings: { x: "Year", y: "Total Widgets", series: "Location" },
    };
    const loaded = {
      series: [
        { location: "Alameda", years: [2020, 2021], values: [100, 110] },
        { location: "Butte", years: [2020, 2021], values: [50, null] },
      ],
    };

    expect(displayTable(spec, loaded)).toEqual({
      filename: "widgets-line.csv",
      columns: [
        { name: "Location", type: "text" },
        { name: "Year", type: "number" },
        { name: "Total Widgets", type: "number" },
      ],
      rows: [
        ["Alameda", 2020, 100],
        ["Alameda", 2021, 110],
        ["Butte", 2020, 50],
        ["Butte", 2021, null],
      ],
    });
  });

  it("flattens a category/bar result with groups when the chart shows grouped values", () => {
    const spec = {
      ...baseSpec,
      chartType: "bar",
      bindings: { category: "Location", y: "Total Widgets", group: "Tenure" },
    };
    const loaded = {
      records: [
        { category: "Alameda", group: "Owners", value: 100 },
        { category: "Alameda", group: "Renters", value: 80 },
        { category: "Butte", group: "Owners", value: 50 },
      ],
    };

    expect(displayTable(spec, loaded)).toEqual({
      filename: "widgets-bar.csv",
      columns: [
        { name: "Location", type: "text" },
        { name: "Tenure", type: "text" },
        { name: "Total Widgets", type: "number" },
      ],
      rows: [
        ["Alameda", "Owners", 100],
        ["Alameda", "Renters", 80],
        ["Butte", "Owners", 50],
      ],
    });
  });

  it("returns the same table object consumed by R/Stata code generation", () => {
    const spec = {
      ...baseSpec,
      chartType: "scatter",
      bindings: { unit: "Location", x: "Income", y: "Rent" },
    };
    const loaded = {
      records: [
        { location: "Alameda", x: 90000, y: 2200 },
        { location: "Butte", x: 54000, y: 1200 },
      ],
    };

    const table = displayTable(spec, loaded);
    expect(toCsv(table)).toBe(
      "Location,Income,Rent\r\n" +
        "Alameda,90000,2200\r\n" +
        "Butte,54000,1200\r\n",
    );
    expect(toRCode(spec, table).code).toContain(`read_csv("${table.filename}")`);
    expect(toStataCode(spec, table).code).toContain(
      `import delimited "${table.filename}", clear`,
    );
  });
});

describe("toCsv", () => {
  it("writes RFC-4180 CSV with CRLF rows and escaped quotes, commas, and newlines", () => {
    const table = {
      columns: [{ name: "Name" }, { name: "Value" }, { name: "Note" }],
      rows: [
        ["Alameda", 100, "plain"],
        ["A, B", null, "line\nbreak"],
        ['Quote "me"', 0, ""],
      ],
    };

    expect(toCsv(table)).toBe(
      "Name,Value,Note\r\n" +
        "Alameda,100,plain\r\n" +
        '"A, B",,"line\nbreak"\r\n' +
        '"Quote ""me""",0,\r\n',
    );
  });
});

describe("toXlsxBlob", () => {
  it("writes a one-sheet workbook that round-trips through ExcelJS", async () => {
    const table = {
      columns: [{ name: "Location" }, { name: "Total Widgets" }],
      rows: [
        ["Alameda", 100],
        ["Butte", 50],
      ],
    };

    const blob = await toXlsxBlob(table);
    expect(blob).toBeInstanceOf(Blob);

    const ExcelJSModule = await import("exceljs");
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const sheet = workbook.getWorksheet(1);

    expect(sheet.getRow(1).values.slice(1)).toEqual(["Location", "Total Widgets"]);
    expect(sheet.getRow(2).values.slice(1)).toEqual(["Alameda", 100]);
    expect(sheet.getRow(3).values.slice(1)).toEqual(["Butte", 50]);
  });
});

describe("copyText", () => {
  it("uses the browser clipboard and returns a resolved promise on success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    await expect(copyText("exported config")).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledWith("exported config");
  });
});
