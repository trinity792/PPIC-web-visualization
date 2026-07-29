/** Phase 9 module composition keeps validation and excludes wizard-only tools. */

import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({
    config: {
      chartType: "line",
      filters: { locations: [] },
      validation: [{ level: "error", code: "REQUIRED_ROLE", message: "Choose Y" }],
    },
    dispatch: vi.fn(),
    schema: { id: "widgets", label: "Widgets", fields: {}, subsets: {} },
  }),
}));
vi.mock("@/lib/visualization/sidebarSections", () => ({
  visibleSectionsFor: () => [],
}));
vi.mock("@/components/chart-builder/ValidationNotice", () => ({
  default: () => <div role="alert">Choose Y</div>,
}));

import ModuleSidebar from "@/components/chart-builder/workbench/ModuleSidebar";

describe("ModuleSidebar composition", () => {
  it("omits wizard-only and workspace-only controls", () => {
    render(<ModuleSidebar />);
    for (const text of [
      /presets/i,
      /saved views/i,
      /add chart/i,
      /activity/i,
      /import config/i,
      /export config/i,
    ]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });

  it("keeps ValidationNotice on an invalid module config", () => {
    render(<ModuleSidebar />);
    expect(screen.getByRole("alert")).toHaveTextContent("Choose Y");
  });
});
