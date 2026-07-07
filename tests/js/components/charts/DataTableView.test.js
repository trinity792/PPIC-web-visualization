/**
 * Tests for components/charts/DataTableView.js - Phase 6's dataTable chart
 * renderer. The component generalizes the landing RegionTable pattern over a
 * displayed table object.
 */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import DataTableView from "@/components/charts/DataTableView";

const table = {
  columns: [
    { name: "Location", type: "text" },
    { name: "Population", type: "number" },
    { name: "Housing units", type: "number" },
  ],
  rows: [
    ["Alameda", 1682000, 625000],
    ["Butte", 207000, 95000],
    ["Fresno", 1008000, 330000],
  ],
};

describe("DataTableView", () => {
  it("renders headers and formatted cells from a displayed table", () => {
    render(<DataTableView table={table} format={{}} appearance={{ pageSize: 25 }} />);

    expect(screen.getByRole("columnheader", { name: "Location" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Population" })).toBeInTheDocument();
    expect(screen.getByText("Alameda")).toBeInTheDocument();
    expect(screen.getByText("1,682,000")).toBeInTheDocument();
  });

  it("filters rows through the search input when appearance.search is enabled", async () => {
    const user = userEvent.setup();
    render(<DataTableView table={table} format={{}} appearance={{ search: true, pageSize: 25 }} />);

    await user.type(screen.getByRole("searchbox", { name: /search/i }), "butte");

    expect(screen.getByText("Butte")).toBeInTheDocument();
    expect(screen.queryByText("Alameda")).not.toBeInTheDocument();
    expect(screen.queryByText("Fresno")).not.toBeInTheDocument();
  });

  it("sorts by a clicked numeric header when appearance.sortable is enabled", async () => {
    const user = userEvent.setup();
    render(<DataTableView table={table} format={{}} appearance={{ sortable: true, pageSize: 25 }} />);

    await user.click(screen.getByRole("button", { name: /population/i }));

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Butte");
    expect(rows[1]).toHaveTextContent("Fresno");
    expect(rows[2]).toHaveTextContent("Alameda");
  });

  it("paginates rows according to appearance.pageSize", async () => {
    const user = userEvent.setup();
    render(<DataTableView table={table} format={{}} appearance={{ pageSize: 2 }} />);

    expect(screen.getByText("Alameda")).toBeInTheDocument();
    expect(screen.getByText("Butte")).toBeInTheDocument();
    expect(screen.queryByText("Fresno")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(screen.queryByText("Alameda")).not.toBeInTheDocument();
    expect(screen.queryByText("Butte")).not.toBeInTheDocument();
    expect(screen.getByText("Fresno")).toBeInTheDocument();
  });
});
