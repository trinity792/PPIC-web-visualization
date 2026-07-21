/**
 * Tests for lib/tabular/toSeries.js — the alignment test: toSeries.buildShapes
 * must reproduce the exact shapes lib/data/query_shapes.js's builders return,
 * since toSeries converts an inline table's bound columns into the same
 * {Location, Year, <parameter>}-style rows and calls those builders directly.
 */

import { describe, expect, it } from "vitest";

import {
  buildCategoryValues,
  buildLineSeries,
  buildMatrix,
  buildMeasurePairs,
  buildTwoPeriod,
} from "@/lib/data/query_shapes";
import {
  applyTabFilter,
  buildShapes,
  supportedShapes,
  tabValues,
} from "@/lib/tabular/toSeries";

function inlineTable(columns, rows) {
  return { columns: columns.map((name) => ({ name, type: "text" })), rows, issues: [] };
}

describe("buildShapes — line", () => {
  it("matches buildLineSeries on an equivalent fixture", () => {
    const table = inlineTable(
      ["County", "Year", "Population"],
      [
        ["Fresno", "2020", "100"],
        ["Fresno", "2021", "110"],
        ["Kern", "2020", "90"],
        ["Kern", "2021", "95"],
      ],
    );
    const spec = {
      chartType: "line",
      bindings: { x: "Year", y: "Population", series: "County" },
      period: {},
    };

    const canonicalRows = [
      { Location: "Fresno", Year: 2020, value: 100 },
      { Location: "Fresno", Year: 2021, value: 110 },
      { Location: "Kern", Year: 2020, value: 90 },
      { Location: "Kern", Year: 2021, value: 95 },
    ];
    const expected = buildLineSeries(canonicalRows, "value", [null, null]);

    expect(buildShapes(table, spec)).toEqual(expected);
  });

  it("falls back to a single implied 'Series' location when no series/color is bound", () => {
    const table = inlineTable(
      ["Year", "Population"],
      [
        ["2020", "100"],
        ["2021", "110"],
      ],
    );
    const spec = { chartType: "line", bindings: { x: "Year", y: "Population" }, period: {} };
    const result = buildShapes(table, spec);
    expect(result.series).toHaveLength(1);
    expect(result.series[0].location).toBe("Series");
    expect(result.series[0].years).toEqual([2020, 2021]);
    expect(result.series[0].values).toEqual([100, 110]);
  });
});

describe("buildShapes — category (bar)", () => {
  it("matches buildCategoryValues on the implied single-period rows", () => {
    const table = inlineTable(
      ["County", "Population"],
      [
        ["Fresno", "100"],
        ["Kern", "90"],
        ["Madera", "40"],
      ],
    );
    const spec = {
      chartType: "bar",
      bindings: { category: "County", y: "Population" },
      filters: {},
      appearance: {},
    };

    const canonicalRows = [
      { Location: "Fresno", Year: 0, value: 100 },
      { Location: "Kern", Year: 0, value: 90 },
      { Location: "Madera", Year: 0, value: 40 },
    ];
    const expected = buildCategoryValues(canonicalRows, "value", {
      period: 0,
      topN: null,
      sort: "value",
    });

    expect(buildShapes(table, spec)).toEqual(expected);
  });

  it("tags records and preserves first-seen blocks with value sort inside each block", () => {
    const table = {
      columns: [
        { name: "Label", type: "text" },
        { name: "Section", type: "group" },
        { name: "Value", type: "number" },
      ],
      rows: [
        ["Degree", "Education", "10"],
        ["Graduate", "Education", "30"],
        ["Lawyers", "Occupation", "20"],
        ["Dentists", "Occupation", "40"],
      ],
    };
    const result = buildShapes(table, {
      chartType: "bar",
      bindings: { category: "Label", group: "Section", y: "Value" },
      filters: {},
      appearance: { sort: "value" },
    });
    expect(result.records.map(({ category, group }) => [category, group])).toEqual([
      ["Graduate", "Education"],
      ["Degree", "Education"],
      ["Dentists", "Occupation"],
      ["Lawyers", "Occupation"],
    ]);
  });

  it("keeps bar color-series metadata independent from category sections", () => {
    const table = {
      columns: [
        { name: "Label", type: "text" },
        { name: "Section", type: "group" },
        { name: "Sex", type: "text" },
        { name: "Value", type: "number" },
      ],
      rows: [
        ["Degree", "Education", "Women", "75"],
        ["Degree", "Education", "Men", "100"],
        ["Dentists", "Occupation", "Women", "140"],
        ["Dentists", "Occupation", "Men", "170"],
      ],
    };
    const result = buildShapes(table, {
      chartType: "bar",
      bindings: {
        category: "Label",
        group: "Section",
        color: "Sex",
        y: "Value",
      },
      filters: {},
      appearance: { sort: "value" },
    });
    expect(result.records.map(({ group, color, value }) => [group, color, value])).toEqual([
      ["Education", "Men", 100],
      ["Education", "Women", 75],
      ["Occupation", "Men", 170],
      ["Occupation", "Women", 140],
    ]);
  });

  it("honors filters.topN and appearance.sort", () => {
    const table = inlineTable(
      ["County", "Population"],
      [
        ["Fresno", "100"],
        ["Kern", "90"],
        ["Madera", "40"],
      ],
    );
    const spec = {
      chartType: "bar",
      bindings: { category: "County", y: "Population" },
      filters: { topN: 2 },
      appearance: { sort: "value" },
    };
    const result = buildShapes(table, spec);
    expect(result.records).toHaveLength(2);
    expect(result.records[0].location).toBe("Fresno");
  });
});

