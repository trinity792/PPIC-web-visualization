/** Workstream 10's adapter contract, independent of the not-yet-built grid. */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { gridTable } from "@/tests/fixtures/spreadsheet-grid";

vi.mock("@/components/chart-builder/data-grid/DataGrid", () => ({
  default: ({ onUndo, onRedo }) => <div>
    <button onClick={onUndo}>Grid undo</button>
    <button onClick={onRedo}>Grid redo</button>
  </div>,
}));
import InputTableEditor from "@/components/chart-builder/InputTableEditor";

it("passes undo and redo through InputTableEditor to the grid", () => {
  const onUndo = vi.fn();
  const onRedo = vi.fn();
  render(<InputTableEditor table={gridTable()} onChange={vi.fn()} onUndo={onUndo} onRedo={onRedo} />);
  fireEvent.click(screen.getByRole("button", { name: "Grid undo" }));
  fireEvent.click(screen.getByRole("button", { name: "Grid redo" }));
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(onRedo).toHaveBeenCalledTimes(1);
});
