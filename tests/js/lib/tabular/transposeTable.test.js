/** Workstream G: transposition preserves reader-forced column types. */

import { describe, expect, it } from "vitest";

import { transposeTable } from "@/lib/tabular/transposeTable";

function table(overrides = {}) {
  return {
    columns: [
      { name: "Region", type: "text" },
      { name: "2025", type: "number" },
    ],
    rows: [
      ["North", "10"],
      ["South", "20"],
    ],
    issues: [],
    ...overrides,
  };
}

describe("transposeTable", () => {
  it("transposes a simple grid", () => {
    const result = transposeTable(table());
    expect(result).toMatchObject({
      columns: [
        { name: "Region" },
        { name: "North" },
        { name: "South" },
      ],
      rows: [["2025", "10", "20"]],
      issues: [],
    });
  });

  it("infers types for the new columns", () => {
    const result = transposeTable(table());
    expect(result.columns.map(({ type }) => type)).toEqual([
      "text",
      "number",
      "number",
    ]);
    expect(result.columns.every((column) => column.forced !== true)).toBe(true);
  });

  it("round-trips a table exactly", () => {
    const original = table();
    expect(transposeTable(transposeTable(original))).toEqual(original);
  });

  it("round-trips a table with a forced type", () => {
    const original = table({
      columns: [
        { name: "Region", type: "group", forced: true },
        { name: "2025", type: "number" },
      ],
    });
    expect(transposeTable(transposeTable(original))).toEqual(original);
  });

  it("round-trips a table whose forced type contradicts inference", () => {
    const original = table({
      columns: [
        { name: "Region", type: "text" },
        { name: "2025", type: "text", forced: true },
      ],
    });
    const restored = transposeTable(transposeTable(original));
    expect(restored).toEqual(original);
    expect(restored.columns[1]).toMatchObject({ type: "text", forced: true });
  });

  it("carries a forced type to the column its name became", () => {
    const original = table({
      columns: [
        { name: "Region", type: "group", forced: true },
        { name: "2025", type: "number" },
      ],
    });
    expect(transposeTable(original).columns[0]).toMatchObject({
      name: "Region",
      type: "group",
      forced: true,
    });
  });

  it("leaves inferred types alone when a name does not survive", () => {
    const original = table({
      columns: [
        { name: "Region", type: "text" },
        { name: "2025", type: "text", forced: true },
      ],
    });
    const result = transposeTable(original);
    expect(result.columns.map((column) => column.name)).not.toContain("2025");
    expect(result.columns.every((column) => column.forced !== true)).toBe(true);
    expect(result.columns.map((column) => column.type)).toEqual([
      "text",
      "number",
      "number",
    ]);
  });

  it("re-infers rather than restoring when the shape no longer matches", () => {
    const original = table();
    const transposed = transposeTable(original);
    const edited = {
      ...transposed,
      rows: [...transposed.rows, ["2026", "11", "21"]],
    };
    const result = transposeTable(edited);

    expect(result).not.toEqual(original);
    expect(result.rows).toHaveLength(2);
  });

  it("clears the snapshot after restoring", () => {
    const original = table();
    const restored = transposeTable(transposeTable(original));
    expect(restored).not.toHaveProperty("transposedFrom");

    const third = transposeTable(restored);
    expect(third).not.toEqual(original);
    expect(third).toHaveProperty("transposedFrom");
  });

  it("handles a single-column table", () => {
    const original = {
      columns: [{ name: "Label", type: "text" }],
      rows: [["A"], ["B"]],
      issues: [],
    };
    expect(transposeTable(original)).toMatchObject({
      columns: [
        { name: "Label", type: "text" },
        { name: "A", type: "text" },
        { name: "B", type: "text" },
      ],
      rows: [],
    });
    expect(transposeTable(transposeTable(original))).toEqual(original);
  });

  it("handles ragged rows", () => {
    const original = {
      columns: [
        { name: "A", type: "text" },
        { name: "B", type: "text" },
        { name: "C", type: "text" },
      ],
      rows: [["r1a"], ["r2a", "r2b"]],
      issues: [],
    };
    expect(transposeTable(original)).toMatchObject({
      columns: [{ name: "A" }, { name: "r1a" }, { name: "r2a" }],
      rows: [
        ["B", "", "r2b"],
        ["C", "", ""],
      ],
    });
  });
});
