/**
 * Standalone imported-table scrolling regressions.
 */

import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import InputTableEditor from "@/components/chart-builder/InputTableEditor";

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({ config: { tier: "basic" } }),
}));

describe("InputTableEditor scrolling", () => {
  it("uses the fixed-height viewport for both vertical and horizontal scrolling", () => {
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

    const viewport = screen.getByRole("region", { name: "Editable imported data" });
    const tableContainer = viewport.querySelector('[data-slot="table-container"]');

    expect(viewport).toHaveClass("max-h-[28rem]", "overflow-auto");
    expect(tableContainer).toHaveClass("overflow-visible");
    expect(tableContainer).not.toHaveClass("overflow-x-auto");
  });
});
