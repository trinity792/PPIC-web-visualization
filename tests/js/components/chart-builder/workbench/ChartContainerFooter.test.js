/** Phase 3 footer availability contract. */

/* eslint-disable react/prop-types */

import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/chart-builder/ExportMenu", () => ({
  ExportChartButton: ({ disabled }) => (
    <button type="button" disabled={disabled}>Export Chart</button>
  ),
  ExportDataButton: ({ disabled }) => (
    <button type="button" disabled={disabled}>Export Data</button>
  ),
}));

import ChartContainerFooter from "@/components/chart-builder/workbench/ChartContainerFooter";

describe("ChartContainerFooter", () => {
  it.each(["loading", "invalid", "empty", "error"])(
    "disables both exports while preview status is %s",
    (status) => {
      render(
        <ChartContainerFooter
          viewMode="chart"
          onViewModeChange={vi.fn()}
          status={status}
        />,
      );
      expect(screen.getByRole("button", { name: "Export Chart" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Export Data" })).toBeDisabled();
    },
  );

  it("enables both exports only when preview status is ready", () => {
    render(
      <ChartContainerFooter
        viewMode="chart"
        onViewModeChange={vi.fn()}
        status="ready"
      />,
    );
    expect(screen.getByRole("button", { name: "Export Chart" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export Data" })).toBeEnabled();
  });
});
