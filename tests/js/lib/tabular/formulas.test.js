/** Import overhaul, phase 1: per-cell formulas over an inline table. */

import { describe, expect, it } from "vitest";

import {
  cellAddress,
  columnLetters,
  fillFormula,
  recalculate,
  shiftFormulas,
} from "@/lib/tabular/formulas";

// Excel numbering: row 1 is the header, so the first data row is row 2.
const table = (rows, formulas = {}, columns = ["Region", "Yes", "No", "Share"]) => ({
  columns: columns.map((name, index) => ({ name, type: index === 0 ? "text" : "number" })),
  rows,
  formulas,
});

describe("addresses", () => {
  it("names columns A to Z, then AA", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(columnLetters)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
  });
  it("puts the first data row on row 2, under the header", () => {
    expect(cellAddress(0, 0)).toBe("A2");
    expect(cellAddress(3, 2)).toBe("C5");
  });
});

describe("recalculate", () => {
  it("leaves a table without formulas untouched", () => {
    const plain = table([["North", "40", "60", ""]]);
    expect(recalculate(plain)).toBe(plain);
  });

  it("evaluates cell references and arithmetic into the row values", () => {
    const result = recalculate(table([["North", "40", "60", ""]], { "0:3": "=B2/(B2+C2)*100" }));
    expect(result.rows[0][3]).toBe("40");
    expect(result.formulas).toEqual({ "0:3": "=B2/(B2+C2)*100" });
  });

  it("reads ranges in SUM, AVERAGE, COUNT, MEDIAN, MIN, and MAX", () => {
    const rows = [["North", "1", "2", ""], ["South", "3", "4", ""], ["West", "5", "9", ""]];
    const formulas = {
      "0:3": "=SUM(B2:C4)",
      "1:3": "=AVERAGE(B2:B4)",
      "2:3": "=COUNT(B2:C4) + MEDIAN(C2:C4) + MIN(B2:B4) * MAX(C:C)",
    };
    const result = recalculate(table(rows, formulas));
    expect(result.rows.map((row) => row[3])).toEqual(["24", "3", String(6 + 4 + 1 * 9)]);
  });

  it("gives a value's share of a range with SHARE", () => {
    const result = recalculate(table([["North", "30", "90", ""]], { "0:3": "=SHARE(B2, B2:C2)" }));
    expect(result.rows[0][3]).toBe("25");
  });

  it("reads a header name as the same row's cell", () => {
    const result = recalculate(table([["North", "2", "3", ""], ["South", "4", "5", ""]], {
      "0:3": "=[Yes] * [No]",
      "1:3": "=[Yes] * [No]",
    }));
    expect(result.rows.map((row) => row[3])).toEqual(["6", "20"]);
  });

  it("follows formulas that depend on other formulas, in any order", () => {
    const result = recalculate(table([["North", "2", "", ""]], { "0:3": "=C2 * 10", "0:2": "=B2 + 1" }));
    expect(result.rows[0].slice(2)).toEqual(["3", "30"]);
  });

  it("marks a cycle instead of looping", () => {
    const result = recalculate(table([["North", "1", "", ""]], { "0:2": "=D2 + 1", "0:3": "=C2 + 1" }));
    expect(result.rows[0].slice(2)).toEqual(["#CYCLE!", "#CYCLE!"]);
  });

  it("marks a reference outside the table and arithmetic on text", () => {
    const result = recalculate(table([["North", "1", "", ""]], { "0:2": "=Z99", "0:3": "=A2 * 2" }));
    expect(result.rows[0].slice(2)).toEqual(["#REF!", "#VALUE!"]);
  });

  it("spreads an error to the cells that use it", () => {
    const result = recalculate(table([["North", "1", "", ""]], { "0:2": "=Z99", "0:3": "=C2 + 1" }));
    expect(result.rows[0][3]).toBe("#REF!");
  });

  it("shows a bad formula as an error without throwing", () => {
    const result = recalculate(table([["North", "1", "", ""]], { "0:3": "=SUM(B2" }));
    expect(result.rows[0][3]).toBe("#ERROR!");
  });

  it("supports IF, comparisons, ROUND, and text joins", () => {
    const result = recalculate(table([["North", "2.456", "", ""]], {
      "0:2": '=IF(B2 > 2, "high", "low")',
      "0:3": '=CONCAT(A2, ": ", ROUND(B2, 1))',
    }));
    expect(result.rows[0].slice(2)).toEqual(["high", "North: 2.5"]);
  });

  it("writes numbers in the column's own separator convention", () => {
    const eu = table([["North", "1,5", ""]], { "0:2": "=B2 * 3" }, ["Region", "A", "B"]);
    eu.columns[1].locale = "eu";
    eu.columns[2].locale = "eu";
    expect(recalculate(eu).rows[0][2]).toBe("4,5");
  });

  it("never runs JavaScript", () => {
    const result = recalculate(table([["North", "1", "", ""]], { "0:3": '=constructor("return 1")()' }));
    expect(result.rows[0][3]).toBe("#ERROR!");
  });
});

