/**
 * Standalone imported-table scrolling regressions.
 */

import React, { useState } from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  async function forceCountyToGroup(user) {
    await user.click(
      screen.getByRole("combobox", { name: /column type for County/i }),
    );
    await user.click(screen.getByRole("option", { name: "group" }));
  }

  it("shows the forced type in the header select after a transpose", async () => {
    const user = userEvent.setup();
    render(<ControlledEditor />);
    await forceCountyToGroup(user);
    await user.click(screen.getByRole("button", { name: "Transpose" }));

    expect(
      screen.getByRole("combobox", { name: /column type for County/i }),
    ).toHaveTextContent("group");
  });

  it("restores the forced type after transposing twice", async () => {
    const user = userEvent.setup();
    render(<ControlledEditor />);
    await forceCountyToGroup(user);
    await user.click(screen.getByRole("button", { name: "Transpose" }));
    await user.click(screen.getByRole("button", { name: "Transpose" }));

    expect(
      screen.getByRole("combobox", { name: /column type for County/i }),
    ).toHaveTextContent("group");
    expect(
      screen.getByRole("combobox", { name: /column type for Value/i }),
    ).toHaveTextContent("number");
  });

  it("clears hidden columns on transpose", async () => {
    const user = userEvent.setup();
    render(<ControlledEditor />);
    await user.click(screen.getByRole("button", { name: "Hide County" }));
    expect(screen.queryByRole("button", { name: "Hide County" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Transpose" }));
    expect(screen.getByRole("button", { name: "Hide County" })).toBeInTheDocument();
  });
});
