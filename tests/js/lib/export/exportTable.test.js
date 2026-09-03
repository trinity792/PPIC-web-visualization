/**
 * Tests for lib/export/exportTable.js - the canonical displayed-data export
 * path. The CSV/XLSX export and the chart data share the exact same table
 * object. The R/Stata generators read it too until they were deleted
 * 2026-08-03; see .trash/code-editor.md.
 */

import { describe, expect, it, vi } from "vitest";

import {
  copyText,
  displayTable,
  originalTable,
  tablesToXlsxBlob,
  toCsv,
  toXlsxBlob,
} from "@/lib/export/exportTable";

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
};

describe("displayTable", () => {
  it("flattens a line chart result into the canonical export table", () => {
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

  it("keeps group columns in range and matrix exports", () => {
    const range = displayTable(
      {
        ...baseSpec,
        chartType: "dumbbell",
        bindings: {
          category: "Location",
          group: "Region",
          start: "Start",
          end: "End",
        },
      },
      {
        records: [
          { category: "Alpha", group: "North", start: 10, end: 20 },
        ],
      },
    );
    expect(range.columns.map((column) => column.name)).toEqual([
      "Location",
      "Region",
      "Start",
      "End",
    ]);
    expect(range.rows).toEqual([["Alpha", "North", 10, 20]]);

    const matrix = displayTable(
      {
        ...baseSpec,
        chartType: "dotPlot",
        bindings: { y: "Location", group: "Region", x: "Year", color: "Value" },
      },
      {
        series: {
          x: [2025],
          y: ["Alpha", "Bravo"],
          z: [[10], [20]],
          groups: ["North", "South"],
        },
      },
    );
    expect(matrix.columns.map((column) => column.name)).toEqual([
      "Location",
      "Region",
      "Year",
      "Value",
    ]);
    expect(matrix.rows).toEqual([
      ["Alpha", "North", 2025, 10],
      ["Bravo", "South", 2025, 20],
    ]);
  });

  it("returns a table whose headers and rows survive CSV serialization", () => {
    // This case also pinned the R/Stata generators, which read the same table
    // and its filename. They were deleted 2026-08-03 (see .trash/code-editor.md);
    // the CSV half is the contract that remains.
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
    expect(table.filename).toMatch(/\.csv$/);
  });
});

describe("originalTable", () => {
  it("reconstructs a source-style table from module line responses", () => {
    const spec = {
      ...baseSpec,
      chartType: "line",
      bindings: { x: "Year", y: "Total Widgets", series: "Location" },
    };
    const loaded = {
      response: {
        view: "line",
        parameter: "Total Widgets",
        subset: "Counties",
        source: "Census",
        series: [
          { location: "Alameda", years: [2020, 2021], values: [100, 110] },
          { location: "Butte", years: [2020, 2021], values: [50, null] },
        ],
      },
    };

    expect(originalTable(spec, loaded)).toEqual({
      filename: "original-data.csv",
      columns: [
        { name: "Subset", type: "text" },
        { name: "Source", type: "text" },
        { name: "Location", type: "text" },
        { name: "Period", type: "number" },
        { name: "Total Widgets", type: "number" },
      ],
      rows: [
        ["Counties", "Census", "Alameda", 2020, 100],
        ["Counties", "Census", "Alameda", 2021, 110],
        ["Counties", "Census", "Butte", 2020, 50],
        ["Counties", "Census", "Butte", 2021, null],
      ],
    });
  });

  it("returns the full imported table for bring-your-own-data configs", () => {
    const spec = {
      ...baseSpec,
      data: {
        source: "inline",
        inline: {
          columns: [
            { name: "Location", type: "text" },
            { name: "Population", type: "number" },
            { name: "Note", type: "text" },
          ],
          rows: [["Alameda", 100, "A"]],
        },
      },
    };

    expect(originalTable(spec, {})).toEqual({
      filename: "original-data.csv",
      columns: [
        { name: "Location", type: "text" },
        { name: "Population", type: "number" },
        { name: "Note", type: "text" },
      ],
      rows: [["Alameda", 100, "A"]],
    });
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

describe("tablesToXlsxBlob", () => {
  it("writes one worksheet per chart with sanitized, de-duplicated names", async () => {
    const table = {
      columns: [{ name: "Location" }, { name: "Value" }],
      rows: [["Alameda", 100]],
    };
    // Illegal Excel chars ([ ] : etc.) and a duplicate name after sanitizing.
    const blob = await tablesToXlsxBlob([
      { name: "By [County]", table },
      { name: "By  County ", table },
    ]);
    expect(blob).toBeInstanceOf(Blob);

    const ExcelJSModule = await import("exceljs");
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());

    const names = workbook.worksheets.map((sheet) => sheet.name);
    expect(names).toHaveLength(2);
    expect(names[0]).toBe("By  County");
    // Second sheet collides, so it is suffixed to stay unique.
    expect(names[1]).not.toBe(names[0]);
    expect(workbook.getWorksheet(1).getRow(2).values.slice(1)).toEqual([
      "Alameda",
      100,
    ]);
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

/**
 * Workstream E - one table object behind the chart, the Data view, the CSV, and
 * the XLSX.
 *
 * Three things the v2 export could not say, and now must:
 *   - the difference between "we have no value" and "the source withheld it";
 *   - what a derived number is derived from;
 *   - every comparison, not just the one whose tab happens to be open.
 *
 * A reader who downloads the data and finds only the visible tab has been given
 * a subset of their own chart without being told.
 */
const exportModule = () => import("@/lib/export/exportTable");

const COMPARISONS = [
  { id: "cmp_latina", label: "San Francisco Latina Women" },
  { id: "cmp_white_women", label: "San Francisco White Women" },
];

const obs = (overrides = {}) => ({
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
  status: "available",
  valueKind: "observed",
  calculation: { id: "actual", params: {} },
  includedPeriods: null,
  source: "DoF P-3",
  ...overrides,
});

describe("Workstream E observation exports", () => {
  it("shows Not available and Suppressed without numeric values", async () => {
    const { displayTableFromObservations, toCsv } = await exportModule();

    const table = displayTableFromObservations({
      observations: [
        obs({ value: 50000 }),
        obs({ period: 2030, value: null, status: "missing" }),
        obs({
          comparisonId: "cmp_white_women",
          comparisonLabel: "San Francisco White Women",
          value: null,
          status: "suppressed",
        }),
      ],
      comparisons: COMPARISONS,
    });

    const statusColumn = table.columns.findIndex((column) => column.name === "Status");
    const valueColumn = table.columns.findIndex((column) => column.name === "Population");
    expect(statusColumn).toBeGreaterThan(-1);

    // The reader-facing words, spelled the same way everywhere.
    expect(table.rows[1][valueColumn]).toBe("Not available");
    expect(table.rows[2][valueColumn]).toBe("Suppressed");

    const csv = toCsv(table);
    const lines = csv.trim().split("\n");
    // In a file, the numeric cell is empty and the status travels in its own
    // column: "Not available" in a number column breaks every spreadsheet that
    // opens it.
    expect(lines[2].split(",")[valueColumn]).toBe("");
    expect(lines[2].split(",")[statusColumn]).toBe("missing");
    expect(lines[3].split(",")[statusColumn]).toBe("suppressed");
    expect(csv).not.toMatch(/(^|,)0(,|$)/m);
  });

  it("exports every comparison when one tab is active", async () => {
    const { displayTableFromObservations } = await exportModule();

    const table = displayTableFromObservations({
      observations: [
        obs(),
        obs({
          comparisonId: "cmp_white_women",
          comparisonLabel: "San Francisco White Women",
          value: 63000,
        }),
      ],
      comparisons: COMPARISONS,
      presentation: { comparisonPresentation: "tabs", activeTab: "cmp_latina" },
    });

    // The chart shows one map. The download is the data, not the screenshot.
    expect(table.rows).toHaveLength(2);
    const labels = table.rows.map((row) => row[table.columns.findIndex((c) => c.name === "Comparison")]);
    expect(labels).toEqual([
      "San Francisco Latina Women",
      "San Francisco White Women",
    ]);
  });

  it("exports only the active tab when the reader asked for exactly that", async () => {
    const { displayTableFromObservations } = await exportModule();
    const table = displayTableFromObservations({
      observations: [
        obs(),
        obs({
          comparisonId: "cmp_white_women",
          comparisonLabel: "San Francisco White Women",
          value: 63000,
        }),
      ],
      comparisons: COMPARISONS,
      presentation: { comparisonPresentation: "tabs", activeTab: "cmp_latina" },
      scope: "visibleTab",
    });

    // The narrow export exists, but only behind an action that says so.
    expect(table.rows).toHaveLength(1);
  });

  it("exports average metadata and included years", async () => {
    const { displayTableFromObservations, toCsv } = await exportModule();

    const table = displayTableFromObservations({
      observations: [
        obs({
          period: "2020-2030",
          value: 50000,
          valueKind: "derived",
          calculation: { id: "averageSelectedYears", params: { years: [2020, 2025, 2030] } },
          includedPeriods: [2020, 2025, 2030],
        }),
      ],
      comparisons: COMPARISONS,
    });

    const csv = toCsv(table);
    // A derived value has to stay explainable once it leaves the chart: without
    // the calculation and the years, 50,000 is indistinguishable from a single
    // year's count.
    expect(table.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["Calculation", "Included years"]),
    );
    expect(csv).toContain("averageSelectedYears");
    expect(csv).toContain("2020; 2025; 2030");
  });

  it("uses custom and derived comparison labels consistently", async () => {
    const { displayTableFromObservations } = await exportModule();

    const table = displayTableFromObservations({
      observations: [
        obs({ comparisonLabel: "SF Latinas" }),
        obs({
          comparisonId: "cmp_white_women",
          comparisonLabel: "San Francisco White Women",
          value: 63000,
        }),
      ],
      comparisons: [
        { id: "cmp_latina", label: "SF Latinas", derivedLabel: "San Francisco Latina Women" },
        COMPARISONS[1],
      ],
    });

    const column = table.columns.findIndex((c) => c.name === "Comparison");
    // The resolved label - custom where one was set, derived otherwise - is the
    // one string the chart, the table, and the file all use. A CSV that says
    // "Hispanic/Female/All Ages" describes a different thing to the reader than
    // the legend they were looking at.
    expect(table.rows.map((row) => row[column])).toEqual([
      "SF Latinas",
      "San Francisco White Women",
    ]);
  });

  it("keeps the source beside the value", async () => {
    const { displayTableFromObservations } = await exportModule();
    const table = displayTableFromObservations({
      observations: [obs({ source: "Census cc-est" })],
      comparisons: COMPARISONS,
    });
    expect(table.columns.map((column) => column.name)).toContain("Source");
    expect(table.rows[0]).toContain("Census cc-est");
  });
});
