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
    expect(config.question.outcome).toMatchObject({ measureId: "Population", unit: "number" });
    expect(config.question.comparisons.map((entry) => entry.label)).toEqual(["North", "South"]);
    expect(config.question.time).toEqual({ contract: "range", startYear: 2020, endYear: 2021 });
    expect(missingQuestionSelections(config, BYOD_SCHEMA)).toEqual([]);
  });

  it("re-derives the question when a column is remapped and frees a column used twice", () => {
    const config = dispatch(imported(), { type: "SET_BINDING", role: "series", column: null });
    expect(config.question.dataset.bindings).toEqual({ x: "Year", y: "Population" });
    expect(config.question.comparisons.map((entry) => entry.label)).toEqual(["Data"]);

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
  });

  it("keeps the chart on a plain table edit and re-maps on a fresh import", () => {
    const bar = dispatch(imported(), { type: "SET_CHART_TYPE", chartType: "bar" });
    const edited = dispatch(bar, { type: "SET_DATA_SOURCE", source: "inline", inline: TABLE });
    expect(edited.presentation.chartType).toBe("bar");
    expect(edited.question.dataset.inline).toEqual(TABLE);
  });
});
