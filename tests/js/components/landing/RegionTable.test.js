/**
 * Tests for components/landing/RegionTable.js - Phase 6 rebase. RegionTable
 * should become a thin preset of DataTableView instead of maintaining a second
 * table renderer.
 */

import React from "react";

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dataTableViewMock = vi.hoisted(() => vi.fn(() => <div data-testid="data-table-view" />));

vi.mock("@/components/charts/DataTableView", () => ({
  default: dataTableViewMock,
}));

import RegionTable from "@/components/landing/RegionTable";

describe("RegionTable", () => {
  beforeEach(() => {
    dataTableViewMock.mockClear();
  });

  it("delegates rendering to DataTableView with region-specific columns and rows", () => {
    render(
      <RegionTable
        year={2024}
        regionRows={[
          { region: "Bay Area", population: 7750000, housingUnits: 3100000 },
          { region: "Central Coast", population: 1500000, housingUnits: 640000 },
        ]}
      />,
    );

    expect(dataTableViewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        table: {
          columns: [
            { name: "Region", type: "text" },
            { name: "Population", type: "number" },
            { name: "Housing units", type: "number" },
          ],
          rows: [
            ["Bay Area", 7750000, 3100000],
            ["Central Coast", 1500000, 640000],
          ],
        },
        appearance: expect.objectContaining({ search: false, sortable: true }),
      }),
      undefined,
    );
  });
});
