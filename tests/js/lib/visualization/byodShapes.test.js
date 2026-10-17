import React from "react";
import { describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { expectations } from "@/tests/fixtures/byod-shapes/expectations";
import { fixtureText, importInline, modelInput, dispatchInline } from "@/tests/fixtures/byod-shapes/helpers";
import { parsePaste } from "@/lib/tabular/parseTable";
import { executeInlineQuestion } from "@/lib/tabular/toObservations";
import { deriveLabels } from "@/lib/visualization/deriveLabels";
import { BYOD_SCHEMA } from "@/lib/visualization/moduleRegistry";
import { buildChartModel } from "@/lib/visualization/models";
import { inlineRenderBlock } from "@/lib/visualization/inlineMapping";
import { VISX_CHART_TYPES } from "@/lib/visualization/chartRegistry";
import ChartRenderer from "@/components/charts/ChartRenderer";

async function imported(entry) {
  const parsed = await parsePaste(fixtureText(entry.id));
  expect(parsed.errors).toEqual([]);
  expect(parsed.value).not.toBeNull();
  return { table: parsed.value, config: importInline(parsed.value) };
}
function assertDrawing(config) {
  const result = executeInlineQuestion(config);
  expect(result.status).not.toBe("blocked");
  expect(result.observations.some(row => row.status === "available")).toBe(true);
  const model = buildChartModel(modelInput(config, result));
  const view = render(<ChartRenderer result={{ renderer: "visx", chartType: config.presentation.chartType, model }} width={800} height={450} />);
  expect(view.container.querySelector('[data-chart-ready="true"]')).not.toBeNull();
  expect(view.container.querySelector('svg[role="img"]')).not.toBeNull();
  expect(view.queryByText("Visualization could not be loaded")).not.toBeInTheDocument();
  cleanup();
}
function withoutConsoleErrors(run) {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    run();
    expect(error.mock.calls).toEqual([]);
    expect(warn.mock.calls.filter(args => /key|error/i.test(args.join(" ")))).toEqual([]);
  } finally { error.mockRestore(); warn.mockRestore(); }
}

describe.each(expectations)("$id", entry => {
  it("reads every column as the expected type and unit", async () => {
    const { table } = await imported(entry);
    expect(table.columns).toHaveLength(entry.columns.length);
    entry.columns.forEach((column, index) => expect(table.columns[index]).toMatchObject(column));
  });
  it("picks the expected chart, mapping, and presets", async () => {
    const { config, table } = await imported(entry);
    expect(config.presentation.chartType).toBe(entry.chartType);
    expect(config.question.dataset.bindings).toEqual(entry.bindings);
    expect(config.presentation.appearance).toMatchObject(entry.appearance);
    expect(config.question.dataset.inline).toEqual(table); // Import never melts the stored table.
  });
  it("raises exactly the expected warnings", async () => {
    const { config } = await imported(entry);
    const result = executeInlineQuestion(config);
    expect(result.issues.map(issue => issue.code).sort()).toEqual([...entry.warnings].sort());
    for (const issue of result.issues) expect(issue.level).toBe("warning");
  });
  it("derives the expected title and axis labels", async () => {
    const { config } = await imported(entry);
    expect(deriveLabels(config, BYOD_SCHEMA)).toMatchObject(entry.labels);
  });
  it("renders without a React key warning or an error", async () => {
    const { config } = await imported(entry);
    // Assert the requested chart too: rendering the old, incorrectly chosen chart is not a pass.
    expect(config.presentation.chartType).toBe(entry.chartType);
    withoutConsoleErrors(() => assertDrawing(config));
  });
  it("renders without a React key warning on every chart it can switch to", async () => {
    const { config, table } = await imported(entry);
    const rendered = [];
    withoutConsoleErrors(() => {
      for (const chartType of VISX_CHART_TYPES) {
        const switched = dispatchInline(config, { type: "SET_CHART_TYPE", chartType });
        if (inlineRenderBlock(chartType, table, switched.question.dataset.bindings)) continue;
        assertDrawing(switched);
        rendered.push(chartType);
      }
    });
    expect(rendered).toContain(entry.chartType); // Prevent an empty compatibility loop from passing.
  });
});
