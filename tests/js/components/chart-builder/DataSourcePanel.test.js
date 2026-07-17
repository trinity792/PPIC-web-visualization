/**
 * Standalone import regressions: optional dataset names and a fixed-height,
 * vertically scrolling paste box.
 */

import React from "react";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DataSourcePanel from "@/components/chart-builder/DataSourcePanel";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  config: {
    data: { source: "inline" },
    tier: "moderate",
  },
}));

const parsePaste = vi.hoisted(() => vi.fn());

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({
    config: state.config,
    dispatch: state.dispatch,
    schema: { inlineOnly: true },
  }),
}));

vi.mock("@/lib/tabular/parseTable", () => ({
  parsePaste,
  parseFile: vi.fn(),
}));

describe("DataSourcePanel standalone import", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.config = { data: { source: "inline" }, tier: "moderate" };
    parsePaste.mockResolvedValue({
      value: {
        columns: [{ name: "County", type: "text" }],
        rows: [["Alameda"]],
        issues: [],
      },
      errors: [],
    });
  });

  it("keeps pasted data in a fixed-height box with vertical scrolling", () => {
    render(<DataSourcePanel />);

    const pasteBox = screen.getByLabelText("Paste from Excel or Sheets");
    expect(pasteBox).toHaveClass("h-32", "overflow-y-auto", "[field-sizing:fixed]");
  });

  it("stores an optional dataset name with the imported table", async () => {
    render(<DataSourcePanel />);

    fireEvent.change(screen.getByLabelText("Dataset name (optional)"), {
      target: { value: "County estimates" },
    });
    fireEvent.change(screen.getByLabelText("Paste from Excel or Sheets"), {
      target: { value: "County\nAlameda" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Use pasted data" }));

    await waitFor(() => {
      expect(state.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SET_DATA_SOURCE",
          source: "inline",
          inline: expect.objectContaining({
            meta: expect.objectContaining({ title: "County estimates" }),
          }),
        }),
      );
    });
  });
});