describe("buildShapes — twoPeriod (dumbbell/slope)", () => {
  it("matches buildTwoPeriod when the two endpoints come from two columns", () => {
    const table = inlineTable(
      ["County", "Pop2010", "Pop2020"],
      [
        ["Fresno", "100", "150"],
        ["Kern", "90", "95"],
      ],
    );
    const spec = {
      chartType: "dumbbell",
      bindings: { category: "County", start: "Pop2010", end: "Pop2020" },
      period: { startYear: 2010, endYear: 2020 },
    };

    const syntheticRows = [
      { Location: "Fresno", Year: 2010, value: 100 },
      { Location: "Fresno", Year: 2020, value: 150 },
      { Location: "Kern", Year: 2010, value: 90 },
      { Location: "Kern", Year: 2020, value: 95 },
    ];
    const expected = buildTwoPeriod(syntheticRows, "value", { startYear: 2010, endYear: 2020 });

    expect(buildShapes(table, spec)).toEqual(expected);
  });

  it("carries a group tag on the existing two-period record shape", () => {
    const table = {
      columns: [
        { name: "Label", type: "text" },
        { name: "Section", type: "group" },
        { name: "Women", type: "number" },
        { name: "Men", type: "number" },
      ],
      rows: [
        ["Degree", "Education", "75", "100"],
        ["Dentists", "Occupation", "140", "170"],
      ],
    };
    const result = buildShapes(table, {
      chartType: "dumbbell",
      bindings: {
        category: "Label",
        group: "Section",
        start: "Women",
        end: "Men",
      },
      period: {},
    });
    expect(result.records).toEqual([
      expect.objectContaining({ category: "Degree", group: "Education" }),
      expect.objectContaining({ category: "Dentists", group: "Occupation" }),
    ]);
  });
});

describe("buildShapes — pairs (scatter/bubble)", () => {
  it("matches buildMeasurePairs on the implied single-period rows", () => {
    const table = inlineTable(
      ["County", "X", "Y"],
      [
        ["Fresno", "10", "20"],
        ["Kern", "30", "40"],
      ],
    );
    const spec = { chartType: "scatter", bindings: { unit: "County", x: "X", y: "Y" } };

    const syntheticRows = [
      { Location: "Fresno", Year: 0, x: 10, y: 20 },
      { Location: "Kern", Year: 0, x: 30, y: 40 },
    ];
    const expected = buildMeasurePairs(syntheticRows, {
      xMeasure: "x",
      yMeasure: "y",
      sizeMeasure: null,
      period: 0,
    });

    expect(buildShapes(table, spec)).toEqual(expected);
  });

  it("includes a size measure for bubble when bound", () => {
    const table = inlineTable(
      ["County", "X", "Y", "Size"],
      [["Fresno", "10", "20", "5"]],
    );
    const spec = {
      chartType: "bubble",
      bindings: { unit: "County", x: "X", y: "Y", size: "Size" },
    };
    const result = buildShapes(table, spec);
    expect(result.records[0]).toMatchObject({ x: 10, y: 20, size: 5 });
  });
});

describe("buildShapes — matrix (heatmap)", () => {
  it("matches buildMatrix on an equivalent fixture", () => {
    const table = inlineTable(
      ["County", "Year", "Population"],
      [
        ["Fresno", "2020", "100"],
        ["Fresno", "2021", "110"],
        ["Kern", "2020", "90"],
        ["Kern", "2021", "95"],
      ],
    );
    const spec = { chartType: "heatmap", bindings: { x: "Year", y: "County", color: "Population" } };

    const canonicalRows = [
      { Location: "Fresno", Year: 2020, value: 100 },
      { Location: "Fresno", Year: 2021, value: 110 },
      { Location: "Kern", Year: 2020, value: 90 },
      { Location: "Kern", Year: 2021, value: 95 },
    ];
    const expected = buildMatrix(canonicalRows, "value");

    expect(buildShapes(table, spec)).toEqual(expected);
  });

  it("carries row groups as a parallel matrix attribute for dot plots", () => {
    const table = {
      columns: [
        { name: "Label", type: "text" },
        { name: "Section", type: "group" },
        { name: "Series", type: "text" },
        { name: "Value", type: "number" },
      ],
      rows: [
        ["Degree", "Education", "Women", "75"],
        ["Degree", "Education", "Men", "100"],
        ["Dentists", "Occupation", "Women", "140"],
        ["Dentists", "Occupation", "Men", "170"],
      ],
    };
    const result = buildShapes(table, {
      chartType: "dotPlot",
      bindings: { y: "Label", group: "Section", x: "Series", color: "Value" },
    });
    expect(result.matrix.y).toEqual(["Degree", "Dentists"]);
    expect(result.matrix.groups).toEqual(["Education", "Occupation"]);
  });
});

