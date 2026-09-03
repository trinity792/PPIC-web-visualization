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
    { name: "Year", type: "number" },
    { name: "Population", type: "number" },
    { name: "Housing units", type: "number" },
  ],
  rows: [
    ["Alameda", 2022, 1682000, 625000],
    ["Butte", 2023, 207000, 95000],
    ["Fresno", 2024, 1008000, 330000],
  ],
};

describe("DataTableView", () => {
  it("renders headers and formatted cells from a displayed table", () => {
    render(<DataTableView table={table} format={{}} appearance={{ pageSize: 25 }} />);

    expect(screen.getByRole("columnheader", { name: "Location" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Year" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Population" })).toBeInTheDocument();
    expect(screen.getByText("Alameda")).toBeInTheDocument();
    expect(screen.getByText("2022")).toBeInTheDocument();
    expect(screen.queryByText("2,022")).not.toBeInTheDocument();
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

/**
 * Workstream E - the Data view speaks the same language as the export.
 *
 * The table is the one place a reader can see what the chart could not draw, so
 * "Not available" and "Suppressed" must be visible words rather than blank
 * cells - and they must be the same words the CSV's status column carries.
 */
const dataTableModule = () => import("@/components/charts/DataTableView");
const v3ExportModule = () => import("@/lib/export/exportTable");

const V3_COMPARISONS = [
  { id: "cmp_latina", label: "San Francisco Latina Women" },
  { id: "cmp_white_women", label: "San Francisco White Women" },
];

const v3Obs = (overrides = {}) => ({
  comparisonId: "cmp_latina",
  comparisonLabel: "San Francisco Latina Women",
  measureId: "Population",
  measureLabel: "Population",
  unit: "people",
  period: 2025,
  geographyId: "06075",
  geographyLabel: "San Francisco",
  categoryId: null,
  categoryLabel: null,
  value: 50000,
  status: "available",
  valueKind: "observed",
  calculation: { id: "actual", params: {} },
  includedPeriods: null,
  source: "DoF P-3",
  ...overrides,
});

describe("Workstream E observation statuses", () => {
  it("shows Not available and Suppressed without numeric values", async () => {
    const { default: View } = await dataTableModule();
    const { displayTableFromObservations } = await v3ExportModule();

    render(
      <View
        table={displayTableFromObservations({
          observations: [
            v3Obs(),
            v3Obs({ period: 2030, value: null, status: "missing" }),
            v3Obs({
              comparisonId: "cmp_white_women",
              comparisonLabel: "San Francisco White Women",
              value: null,
              status: "suppressed",
            }),
          ],
          comparisons: V3_COMPARISONS,
        })}
      />,
    );

    expect(screen.getByText("Not available")).toBeInTheDocument();
    expect(screen.getByText("Suppressed")).toBeInTheDocument();
    // A hole rendered as 0 is the failure mode: it reads as a real count of
    // nobody rather than as an absence of information.
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows every comparison while one tab is active on the chart", async () => {
    const { default: View } = await dataTableModule();
    const { displayTableFromObservations } = await v3ExportModule();

    render(
      <View
        table={displayTableFromObservations({
          observations: [
            v3Obs(),
            v3Obs({
              comparisonId: "cmp_white_women",
              comparisonLabel: "San Francisco White Women",
              value: 63000,
            }),
          ],
          comparisons: V3_COMPARISONS,
          presentation: { comparisonPresentation: "tabs", activeTab: "cmp_latina" },
        })}
      />,
    );

    expect(screen.getByText("San Francisco Latina Women")).toBeInTheDocument();
    expect(screen.getByText("San Francisco White Women")).toBeInTheDocument();
  });

  it("names an average and the years inside it", async () => {
    const { default: View } = await dataTableModule();
    const { displayTableFromObservations } = await v3ExportModule();

    render(
      <View
        table={displayTableFromObservations({
          observations: [
            v3Obs({
              period: "2020-2030",
              value: 50000,
              valueKind: "derived",
              calculation: {
                id: "averageSelectedYears",
                params: { years: [2020, 2025, 2030] },
              },
              includedPeriods: [2020, 2025, 2030],
            }),
          ],
          comparisons: V3_COMPARISONS,
        })}
      />,
    );

    expect(screen.getByText("2020; 2025; 2030")).toBeInTheDocument();
  });
});
