/**
 * Workstream 10: real store and real callers; only the editor is a callback
 * driver. Bulk operations emit once in SpreadsheetGrid.test.js; this verifies
 * one emitted table is one undo step all the way through both caller adapters.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/components/chart-builder/InputTableEditor", () => ({
  default: ({ table, onChange, onUndo, onRedo }) => <div>
    <button onClick={() => onChange({ ...table, rows: table.rows.map((row, i) => i < 2 ? row.map((value, c) => c === 1 ? `${value} edited` : value) : row) })}>Bulk grid edit</button>
    <button onClick={onUndo}>Grid undo</button>
    <button onClick={onRedo}>Grid redo</button>
  </div>,
}));
vi.mock("@/components/chart-builder/DataSourcePanel", () => ({ default: () => null }));
vi.mock("@/components/chart-builder/ConfigActions", () => ({ ImportConfigButton: () => null }));
vi.mock("@/components/chart-builder/wizard/PreviewPane", () => ({ default: () => <div>Chart preview</div> }));
vi.mock("@/components/chart-builder/wizard/PreviewContext", () => ({
  usePreview: () => ({ status: "ready", result: null, graphDivRef: { current: null } }),
}));

import { ChartConfigProvider, useChartConfig } from "@/components/chart-builder/chartConfigStore";
import ImportStep from "@/components/chart-builder/wizard/steps/ImportStep";
import EditPreview from "@/components/chart-builder/wizard/EditPreview";
import { EditDataProvider } from "@/components/chart-builder/wizard/EditDataContext";
import { BYOD_SCHEMA } from "@/lib/visualization/moduleRegistry";
import { fixtureTable, importInline } from "@/tests/fixtures/byod-shapes/helpers";

function Probe() {
  const { config } = useChartConfig();
  return <pre data-testid="grid-history-state">{JSON.stringify({ table: config.question.dataset.inline, presentation: config.presentation })}</pre>;
}
const state = () => JSON.parse(screen.getByTestId("grid-history-state").textContent);

it.each(["Import", "Edit Data"])("undoes and redoes a bulk edit in one step from %s", async (view) => {
  const table = await fixtureTable("two-labels-shares");
  render(<ChartConfigProvider schema={BYOD_SCHEMA} initialConfig={importInline(table)} autoBind>
    <EditDataProvider>{view === "Import" ? <ImportStep /> : <EditPreview />}<Probe /></EditDataProvider>
  </ChartConfigProvider>);
  if (view === "Edit Data") fireEvent.click(screen.getByRole("button", { name: "Edit Data" }));
  const before = state();
  fireEvent.click(screen.getByRole("button", { name: "Bulk grid edit" }));
  const after = state();
  expect(after.table.rows[0][1]).toBe(`${before.table.rows[0][1]} edited`);
  expect(after.table.rows[1][1]).toBe(`${before.table.rows[1][1]} edited`);
  expect(after.presentation).toEqual(before.presentation);
  fireEvent.click(screen.getByRole("button", { name: "Grid undo" }));
  expect(state()).toEqual(before);
  fireEvent.click(screen.getByRole("button", { name: "Grid redo" }));
  expect(state()).toEqual(after);
  if (view === "Edit Data") {
    fireEvent.click(screen.getByRole("button", { name: "View Chart" }));
    expect(screen.getByText("Chart preview")).toBeInTheDocument();
    expect(state()).toEqual(after);
  }
});
