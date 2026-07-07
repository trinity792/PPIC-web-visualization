/**
 * Tests for lib/tabular/parseTable.js — turning pasted text or an uploaded
 * file into the editor's inline-table shape. Dynamic imports (papaparse,
 * ExcelJS) resolve to the real installed packages under Vitest/Node, so no
 * mocking is needed; small fixtures keep this fast.
 *
 * Note: fixture numbers deliberately avoid exactly-4-digit values (e.g. "500"
 * rather than "1000") — a bare 4-digit string parses as both a number and a
 * date-token year (see columnTypes.test.js's documented tie), which would
 * make these type-inference assertions incidentally depend on that tie
 * rather than on parseTable's own behavior.
 */

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { detectHeaderRow, MAX_FILE_BYTES, parseFile, parsePaste } from "@/lib/tabular/parseTable";

describe("parsePaste", () => {
  it("sniffs a tab-delimited (Excel/Sheets clipboard) paste", async () => {
    const { value, errors } = await parsePaste("County\tPopulation\nFresno\t500\nKern\t300\n");
    expect(errors).toEqual([]);
    expect(value.columns.map((c) => c.name)).toEqual(["County", "Population"]);
    expect(value.rows).toEqual([
      ["Fresno", "500"],
      ["Kern", "300"],
    ]);
  });

  it("sniffs a comma-delimited paste", async () => {
    const { value, errors } = await parsePaste("County,Population\nFresno,500\nKern,300\n");
    expect(errors).toEqual([]);
    expect(value.columns.map((c) => c.name)).toEqual(["County", "Population"]);
  });

  it("infers column types from the parsed body", async () => {
    const { value } = await parsePaste("County\tPopulation\nFresno\t500\nKern\t300\n");
    expect(value.columns[0].type).toBe("text");
    expect(value.columns[1].type).toBe("number");
  });

  it("returns a TABLE_PARSE_FAILED finding for an empty paste, without throwing", async () => {
    const { value, errors } = await parsePaste("   ");
    expect(value).toBeNull();
    expect(errors[0].code).toBe("TABLE_PARSE_FAILED");
    expect(errors[0].level).toBe("error");
  });
});

describe("detectHeaderRow", () => {
  it("detects a text header sitting above numeric data", () => {
    const rows = [
      ["County", "Population"],
      ["Fresno", "500"],
      ["Kern", "300"],
    ];
    expect(detectHeaderRow(rows)).toBe(0);
  });

  it("detects no header row when every row looks like data", () => {
    const rows = [
      ["100", "200"],
      ["300", "400"],
      ["500", "600"],
    ];
    expect(detectHeaderRow(rows)).toBe(-1);
  });

  it("defaults a single-row grid to a header at row 0", () => {
    expect(detectHeaderRow([["County", "Population"]])).toBe(0);
  });
});

describe("parseFile", () => {
  it("returns a named error, never throwing, when no file is given", async () => {
    const { value, errors } = await parseFile(null);
    expect(value).toBeNull();
    expect(errors[0].code).toBe("TABLE_PARSE_FAILED");
  });

  it("rejects an oversized file by name with TABLE_TOO_LARGE", async () => {
    const { value, errors } = await parseFile({ name: "big.csv", size: MAX_FILE_BYTES + 1 });
    expect(value).toBeNull();
    expect(errors[0].code).toBe("TABLE_TOO_LARGE");
    expect(errors[0].message).toContain("MB");
  });

  it("rejects legacy XLS/ODS/DBF by name with UNSUPPORTED_FORMAT, naming the deferral", async () => {
    for (const name of ["legacy.xls", "legacy.ods", "legacy.dbf"]) {
      const { value, errors } = await parseFile({ name, size: 10 });
      expect(value).toBeNull();
      expect(errors[0].code).toBe("UNSUPPORTED_FORMAT");
      expect(errors[0].message).toContain(`.${name.split(".").at(-1)}`);
    }
  });

  it("rejects an unrecognized extension with UNSUPPORTED_FORMAT", async () => {
    const { value, errors } = await parseFile({ name: "notes.docx", size: 10, type: "" });
    expect(value).toBeNull();
    expect(errors[0].code).toBe("UNSUPPORTED_FORMAT");
  });

  it("parses a .csv file via papaparse", async () => {
    const file = new File(["County,Population\nFresno,500\n"], "data.csv", { type: "text/csv" });
    const { value, errors } = await parseFile(file);
    expect(errors).toEqual([]);
    expect(value.columns.map((c) => c.name)).toEqual(["County", "Population"]);
    expect(value.rows).toEqual([["Fresno", "500"]]);
  });

  it("parses a .tsv file via papaparse", async () => {
    const file = new File(["County\tPopulation\nFresno\t500\n"], "data.tsv", {
      type: "text/tab-separated-values",
    });
    const { value, errors } = await parseFile(file);
    expect(errors).toEqual([]);
    expect(value.rows).toEqual([["Fresno", "500"]]);
  });

  it("parses a .txt file as delimited text", async () => {
    const file = new File(["County,Population\nFresno,500\n"], "data.txt", { type: "text/plain" });
    const { value, errors } = await parseFile(file);
    expect(errors).toEqual([]);
    expect(value.rows).toEqual([["Fresno", "500"]]);
  });

  it("parses a .xlsx workbook via ExcelJS", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(["County", "Population"]);
    sheet.addRow(["Fresno", 500]);
    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([buffer], "data.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const { value, errors } = await parseFile(file);
    expect(errors).toEqual([]);
    expect(value.columns.map((c) => c.name)).toEqual(["County", "Population"]);
    expect(value.rows[0][0]).toBe("Fresno");
    expect(value.rows[0][1]).toBe("500");
  });
});
