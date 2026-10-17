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

  it.each(["paste", "upload"])("recognizes a quoted year header in an imported CSV via %s", async (mode) => {
    const source = '"year","Coal","Gas","Oil","Cement, Flaring & Other Industry"\n1870,529.404,,3.133,\n1871,562.861,,3.282,\n1882,912.817,0.165,18.939,\n';
    const { value, errors } = mode === "paste"
      ? await parsePaste(source)
      : await parseFile(new File([source], "time-series.txt", { type: "text/plain" }));
    expect(errors).toEqual([]);
    expect(value.columns[0]).toMatchObject({ name: "year", type: "date", granularity: "year" });
    expect(value.columns.slice(1, 4).map((column) => column.type)).toEqual(["number", "number", "number"]);
    expect(value.rows.map((row) => row[0])).toEqual(["1870", "1871", "1882"]);
  });

  it("selects the Group type for exact Group and Category headers", async () => {
    for (const header of ["Group", "Category"]) {
      const { value } = await parsePaste(
        `${header}\tValue\nEducation\t75\nOccupation\t140\n`,
      );
      expect(value.columns).toMatchObject([
        { name: header, type: "group" },
        { name: "Value", type: "number" },
      ]);
    }
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

import { fixtureText as datasetText } from "@/tests/fixtures/byod-shapes/helpers";
describe("dataset range: cleaning on every import path", () => {
  it.each(["paste", "tsv", "xlsx"])("cleans metadata and merged headers for %s", async mode => {
    const text = datasetText("messy-export");
    let result;
    if (mode === "paste") result = await parsePaste(text);
    else if (mode === "tsv") result = await parseFile(new File([text], "survey.tsv", { type: "text/tab-separated-values" }));
    else {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Survey");
      for (const row of text.trimEnd().split("\n")) sheet.addRow(row.split("\t"));
      result = await parseFile(new File([await workbook.xlsx.writeBuffer()], "survey.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    }
    expect(result.errors).toEqual([]);
    expect(result.value.columns.map(c => c.name)).toEqual(["Region - Name", "Employment - Jobs", "Employment - Vacancies", "Employment - Positions"]);
    expect(result.value.rows).toHaveLength(5);
    expect(result.value.meta).toMatchObject({ title: "Regional employment", source: "Example survey", notes: "Provisional estimates" });
    expect(result.value.rows[1][0]).toBe(""); // Fill down is offered, never automatic.
    expect(result.value.rows.at(-1)[0]).toBe("Total"); // Totals are retained until requested.
    const messages = result.value.findings.map(f => f.message).join(" ");
    for (const finding of [/title/i, /source/i, /note/i, /header/i, /fill.down/i, /total/i, /footnote|mark/i]) expect(messages).toMatch(finding);
  });
});

import { rereadTable } from "@/lib/tabular/parseTable";
describe("import overhaul: reading the raw data again", () => {
  it("keeps a paste's raw text so its separator can be chosen again", async () => {
    const { value } = await parsePaste("Region;Jobs\nNorth;12\nSouth;14\n");
    expect(value.meta.rawText).toBe("Region;Jobs\nNorth;12\nSouth;14\n");
    expect(value.columns).toHaveLength(1);
    const reread = await rereadTable(value, { delimiter: ";" });
    expect(reread.columns.map((c) => c.name)).toEqual(["Region", "Jobs"]);
    expect(reread.rows).toEqual([["North", "12"], ["South", "14"]]);
    expect(reread.meta.importOptions).toMatchObject({ delimiter: ";" });
  });

  it("uses a chosen header row and keeps the lines above it as the title", async () => {
    const { value } = await parsePaste("Jobs report\t\nfootnote a\t\nRegion\tJobs\nNorth\t12\n");
    const reread = await rereadTable(value, { headerRow: 2 });
    expect(reread.columns.map((c) => c.name)).toEqual(["Region", "Jobs"]);
    expect(reread.rows).toEqual([["North", "12"]]);
    expect(reread.meta.title).toBe("Jobs report footnote a");
  });

  it("joins a header that spans several rows", async () => {
    const { value } = await parsePaste("Place\tEmployment\t\nName\tJobs\tOpenings\nNorth\t12\t4\n");
    const reread = await rereadTable(value, { headerRow: 0, headerRows: 2, tidy: false });
    expect(reread.columns.map((c) => c.name)).toEqual(["Place - Name", "Employment - Jobs", "Employment - Openings"]);
    expect(reread.rows).toEqual([["North", "12", "4"]]);
  });

  it("reads numbers and dates in a chosen convention", async () => {
    const { value } = await parsePaste("Day\tAmount\n03/04/2020\t1.234\n05/06/2020\t2.345\n");
    expect(value.columns[1]).toMatchObject({ locale: "en" });
    const reread = await rereadTable(value, { locale: "eu", dateOrder: "dmy" });
    expect(reread.columns[1]).toMatchObject({ type: "number", locale: "eu" });
    expect(reread.columns[0]).toMatchObject({ type: "date", dateOrder: "dmy" });
  });

  it("can leave titles, sources, and notes in the data", async () => {
    const { value } = await parsePaste("Region\tJobs\nNorth\t12\nSource: Example survey\t\n");
    expect(value.rows).toHaveLength(1);
    const reread = await rereadTable(value, { tidy: false });
    expect(reread.rows).toHaveLength(2);
    expect(reread.meta.source).toBeUndefined();
  });

  it("carries the reader's column kinds over by name", async () => {
    const { value } = await parsePaste("Region;Jobs;Note\nNorth;12;a\n");
    const reread = await rereadTable(value, { delimiter: ";" });
    const marked = { ...reread, columns: reread.columns.map((c) => (c.name === "Note" ? { ...c, ignored: true } : c.name === "Jobs" ? { ...c, unit: "percent", unitForced: true } : c)) };
    const again = await rereadTable(marked, { headerRow: 0 });
    expect(again.columns.find((c) => c.name === "Note").ignored).toBe(true);
    expect(again.columns.find((c) => c.name === "Jobs")).toMatchObject({ unit: "percent", unitForced: true });
  });
});
