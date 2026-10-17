/**
 * Import overhaul: tables the import misreads, and the one grid action that
 * puts each right. Every case checks that the chart and its mapping recover.
 */

import { describe, expect, it } from "vitest";

import { parsePaste } from "@/lib/tabular/parseTable";
import { markRows, promoteRowToHeader, setColumnKind } from "@/lib/tabular/tableEdits";
import { executeInlineQuestion } from "@/lib/tabular/toObservations";
import { inlineRenderBlock } from "@/lib/visualization/inlineMapping";
import { profileTable, rankInlineCharts } from "@/lib/visualization/inlineProfile";
import { guessInlineBindings } from "@/lib/visualization/inlineQuestion";
import { dispatchInline, importInline } from "@/tests/fixtures/byod-shapes/helpers";

const paste = async (text) => (await parsePaste(text)).value;
const edit = (config, table) => dispatchInline(config, { type: "SET_DATA_SOURCE", source: "inline", inline: table });

describe("a misread table, fixed in the grid", () => {
  it("recovers from a wrong header row with Use as header row", async () => {
    // A two-cell title line reads as the header, and the real header as data.
    const table = await paste("Jobs report\tby region\nRegion\tJobs\nNorth\t12\nSouth\t14\n");
    expect(table.columns.map((c) => c.name)).toEqual(["Jobs report", "by region"]);
    const fixed = edit(importInline(table), promoteRowToHeader(table, 0));
    expect(fixed.question.dataset.inline.columns.map((c) => c.name)).toEqual(["Region", "Jobs"]);
    expect(fixed.question.dataset.bindings).toMatchObject({ category: "Region" });
    const result = executeInlineQuestion(fixed);
    expect(result.observations.map((row) => row.value)).toEqual([12, 14]);
  });

  it("recovers a time axis when years with an ambiguous header are set to Time", async () => {
    const table = await paste("Label\tPopulation\n2019\t100\n2020\t110\n2021\t125\n");
    expect(table.columns[0].type).toBe("text");
    expect(rankInlineCharts(profileTable(table))[0].chartType).toBe("bar");
    const fixed = setColumnKind(table, 0, "time");
    expect(rankInlineCharts(profileTable(fixed))[0].chartType).toBe("line");
    expect(inlineRenderBlock("line", fixed, guessInlineBindings("line", fixed))).toBeNull();
  });

  it("automatically maps a named Year column to a line chart's time axis", async () => {
    const table = await paste("Year\tPopulation\n2019\t100\n2020\t110\n2021\t125\n");
    const config = importInline(table);
    expect(table.columns[0]).toMatchObject({ type: "date", granularity: "year" });
    expect(config.presentation.chartType).toBe("line");
    expect(config.question.dataset.bindings).toMatchObject({ x: "Year", y: ["Population"] });
    expect(executeInlineQuestion(config).observations.map((row) => row.value)).toEqual([100, 110, 125]);
  });

  it("recovers parts of a whole when a stray total row is marked", async () => {
    const table = await paste("Nation\tYes\tNo\tUnsure\nBritain\t40\t50\t10\nFrance\t30\t60\t10\nAll nations\t70\t110\t20\n");
    expect(rankInlineCharts(profileTable(table))[0].appearance.stackMode).toBe("none");
    const fixed = markRows(table, [2], "total");
    const top = rankInlineCharts(profileTable(fixed))[0];
    expect(top).toMatchObject({ chartType: "bar", appearance: { stackMode: "percent" } });
    const config = edit(importInline(table), fixed);
    expect(executeInlineQuestion(config).observations.every((row) => row.categoryLabel !== "All nations")).toBe(true);
  });
});
