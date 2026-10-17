/**
 * Standalone imported-table scrolling regressions.
 */

import React, { useState } from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { letter, menuItem, more } from "./data-grid/spreadsheetTestUtils";
import InputTableEditor from "@/components/chart-builder/InputTableEditor";

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({ config: { tier: "basic" } }),
}));

describe("InputTableEditor", () => {
  it("shows the table in the data grid, in a scrolling viewport", () => {
    render(
      <InputTableEditor
        table={{
          columns: [
            { name: "County", type: "text" },
            { name: "Population", type: "number" },
          ],
          rows: [["Alameda", "1671329"]],
          issues: [],
        }}
        onChange={vi.fn()}
      />,
    );

    // Import overhaul: the paged table of inputs became the data grid, which
    // scrolls (and virtualizes) inside its own fixed-height viewport.
    expect(screen.getByRole("grid", { name: "Editable imported data" })).toHaveClass("overflow-auto");
    expect(screen.getByRole("grid", { name: "Editable imported data" })).toBeInTheDocument();
  });
});

const typedTable = {
  columns: [
    { name: "County", type: "text" },
    { name: "Value", type: "number" },
  ],
  rows: [
    ["Alameda", "10"],
    ["Butte", "20"],
  ],
  issues: [],
};

function ControlledEditor() {
  const [table, setTable] = useState(typedTable);
  return <InputTableEditor table={table} onChange={setTable} />;
}

describe("InputTableEditor transpose types", () => {
  // Import overhaul: the type select became the header's Kind chip.
  async function forceCountyToGroup(user) {
    await user.click(screen.getByRole("combobox", { name: "Kind for County" }));
    await user.click(screen.getByRole("option", { name: "Group" }));
  }

  it("shows the forced type in the header select after a transpose", async () => {
    const user = userEvent.setup();
    render(<ControlledEditor />);
    await forceCountyToGroup(user);
    more();
    fireEvent.click(menuItem("Transpose"));

    expect(screen.getByRole("combobox", { name: "Kind for County" })).toHaveTextContent("group");
  });

  it("restores the forced type after transposing twice", async () => {
    const user = userEvent.setup();
    render(<ControlledEditor />);
    await forceCountyToGroup(user);
    more();
    fireEvent.click(menuItem("Transpose"));
    more();
    fireEvent.click(menuItem("Transpose"));

    expect(screen.getByRole("combobox", { name: "Kind for County" })).toHaveTextContent("group");
    expect(screen.getByRole("combobox", { name: "Kind for Value" })).toHaveTextContent("number");
  });

  it("clears hidden columns on transpose", () => {
    render(<ControlledEditor />);
    fireEvent.contextMenu(letter("A"));
    fireEvent.click(menuItem("Hide"));
    expect(screen.queryByRole("combobox", { name: "Kind for County" })).not.toBeInTheDocument();

    more();
    fireEvent.click(menuItem("Transpose"));
    expect(screen.getByRole("combobox", { name: "Kind for County" })).toBeInTheDocument();
  });
});

it("keeps a reader's Format choice when the table is profiled again", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  function Editor() {
    const [table, setTable] = useState(typedTable);
    return <InputTableEditor table={table} onChange={next => { changed(next); setTable(next); }} />;
  }
  render(<Editor />);
  // Import overhaul: the Format select became the header's Kind chip.
  await user.click(screen.getByRole("combobox", { name: "Kind for Value" }));
  await user.click(screen.getByRole("option", { name: "Percent" }));
  expect(changed.mock.lastCall[0].columns[1].unit).toBe("percent");
  // Reprofile through the editor's existing transpose round trip.
  more();
    fireEvent.click(menuItem("Transpose"));
  more();
    fireEvent.click(menuItem("Transpose"));
  expect(screen.getByRole("combobox", { name: "Kind for Value" })).toHaveTextContent("percent");
  expect(changed.mock.lastCall[0].columns[1].unit).toBe("percent");
});
