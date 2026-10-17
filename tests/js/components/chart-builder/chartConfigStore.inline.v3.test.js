/**
 * The v3 store on bring-your-own-data: importing a table, mapping a column,
 * and switching charts each re-derive the question from the table rather than
 * asking the reader to restate it.
 */

import { describe, expect, it } from "vitest";

import {
  createChartConfig,
  reduceChartConfig,
} from "@/components/chart-builder/chartConfigStore";
import { getDefaultQuestion } from "@/lib/visualization/defaultQuestions";
import { BYOD_SCHEMA } from "@/lib/visualization/moduleRegistry";
import { missingQuestionSelections } from "@/lib/visualization/questionReadiness";
import { resolveEditorModel } from "@/lib/visualization/resolveEditorModel";

const TABLE = {
  columns: [
    { name: "Year", type: "date" },
    { name: "Region", type: "text" },
    { name: "Population", type: "number" },
  ],
  rows: [
    ["2020", "North", "100"],
    ["2021", "North", "150"],
    ["2020", "South", "80"],
    ["2021", "South", "120"],
  ],
  issues: [],
};

const options = { autoBind: true };
const dispatch = (config, action) => reduceChartConfig(config, action, BYOD_SCHEMA, options);
const fresh = () => createChartConfig(BYOD_SCHEMA, getDefaultQuestion("byod"), options);
const imported = () =>
  dispatch(fresh(), { type: "SET_DATA_SOURCE", source: "inline", inline: TABLE, defaultChart: true });

describe("the standalone tool opens on an inline v3 question", () => {
  it("starts with no table and waits for one", () => {
    const config = fresh();
    expect(config.version).toBe(3);
    expect(config.question.dataset).toEqual({ kind: "inline", inline: null, bindings: {} });
    expect(missingQuestionSelections(config, BYOD_SCHEMA)).toEqual(["Data"]);
  });

  it("derives the whole question from an imported table", () => {
    const config = imported();
    expect(config.presentation.chartType).toBe("line");
    expect(config.question.dataset.bindings).toEqual({ x: "Year", y: "Population", series: "Region" });
    expect(config.question.outcomes[0]).toMatchObject({ measureId: "Population", unit: "number" });
    expect(config.question.comparisons.map((entry) => entry.label)).toEqual(["North", "South"]);
    expect(config.question.time).toEqual({ contract: "range", startYear: 2020, endYear: 2021 });
    expect(missingQuestionSelections(config, BYOD_SCHEMA)).toEqual([]);
  });

  it("re-derives the question when a column is remapped and frees a column used twice", () => {
    const config = dispatch(imported(), { type: "SET_BINDING", role: "series", column: null });
    expect(config.question.dataset.bindings).toEqual({ x: "Year", y: "Population" });
    expect(config.question.comparisons.map((entry) => entry.label)).toEqual(["Population"]);

    const swapped = dispatch(imported(), { type: "SET_BINDING", role: "y", column: "Population" });
    expect(swapped.question.dataset.bindings.y).toBe("Population");
  });

  it("re-maps the columns and drops time when switching to a chart with no time axis", () => {
    const bar = dispatch(imported(), { type: "SET_CHART_TYPE", chartType: "bar" });
    expect(bar.question.dataset.bindings).toMatchObject({ category: "Region", y: "Population" });
    expect(bar.question.time).toEqual({ contract: "none" });
    expect(missingQuestionSelections(bar, BYOD_SCHEMA)).toEqual([]);

    // Back to a line: the time axis returns from the data, not a schema.
    const line = dispatch(bar, { type: "SET_CHART_TYPE", chartType: "line" });
    expect(line.question.time).toEqual({ contract: "range", startYear: 2020, endYear: 2021 });
  });

  it("names the columns a chart still needs in the reader's words", () => {
    // A dot plot needs a second dimension this table does not have.
    const dots = dispatch(imported(), { type: "SET_CHART_TYPE", chartType: "dotPlot" });
    expect(missingQuestionSelections(dots, BYOD_SCHEMA)).toEqual(["Series (dots)"]);
  });

  it("publishes the table's periods as the editor's time list and greys out maps", () => {
    const model = resolveEditorModel({ spec: imported(), schema: BYOD_SCHEMA });
    expect(model.time.availablePeriods).toEqual([2020, 2021]);
    expect(model.time.defaultPeriod).toBe(2021);
    const map = model.chartChoices.find((choice) => choice.id === "choroplethMap");
    expect(map.available).toBe(false);
    expect(map.reason).toMatch(/pasted data/i);
    expect(model.chartChoices.find((choice) => choice.id === "bar").available).toBe(true);
    // Pasted data can hold two measures, so the scatter variants stay offered.
    expect(model.chartChoices.find((choice) => choice.id === "scatter").available).toBe(true);
    expect(model.chartChoices.find((choice) => choice.id === "bubble").available).toBe(true);
  });

  it("keeps the chart on a plain table edit and re-maps on a fresh import", () => {
    const bar = dispatch(imported(), { type: "SET_CHART_TYPE", chartType: "bar" });
    const edited = dispatch(bar, { type: "SET_DATA_SOURCE", source: "inline", inline: TABLE });
    expect(edited.presentation.chartType).toBe("bar");
    expect(edited.question.dataset.inline).toEqual(TABLE);
  });
});

