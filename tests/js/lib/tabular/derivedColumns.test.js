/**
 * Tests for lib/tabular/derivedColumns.js — the hand-rolled (no eval)
 * formula tokenizer/parser/evaluator for user-defined derived columns.
 */

import { describe, expect, it } from "vitest";

import { addDerivedColumn, compileFormula, FORMULA_FUNCTIONS } from "@/lib/tabular/derivedColumns";

const columns = [{ name: "Population" }, { name: "Housing Units" }, { name: "County Name" }];

function evaluateOn(formula, record) {
  const compiled = compileFormula(formula, columns);
  expect(compiled.error).toBeUndefined();
  return compiled.evaluate(record);
}

describe("FORMULA_FUNCTIONS", () => {
  it("whitelists exactly the documented function set", () => {
    expect([...FORMULA_FUNCTIONS].sort()).toEqual(
      ["abs", "concat", "if", "lower", "max", "min", "round", "trim", "upper"].sort(),
    );
  });
});

describe("compileFormula", () => {
  it("compiles a bare column reference and reports it as referenced", () => {
    const compiled = compileFormula("Population", columns);
    expect(compiled.referencedColumns).toEqual(["Population"]);
    expect(compiled.evaluate({ Population: "100" })).toBe(100);
  });

  it("supports bracket syntax for column names containing spaces", () => {
    const compiled = compileFormula("[Housing Units]", columns);
    expect(compiled.evaluate({ "Housing Units": "42" })).toBe(42);
  });

  it("evaluates arithmetic with standard precedence", () => {
    expect(evaluateOn("2 + 3 * 4", {})).toBe(14);
    expect(evaluateOn("(2 + 3) * 4", {})).toBe(20);
  });

  it("computes round/abs/min/max", () => {
    expect(evaluateOn("round(3.14159, 2)", {})).toBe(3.14);
    expect(evaluateOn("abs(-5)", {})).toBe(5);
    expect(evaluateOn("min(4, 2, 9)", {})).toBe(2);
    expect(evaluateOn("max(4, 2, 9)", {})).toBe(9);
  });

  it("computes trim/upper/lower/concat", () => {
    expect(evaluateOn('trim("  hi  ")', {})).toBe("hi");
    expect(evaluateOn('upper("hi")', {})).toBe("HI");
    expect(evaluateOn('lower("HI")', {})).toBe("hi");
    expect(evaluateOn('concat("a", "-", "b")', {})).toBe("a-b");
  });

  it("computes if() from a comparison condition", () => {
    expect(evaluateOn('if(5 > 3, "yes", "no")', {})).toBe("yes");
    expect(evaluateOn('if(5 < 3, "yes", "no")', {})).toBe("no");
  });

  it("returns null for division by zero, never Infinity", () => {
    expect(evaluateOn("10 / 0", {})).toBeNull();
    expect(evaluateOn("Population / 0", { Population: "100" })).toBeNull();
  });

  it("errors on an unknown identifier, with a character position", () => {
    const compiled = compileFormula("Population + Elevation", columns);
    expect(compiled.error.code).toBe("FORMULA_PARSE_ERROR");
    expect(compiled.error.message).toContain("Elevation");
    expect(typeof compiled.error.position).toBe("number");
  });

  it("errors on an unknown function name", () => {
    const compiled = compileFormula("sqrt(4)", columns);
    expect(compiled.error.code).toBe("FORMULA_PARSE_ERROR");
    expect(compiled.error.message).toContain("sqrt");
  });

  it("never resolves window or any other global — it is an unknown identifier", () => {
    const compiled = compileFormula("window", columns);
    expect(compiled.error.code).toBe("FORMULA_PARSE_ERROR");
    expect(compiled.error.message).toContain("window");
  });

  it("errors on malformed syntax (unbalanced parens)", () => {
    const compiled = compileFormula("round(Population, 2", columns);
    expect(compiled.error.code).toBe("FORMULA_PARSE_ERROR");
  });

  it("never throws on user input", () => {
    expect(() => compileFormula("!!!", columns)).not.toThrow();
    expect(() => compileFormula("", columns)).not.toThrow();
  });
});

describe("addDerivedColumn", () => {
  const table = {
    columns: [{ name: "Population", type: "number" }],
    rows: [["1000"], ["2000"], ["not a number"]],
    issues: [],
  };

  it("appends a new column computed per row", () => {
    const next = addDerivedColumn(table, "Thousands", "round(Population / 1000, 1)");
    expect(next.columns.at(-1)).toMatchObject({ name: "Thousands", type: "number" });
    expect(next.rows[0].at(-1)).toBe("1");
    expect(next.rows[1].at(-1)).toBe("2");
  });

  it("grades a per-row formula failure MALFORMED via table.issues, without throwing", () => {
    // Rows 0/1 divide cleanly; row 2's Population ("not a number") can't
    // convert to a number, so the "/" operator throws for that row only —
    // addDerivedColumn catches it, records a table.issues entry, and moves on.
    const next = addDerivedColumn(table, "Half", "Population / 2");
    expect(next.rows[0].at(-1)).toBe("500");
    expect(next.rows[1].at(-1)).toBe("1000");
    const newColumnIndex = next.columns.length - 1;
    const failedRow = next.issues.find(
      (issue) => issue.column === newColumnIndex && issue.row === 2,
    );
    expect(failedRow).toBeTruthy();
    expect(next.rows[2].at(-1)).toBe("");
  });

  it("is a no-op (returns the original table) when the formula does not compile", () => {
    const next = addDerivedColumn(table, "Bad", "Population +");
    expect(next).toBe(table);
  });

  it("does not mutate the input table", () => {
    const before = JSON.stringify(table);
    addDerivedColumn(table, "Thousands", "round(Population / 1000, 1)");
    expect(JSON.stringify(table)).toBe(before);
  });
});
