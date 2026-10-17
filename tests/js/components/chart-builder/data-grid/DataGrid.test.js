/** Import overhaul, phase 2: the Excel-lite data grid. */

import React, { useState } from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { cell as gridCell, editor, rowHeader, menuItem, more, select } from "./spreadsheetTestUtils";
import DataGrid from "@/components/chart-builder/data-grid/DataGrid";

const base = () => ({
  columns: [
    { name: "Region", type: "text" },
    { name: "Yes", type: "number", unit: "number" },
    { name: "No", type: "number", unit: "number" },
  ],
  rows: [["North", "40", "60"], ["South", "30", "70"]],
  issues: [],
});

function Controlled({ initial = base(), spy = () => {} }) {
  const [table, setTable] = useState(initial);
  return <DataGrid table={table} onChange={(next) => { spy(next); setTable(next); }} />;
}

const cell = (text) => screen.getAllByRole("gridcell").find((node) => node.textContent === text);

describe("DataGrid", () => {
  it("shows every value with spreadsheet row numbers and column letters", () => {
    render(<Controlled />);
    expect(screen.getByRole("grid", { name: "Editable imported data" })).toBeInTheDocument();
    expect(cell("North")).toBeInTheDocument();
    expect(cell("70")).toBeInTheDocument();
    // Row 1 is the header, so the first data row is row 2.
    expect(rowHeader(2)).toHaveTextContent("2");
    expect(rowHeader(3)).toHaveTextContent("3");
    for (const letter of ["A", "B", "C"]) expect(screen.getByText(letter, { selector: "[data-column-letter]" })).toBeInTheDocument();
    expect(gridCell(1, 1)).toHaveTextContent("Region");
  });

  it("edits the active cell from the formula bar and keeps its formula", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled spy={spy} />);
    await user.click(cell("40"));
    const bar = screen.getByRole("textbox", { name: "Cell B2" });
    expect(bar).toHaveValue("40");
    await user.clear(bar);
    await user.type(bar, "=B3*2{Enter}");
    const next = spy.mock.lastCall[0];
    expect(next.formulas).toEqual({ "0:1": "=B3*2" });
    expect(next.rows[0][1]).toBe("60");
    select(gridCell(2, 2));
    expect(screen.getByRole("textbox", { name: "Cell B2" })).toHaveValue("=B3*2");
  });

  it("pastes a block of cells from the active cell", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled spy={spy} />);
    await user.click(cell("North"));
    fireEvent.paste(cell("North"), { clipboardData: { getData: () => "East\t1\nWest\t2\nCentral\t3" } });
    expect(spy.mock.lastCall[0].rows).toEqual([["East", "1", "60"], ["West", "2", "70"], ["Central", "3", ""]]);
  });

  it("clears the active cell with Delete", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled spy={spy} />);
    await user.click(cell("40"));
    await user.keyboard("{Delete}");
    expect(spy.mock.lastCall[0].rows[0][1]).toBe("");
  });

  it("sets what a column is from its header chip", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled spy={spy} />);
    await user.click(screen.getByRole("combobox", { name: "Kind for Yes" }));
    await user.click(screen.getByRole("option", { name: "Percent" }));
    expect(spy.mock.lastCall[0].columns[1]).toMatchObject({ type: "number", unit: "percent", unitForced: true });
    await user.click(screen.getByRole("combobox", { name: "Kind for Region" }));
    await user.click(screen.getByRole("option", { name: "Ignore" }));
    expect(spy.mock.lastCall[0].columns[0].ignored).toBe(true);
  });

  it("leaves a row out of the chart from its row menu, and shows why", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled spy={spy} />);
    fireEvent.contextMenu(rowHeader(3));
    await user.click(screen.getByRole("menuitem", { name: "Leave out of chart" }));
    expect(spy.mock.lastCall[0].rowMarks).toEqual({ 1: "excluded" });
    expect(screen.getByText("Left out")).toBeInTheDocument();
    fireEvent.contextMenu(rowHeader(3));
    await user.click(screen.getByRole("menuitem", { name: "Include in chart" }));
    expect(spy.mock.lastCall[0].rowMarks).toEqual({});
  });

  it("uses a row as the header from its row menu", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled spy={spy} />);
    fireEvent.contextMenu(rowHeader(2));
    await user.click(screen.getByRole("menuitem", { name: "Use as header row" }));
    expect(spy.mock.lastCall[0].columns.map((column) => column.name)).toEqual(["North", "40", "60"]);
    expect(spy.mock.lastCall[0].rows).toEqual([["South", "30", "70"]]);
  });

  it("inserts and deletes rows from the row menu", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled spy={spy} />);
    fireEvent.contextMenu(rowHeader(2));
    await user.click(screen.getByRole("menuitem", { name: "Insert row below" }));
    expect(spy.mock.lastCall[0].rows).toEqual([["North", "40", "60"], ["", "", ""], ["South", "30", "70"]]);
    fireEvent.contextMenu(rowHeader(3));
    await user.click(screen.getByRole("menuitem", { name: "Delete rows" }));
    expect(spy.mock.lastCall[0].rows).toEqual([["North", "40", "60"], ["South", "30", "70"]]);
  });

  it("renames a column when its name is committed, not on every keystroke", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled spy={spy} />);
    fireEvent.doubleClick(gridCell(1, 2));
    const name = editor();
    await user.clear(name);
    await user.type(name, "Agree");
    expect(spy).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(spy.mock.lastCall[0].columns[1].name).toBe("Agree");
  });

  it("shows a formula cell's value and marks it", () => {
    const table = { ...base(), formulas: { "0:2": "=100-B2" } };
    render(<DataGrid table={table} onChange={() => {}} />);
    const formulaCell = cell("60");
    expect(within(formulaCell).getByTitle("=100-B2")).toBeInTheDocument();
  });
});

describe("Import settings", () => {
  it("reads the table again with a chosen header row", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    const { parsePaste } = await import("@/lib/tabular/parseTable");
    const { value } = await parsePaste("Survey\t\nRegion\tJobs\nNorth\t12\n");
    render(<Controlled initial={{ ...value, columns: value.columns.map((c, i) => ({ ...c, name: `Wrong ${i}` })) }} spy={spy} />);
    more();
    fireEvent.click(menuItem("Import settings"));
    await user.click(screen.getByRole("combobox", { name: "Header row" }));
    await user.click(screen.getByRole("option", { name: "Line 2" }));
    await user.click(screen.getByRole("button", { name: "Read again" }));
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.lastCall[0].columns.map((c) => c.name)).toEqual(["Region", "Jobs"]);
  });

  it("is not offered when the raw import was not kept", () => {
    render(<Controlled />);
    more();
    expect(menuItem("Import settings")).toHaveAttribute("data-disabled");
  });
});
