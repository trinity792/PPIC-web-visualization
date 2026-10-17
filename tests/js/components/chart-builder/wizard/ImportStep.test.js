import React from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChartConfigProvider, useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { BYOD_SCHEMA } from "@/lib/visualization/moduleRegistry";
import { fixtureTable, importInline } from "@/tests/fixtures/byod-shapes/helpers";
import ImportStep from "@/components/chart-builder/wizard/steps/ImportStep";
import userEvent from "@testing-library/user-event";
import { parsePaste } from "@/lib/tabular/parseTable";
import { coerceColumn } from "@/lib/tabular/columnTypes";
import { gridTable } from "@/tests/fixtures/spreadsheet-grid";
import { cell, editor, enter, select } from "../data-grid/spreadsheetTestUtils";

// Keep the actual import sidebar, provider, parser and reducer; only peripheral
// import/export controls are replaced so this never touches a file picker.
vi.mock("@/components/chart-builder/DataSourcePanel", () => ({ default: () => null }));
vi.mock("@/components/chart-builder/ConfigActions", () => ({ ImportConfigButton: () => null }));
function Probe() {
  const { config } = useChartConfig();
  return <pre data-testid="table-state">{JSON.stringify(config.question.dataset.inline)}</pre>;
}
const currentTable = () => JSON.parse(screen.getByTestId("table-state").textContent);
it("keeps a committed formula through the store and a subsequent selection", () => {
  render(<ChartConfigProvider schema={BYOD_SCHEMA} initialConfig={importInline(gridTable())} autoBind><ImportStep /><Probe /></ChartConfigProvider>);
  fireEvent.doubleClick(cell(2, 3));
  expect(editor()).toBeInTheDocument();
  enter("=B2*2");
  expect(currentTable().formulas).toEqual({ "0:2": "=B2*2" });
  select(cell(2, 3));
  expect(screen.getByRole("textbox", { name: "Cell C2" })).toHaveValue("=B2*2");
});
it("removes the Check section and its findings", async () => {
  const table = await fixtureTable("messy-export");
  render(<ChartConfigProvider schema={BYOD_SCHEMA} initialConfig={importInline(table)} autoBind><ImportStep /><Probe /></ChartConfigProvider>);
  expect(screen.queryByText("Check", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Findings" })).not.toBeInTheDocument();
});

it("lets users choose slash date order while keeping their edited table", async () => {
  const user = userEvent.setup();
  const table = (await parsePaste("Date\tValue\n10/4/26\t20\n11/5/26\t30")).value;
  table.rows[0][1] = "25";
  table.formulas = { "1:1": "=B2+5" };
  table.rowMarks = { 1: "total" };
  render(<ChartConfigProvider schema={BYOD_SCHEMA} initialConfig={importInline(table)} autoBind><ImportStep /><Probe /></ChartConfigProvider>);
  expect(screen.getByText("10/4/26 is read as October 4, 2026.")).toBeInTheDocument();
  await user.click(screen.getByRole("combobox", { name: "Date format" }));
  await user.click(screen.getByRole("option", { name: "Day / month / year" }));
  expect(screen.getByText("10/4/26 is read as April 10, 2026.")).toBeInTheDocument();
  const changed = currentTable();
  expect(changed.meta.importOptions.dateOrder).toBe("dmy");
  expect(changed.columns[0]).toMatchObject({ type: "date", dateOrder: "dmy" });
  expect(changed.rows).toEqual(table.rows);
  expect(changed.formulas).toEqual(table.formulas);
  expect(changed.rowMarks).toEqual(table.rowMarks);
  expect(coerceColumn([changed.rows[0][0]], "date", changed.columns[0]).values[0]).toBe(Date.UTC(2026, 3, 10));
});
