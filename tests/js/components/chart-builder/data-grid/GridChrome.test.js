/** Workstream 9: toolbar, menus, formula and status bars through the real grid. */
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SpreadsheetGrid from "@/components/chart-builder/data-grid/SpreadsheetGrid";
import { parsePaste } from "@/lib/tabular/parseTable";
import { gridTable } from "@/tests/fixtures/spreadsheet-grid";
import { active, button, cell, drag, editor, grid, key, letter, menuItem, more, mountGrid, rowHeader, select, selected } from "./spreadsheetTestUtils";

beforeEach(() => vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel"));
afterEach(() => vi.restoreAllMocks());
const mount = (props) => mountGrid(SpreadsheetGrid, props);

it("adds a row and a column next to the selection", () => {
  const view = mount();
  select(cell(3, 2));
  fireEvent.click(button("Add row"));
  expect(view.changed).toHaveBeenCalledTimes(1);
  expect(view.next().rows).toEqual([["North", "40", "60"], ["South", "30", "70"], ["", "", ""], ["West", "20", "80"]]);
  select(cell(3, 2));
  fireEvent.click(button("Add column"));
  expect(view.changed).toHaveBeenCalledTimes(2);
  expect(view.next().columns.map((c) => c.name)).toEqual(["Region", "Yes", "Column 4", "No"]);
  expect(view.next().rows[0]).toEqual(["North", "40", "", "60"]);
});

it("deletes the selected rows", () => {
  const view = mount();
  select(rowHeader(2));
  select(rowHeader(4), { metaKey: true });
  fireEvent.click(button("Delete row"));
  expect(view.changed).toHaveBeenCalledTimes(1);
  expect(view.next().rows).toEqual([["South", "30", "70"]]);
});

it("does not delete rows when a column or the header is selected, and explains why", () => {
  const view = mount();
  select(letter("B"));
  fireEvent.click(button("Delete row"));
  expect(view.changed).not.toHaveBeenCalled();
  expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(/select.*row|column.*selected/i);
  select(rowHeader(1));
  fireEvent.click(button("Delete row"));
  expect(view.changed).not.toHaveBeenCalled();
  expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(/header/i);
});

it("sorts by the active column both ways", () => {
  const view = mount();
  select(cell(2, 2));
  fireEvent.click(button("Sort"));
  fireEvent.click(menuItem("A to Z"));
  expect(view.changed).toHaveBeenCalledTimes(1);
  expect(view.next().rows.map((r) => r[0])).toEqual(["West", "South", "North"]);
  fireEvent.click(button("Sort"));
  fireEvent.click(menuItem("Z to A"));
  expect(view.changed).toHaveBeenCalledTimes(2);
  expect(view.next().rows.map((r) => r[0])).toEqual(["North", "South", "West"]);
});

it("inserts a formula column and opens its first cell with =", () => {
  const view = mount();
  select(cell(3, 2));
  fireEvent.click(button("Derived column"));
  expect(view.changed).toHaveBeenCalledTimes(1);
  expect(view.next().columns.map((c) => c.name)).toEqual(["Region", "Yes", "Formula 1", "No"]);
  active(2, 3);
  expect(editor()).toHaveValue("=");
  expect(editor()).toHaveFocus();
});

it("shows All columns valid, or selects the cells that need attention", () => {
  const valid = mount();
  expect(button("All columns valid")).toBeInTheDocument();
  valid.unmount();
  const initial = gridTable();
  initial.rows[0][1] = "bad";
  initial.rows[2][2] = "also bad";
  mount({ initial });
  fireEvent.click(screen.getByRole("button", { name: /2.*(malformed|attention)/i }));
  selected(2, 2); selected(4, 3);
  selected(3, 2, false);
});

it("writes the selection's address in the formula bar", () => {
  mount();
  select(cell(3, 2));
  expect(screen.getByRole("textbox", { name: "Cell B3" })).toHaveValue("30");
  drag(cell(2, 2), cell(4, 3));
  expect(screen.getByText("B2:C4", { exact: true })).toBeInTheDocument();
  select(rowHeader(3));
  expect(screen.getByText("Row 3", { exact: true })).toBeInTheDocument();
  select(letter("C"));
  expect(screen.getByText("Column C", { exact: true })).toBeInTheDocument();
});

it("commits formulas from the formula bar and cancels a draft with Esc", () => {
  const view = mount();
  select(cell(2, 3));
  const bar = screen.getByRole("textbox", { name: "Cell C2" });
  fireEvent.change(bar, { target: { value: "=B2*3" } });
  expect(view.changed).not.toHaveBeenCalled();
  fireEvent.keyDown(bar, { key: "Enter" });
  expect(view.changed).toHaveBeenCalledTimes(1);
  expect(view.next().formulas).toEqual({ "0:2": "=B2*3" });
  expect(cell(2, 3)).toHaveTextContent("120");
  select(cell(2, 3));
  const again = screen.getByRole("textbox", { name: "Cell C2" });
  expect(again).toHaveValue("=B2*3");
  fireEvent.change(again, { target: { value: "999" } });
  fireEvent.keyDown(again, { key: "Escape" });
  fireEvent.blur(again);
  expect(view.changed).toHaveBeenCalledTimes(1);
});

it("shows Sum, Average, and Count for a numeric selection and Count otherwise", () => {
  mount();
  const status = screen.getByRole("status", { name: "Selection statistics" });
  expect(screen.getByText(/3 rows · 3 columns · Double-click a cell to edit/)).toBeInTheDocument();
  drag(cell(2, 2), cell(4, 2));
  expect(status).toHaveTextContent(/Sum\s*90/);
  expect(status).toHaveTextContent(/Average\s*30/);
  expect(status).toHaveTextContent(/Count\s*3/);
  drag(cell(2, 1), cell(4, 1));
  expect(status).toHaveTextContent(/Count\s*3/);
  expect(status).not.toHaveTextContent(/Sum|Average/);
  select(cell(2, 1));
  expect(status).not.toHaveTextContent(/Sum|Average|Count/);
});

it("opens the cell, row, and column menus and acts on the selection", () => {
  const view = mount();
  drag(cell(2, 2), cell(3, 3));
  fireEvent.contextMenu(cell(3, 2));
  for (const name of ["Cut", "Copy", "Paste", "Paste values only", "Insert row above", "Insert row below", "Insert column left", "Insert column right", "Delete rows", "Delete columns", "Clear", "Sort A to Z", "Sort Z to A", "Sort selected range"]) {
    expect(menuItem(name)).toBeInTheDocument();
  }
  fireEvent.click(menuItem("Clear"));
  expect(view.changed).toHaveBeenCalledTimes(1);
  expect(view.next().rows.slice(0, 2)).toEqual([["North", "", ""], ["South", "", ""]]);
  fireEvent.contextMenu(rowHeader(4));
  fireEvent.click(menuItem("Mark as total"));
  expect(view.next().rowMarks).toEqual({ 2: "total" });
  fireEvent.contextMenu(rowHeader(4));
  fireEvent.click(menuItem("Include in chart"));
  expect(view.next().rowMarks).toEqual({});
  fireEvent.contextMenu(letter("A"));
  for (const name of ["Rename", "Kind", "Hide", "Fit width"]) expect(menuItem(name)).toBeInTheDocument();
  fireEvent.click(menuItem("Hide"));
  expect(grid().querySelector('[data-column-letter="A"]')).toBeNull();
});

it("right-clicking outside a selection replaces it before acting", () => {
  const view = mount();
  drag(cell(2, 2), cell(3, 3));
  fireEvent.contextMenu(cell(4, 1));
  fireEvent.click(menuItem("Clear"));
  expect(view.next().rows).toEqual([["North", "40", "60"], ["South", "30", "70"], ["", "20", "80"]]);
});

it("sorts the selected rectangle from the context menu without moving neighboring cells", () => {
  const view = mount();
  drag(cell(2, 2), cell(3, 2));
  fireEvent.contextMenu(cell(2, 2));
  fireEvent.click(menuItem("Sort selected range"));
  fireEvent.click(menuItem("A to Z"));
  expect(view.changed).toHaveBeenCalledTimes(1);
  expect(view.next().rows).toEqual([["North", "30", "60"], ["South", "40", "70"], ["West", "20", "80"]]);
});

it("opens context menus from Shift+F10 and the context-menu key", () => {
  mount();
  select(cell(2, 2));
  key("F10", { shiftKey: true });
  expect(menuItem("Clear")).toBeVisible();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  key("ContextMenu");
  expect(menuItem("Clear")).toBeVisible();
});

it("switches the shortcut scheme and lists its keys", async () => {
  const user = userEvent.setup();
  const view = mount();
  more();
  fireEvent.click(menuItem("Keyboard shortcuts"));
  const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
  expect(within(dialog).getByRole("table")).toHaveTextContent("⌘");
  await user.click(within(dialog).getByRole("combobox", { name: "Spreadsheet Type" }));
  await user.click(screen.getByRole("option", { name: "Excel" }));
  expect(localStorage.getItem("visualizationTool.gridShortcutScheme")).toBe("excel");
  const editRow = within(dialog).getByText("Edit the active cell").closest("tr");
  expect(editRow).toHaveTextContent("F2");
  expect(editRow).not.toHaveTextContent("Enter");
  view.unmount();
  mount();
  select(cell(2, 2));
  key("Enter");
  active(3, 2);
});

it("keeps Import settings, Transpose, Show hidden, and Revert in More", async () => {
  const { value: initial } = await parsePaste("Region\tYes\tNo\nNorth\t40\t60\nSouth\t30\t70");
  const onRevert = vi.fn();
  const view = mount({ initial, onRevert });
  fireEvent.contextMenu(letter("B"));
  fireEvent.click(menuItem("Hide"));
  more();
  for (const name of ["Import settings", "Transpose", "Show hidden columns", "Revert to original", "Keyboard shortcuts"]) expect(menuItem(name)).toBeInTheDocument();
  fireEvent.click(menuItem("Show hidden columns"));
  expect(letter("B")).toBeInTheDocument();
  more();
  fireEvent.click(menuItem("Transpose"));
  expect(view.next().rows).not.toEqual(initial.rows);
  expect(view.changed).toHaveBeenCalledTimes(1);
  more();
  fireEvent.click(menuItem("Revert to original"));
  expect(onRevert).toHaveBeenCalledTimes(1);
});

it("sets a kind from its pill and keeps that choice through transpose", async () => {
  const user = userEvent.setup();
  const view = mount();
  await user.click(screen.getByRole("combobox", { name: "Kind for Region" }));
  await user.click(screen.getByRole("option", { name: "Group" }));
  expect(view.next().columns[0]).toMatchObject({ type: "group", forced: true });
  more(); fireEvent.click(menuItem("Transpose"));
  more(); fireEvent.click(menuItem("Transpose"));
  expect(view.next().columns[0]).toMatchObject({ name: "Region", type: "group", forced: true });
});

it("uses a row as the header and keeps row marking available", () => {
  const view = mount();
  fireEvent.contextMenu(rowHeader(2));
  fireEvent.click(menuItem("Use as header row"));
  expect(view.next().columns.map((c) => c.name)).toEqual(["North", "40", "60"]);
  expect(view.next().rows).toEqual([["South", "30", "70"], ["West", "20", "80"]]);
  fireEvent.contextMenu(rowHeader(2));
  fireEvent.click(menuItem("Leave out of chart"));
  expect(view.next().rowMarks).toEqual({ 0: "excluded" });
  expect(rowHeader(2)).toHaveTextContent("Left out");
});

it("reads Import settings again from raw input and keeps forced kinds", async () => {
  const user = userEvent.setup();
  const { value } = await parsePaste("Survey\t\nRegion\tJobs\nNorth\t12\nSouth\t14");
  const initial = { ...value, columns: value.columns.map((column) => column.name === "Jobs" ? { ...column, type: "number", unit: "percent", forced: true, unitForced: true } : column) };
  const view = mount({ initial });
  more(); fireEvent.click(menuItem("Import settings"));
  await user.click(screen.getByRole("combobox", { name: "Header row" }));
  await user.click(screen.getByRole("option", { name: "Line 2" }));
  await user.click(button("Read again"));
  await vi.waitFor(() => expect(view.changed).toHaveBeenCalledTimes(1));
  expect(view.next().columns.map((c) => c.name)).toEqual(["Region", "Jobs"]);
  expect(view.next().columns[1]).toMatchObject({ type: "number", unit: "percent", forced: true });
  expect(view.next().rows).toEqual([["North", "12"], ["South", "14"]]);
});