describe("fillFormula", () => {
  it("moves relative references with the fill and keeps $ anchors", () => {
    expect(fillFormula("=B2/$C$2 + B$2 + $B2", { row: 0, col: 3 }, { row: 2, col: 3 })).toBe("=B4/$C$2 + B$2 + $B4");
    expect(fillFormula("=SUM(B2:C2)", { row: 0, col: 3 }, { row: 0, col: 4 })).toBe("=SUM(C2:D2)");
  });
  it("turns a reference pushed off the sheet into #REF!", () => {
    expect(fillFormula("=B2", { row: 1, col: 3 }, { row: 0, col: 3 })).toBe("=B1");
    // B1 is the header row; one row above it is off the sheet.
    expect(fillFormula("=B1", { row: 0, col: 3 }, { row: -1, col: 3 })).toBe("=#REF!");
  });
});

describe("shiftFormulas", () => {
  const base = () => table([["North", "1", "2", ""], ["South", "3", "4", ""]], { "1:3": "=B3 + C2" });

  it("moves formulas and their references when a row is inserted above them", () => {
    const shifted = shiftFormulas(base(), { type: "insertRow", at: 0 });
    expect(shifted).toEqual({ "2:3": "=B4 + C3" });
  });
  it("turns a reference to a deleted row into #REF!", () => {
    expect(shiftFormulas(base(), { type: "deleteRow", at: 0 })).toEqual({ "0:3": "=B2 + #REF!" });
  });
  it("moves references when a column is inserted or deleted", () => {
    expect(shiftFormulas(base(), { type: "insertColumn", at: 1 })).toEqual({ "1:4": "=C3 + D2" });
    expect(shiftFormulas(base(), { type: "deleteColumn", at: 2 })).toEqual({ "1:2": "=B3 + #REF!" });
  });
  it("drops a formula whose own cell is deleted", () => {
    expect(shiftFormulas(base(), { type: "deleteRow", at: 1 })).toEqual({});
  });
  it("keeps header-name references when a column moves", () => {
    const named = table([["North", "1", "2", ""]], { "0:3": "=[Yes] + 1" });
    expect(shiftFormulas(named, { type: "insertColumn", at: 1 })).toEqual({ "0:4": "=[Yes] + 1" });
  });
});

describe("bare column names", () => {
  it("reads a bare header name as the same row's cell, and an unknown one as #NAME?", () => {
    const result = recalculate(table([["North", "2", "3", ""]], { "0:3": "=Yes * No", "0:2": "=Maybe" }));
    expect(result.rows[0].slice(2)).toEqual(["#NAME?", "#NAME?"]);
    const ok = recalculate(table([["North", "2", "3", ""]], { "0:3": "=Yes * No" }));
    expect(ok.rows[0][3]).toBe("6");
  });
});

describe("spreadsheet permutations", () => {
  it("permutes rows, moving formulas and their references", () => {
    const source = table([["North", "10", "", ""], ["South", "20", "", ""], ["West", "30", "", ""]], {
      "0:3": "=B2+$B$3+B$4+$B2", "2:2": "=[Yes]+B2",
    });
    expect(shiftFormulas(source, { type: "permuteRows", order: [2, 0, 1] })).toEqual({
      "1:3": "=B3+$B$4+B$2+$B3", "0:2": "=[Yes]+B3",
    });
    expect(source.formulas["0:3"]).toBe("=B2+$B$3+B$4+$B2");
  });

  it("permutes columns, moving formulas and their references", () => {
    const source = table([["North", "10", "20", ""]], { "0:3": "=B2+$C$2+B$2+$B2+[Yes]" });
    expect(shiftFormulas(source, { type: "permuteColumns", order: [3, 2, 0, 1] })).toEqual({
      "0:0": "=D2+$B$2+D$2+$D2+[Yes]",
    });
  });

  it("rewrites a range whose ends move apart to cover its new ends", () => {
    const source = table([["a", "1", "", ""], ["b", "2", "", ""], ["c", "3", "", ""], ["d", "4", "", ""]], { "0:3": "=SUM(B2:B3)" });
    expect(shiftFormulas(source, { type: "permuteRows", order: [0, 2, 3, 1] })).toEqual({ "0:3": "=SUM(B2:B5)" });
    const cols = table([["a", "1", "2", ""]], { "0:3": "=SUM(B2:C2)" });
    expect(shiftFormulas(cols, { type: "permuteColumns", order: [1, 0, 3, 2] })).toEqual({ "0:2": "=SUM(A2:D2)" });
  });
});