describe("the v3 Categories panel keeps the pie's slice names", () => {
  it("stores the preview's category names and keeps them through an appearance edit", () => {
    const withNames = dispatch(imported(), {
      type: "SET_SERIES_COUNT", count: 1, seriesNames: [], categoryNames: ["North", "South"],
    });
    expect(withNames.categoryNames).toEqual(["North", "South"]);
    const reordered = dispatch(withNames, { type: "SET_APPEARANCE", key: "categoryOrder", value: ["South", "North"] });
    expect(reordered.categoryNames).toEqual(["North", "South"]);
    expect(reordered.presentation.appearance.categoryOrder).toEqual(["South", "North"]);
  });
});

import { fixtureTable as datasetFixture } from "@/tests/fixtures/byod-shapes/helpers";
describe("dataset range: store", () => {
  it("SET_BINDING takes a list and keeps each column in one role", () => {
    const table = { ...TABLE, columns: [...TABLE.columns, { name: "Jobs", type: "number", unit: "number" }], rows: TABLE.rows.map(row => [...row, "25"]) };
    const start = dispatch(fresh(), { type: "SET_DATA_SOURCE", source: "inline", inline: table, defaultChart: true });
    const selected = dispatch(start, { type: "SET_BINDING", role: "y", columns: ["Population", "Jobs"] });
    expect(selected.question.dataset.bindings.y).toEqual(["Population", "Jobs"]);
    // Moving a listed column into another role must release it from y.
    const moved = dispatch(selected, { type: "SET_BINDING", role: "x", column: "Jobs" });
    expect(moved.question.dataset.bindings.x).toBe("Jobs");
    expect([moved.question.dataset.bindings.y].flat()).not.toContain("Jobs");
    const reclaimed = dispatch(moved, { type: "SET_BINDING", role: "y", columns: ["Population", "Jobs"] });
    expect(reclaimed.question.dataset.bindings.x).not.toBe("Jobs");
    expect(reclaimed.question.dataset.inline).toEqual(table);
  });
  it("a fresh import applies the first candidate's chart, mapping, and presets", async () => {
    const table = await datasetFixture("two-labels-shares");
    const config = dispatch(fresh(), { type: "SET_DATA_SOURCE", source: "inline", inline: table, defaultChart: true });
    expect(config.presentation.chartType).toBe("bar");
    expect(config.question.dataset.bindings).toEqual({ category: "Nation", y: ["I typically tip", "I do not typically tip, but I might sometimes tip", "Don't know", "I never tip"] });
    expect(config.presentation.appearance).toMatchObject({ orientation: "horizontal", stackMode: "percent", sort: "descending" });
  });
  it("a table edit keeps a chart that can still draw", () => {
    const bar = dispatch(imported(), { type: "SET_CHART_TYPE", chartType: "bar" });
    const edited = dispatch(bar, { type: "SET_DATA_SOURCE", source: "inline", inline: { ...TABLE, rows: [...TABLE.rows, ["2022", "South", "140"]] } });
    expect(edited.presentation.chartType).toBe("bar");
  });
  it("a table edit switches when the chart can no longer draw", async () => {
    const changed = dispatch(imported(), { type: "SET_DATA_SOURCE", source: "inline", inline: await datasetFixture("one-label-one-value") });
    expect(changed.presentation.chartType).toBe("bar");
    expect(changed.question.dataset.bindings).toEqual({ category: "Nation", y: ["Count"] });
    expect(changed.presentation.appearance.orientation).toBe("horizontal");
  });
});

it("uses captured source and notes in the chart's source box", async () => {
  const config = dispatch(fresh(), { type: "SET_DATA_SOURCE", source: "inline", inline: await datasetFixture("messy-export"), defaultChart: true });
  expect(config.presentation.appearance.showSource).toBe(true);
  expect(config.presentation.labels.footnote).toBe("Provisional estimates");
});

it("clears the pasted table when the reader removes their data", () => {
  // The Import step's Remove button sends SET_DATA_SOURCE with no table.
  const removed = dispatch(imported(), { type: "SET_DATA_SOURCE", source: "inline", inline: undefined });
  expect(removed.question.dataset).toEqual({ kind: "inline", inline: null, bindings: {} });
  expect(removed.question.outcomes).toEqual([]);
  expect(removed.question.comparisons).toEqual([]);
  expect(removed.question.time).toEqual({ contract: "none" });
  expect(removed.presentation.chartType).toBe(imported().presentation.chartType);
});