describe("buildShapes — geo (choropleth)", () => {
  it("returns a records/unmatched shape with unmatched always empty (no crosswalk)", () => {
    const table = inlineTable(
      ["County", "Population"],
      [
        ["Fresno", "100"],
        ["Kern", "90"],
      ],
    );
    const spec = { chartType: "choroplethMap", bindings: { geography: "County", color: "Population" } };
    const result = buildShapes(table, spec);
    expect(result.unmatched).toEqual([]);
    expect(result.records).toEqual([
      { location: "Fresno", value: 100 },
      { location: "Kern", value: 90 },
    ]);
  });
});

describe("buildShapes — unusable input", () => {
  it("returns an empty records shape for an unknown chart type", () => {
    expect(buildShapes(inlineTable(["A"], [["1"]]), { chartType: "notAChart" })).toEqual({
      records: [],
    });
  });

  it("returns an empty records shape when the table is missing", () => {
    expect(buildShapes(null, { chartType: "line" })).toEqual({ records: [] });
  });
});

describe("GraphTab filtering", () => {
  const data = {
    columns: [
      { name: "Region", type: "text" },
      { name: "Year", type: "date" },
      { name: "Value", type: "number" },
    ],
    rows: [
      ["North", "2024", "10"],
      ["", "2024", "99"],
      ["South", "2024", "20"],
      ["North", "2025", "12"],
    ],
  };

  it("lists nonblank values in first-seen order and honors saved reordering", () => {
    expect(tabValues(data, "Region")).toEqual(["North", "South"]);
    expect(tabValues(data, "Region", ["South", "North"])).toEqual([
      "South",
      "North",
    ]);
  });

  it("filters rows and treats a null or missing column as a no-op", () => {
    expect(applyTabFilter(data, { tabColumn: "Region", tabValue: "South" }).rows).toEqual([
      ["South", "2024", "20"],
    ]);
    expect(applyTabFilter(data, { tabColumn: null, tabValue: null })).toBe(data);
    expect(applyTabFilter(data, { tabColumn: "Missing", tabValue: "x" })).toBe(data);
  });

  it("filters before every shape builder dispatch", () => {
    const result = buildShapes(data, {
      chartType: "line",
      bindings: { x: "Year", y: "Value" },
      filters: { tabColumn: "Region", tabValue: "North" },
      period: {},
    });
    expect(result.series[0].values).toEqual([10, 12]);
  });

  it("composes tab filtering with category sectioning", () => {
    const table = {
      columns: [
        { name: "Region", type: "text" },
        { name: "Label", type: "text" },
        { name: "Section", type: "group" },
        { name: "Value", type: "number" },
      ],
      rows: [
        ["North", "Degree", "Education", "10"],
        ["North", "Dentists", "Occupation", "20"],
        ["South", "Degree", "Education", "30"],
      ],
    };
    const result = buildShapes(table, {
      chartType: "bar",
      bindings: { category: "Label", group: "Section", y: "Value" },
      filters: { tabColumn: "Region", tabValue: "North" },
      appearance: {},
    });
    expect(result.records).toEqual([
      expect.objectContaining({ category: "Degree", group: "Education", value: 10 }),
      expect.objectContaining({ category: "Dentists", group: "Occupation", value: 20 }),
    ]);
  });
});

describe("supportedShapes", () => {
  it("supports bar/heatmap/choropleth for a text+number+date table", () => {
    const table = {
      columns: [
        { name: "County", type: "text" },
        { name: "Period", type: "date" },
        { name: "Population", type: "number" },
      ],
    };
    const supported = supportedShapes(table);
    expect(supported).toContain("bar");
    expect(supported).toContain("heatmap");
    expect(supported).toContain("choroplethMap");
  });

  it("supports scatter/bubble for a table with three or more number columns", () => {
    const table = {
      columns: [
        { name: "X", type: "number" },
        { name: "Y", type: "number" },
        { name: "Size", type: "number" },
      ],
    };
    const supported = supportedShapes(table);
    expect(supported).toContain("scatter");
    expect(supported).toContain("bubble");
  });

  it("does not support bar/choropleth for a table with no text or date column", () => {
    const table = { columns: [{ name: "X", type: "number" }, { name: "Y", type: "number" }] };
    const supported = supportedShapes(table);
    expect(supported).not.toContain("bar");
    expect(supported).not.toContain("choroplethMap");
  });

  it("counts a group-typed column as a dimension", () => {
    const table = {
      columns: [
        { name: "Section", type: "group" },
        { name: "Value", type: "number" },
      ],
    };
    expect(supportedShapes(table)).toEqual(
      expect.arrayContaining(["bar", "choroplethMap"]),
    );
  });
});
