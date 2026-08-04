/** Phases 9-10 standalone wizard navigation and retained capabilities. */

/* global process */
/* eslint-disable react/prop-types */

import fs from "node:fs";
import path from "node:path";
import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  config: { data: { source: "inline", inline: null } },
  schema: { id: "byod", label: "Visualization Tool" },
}));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  ChartConfigProvider: ({ children }) => <>{children}</>,
  useChartConfig: () => state,
}));
vi.mock("@/components/chart-builder/wizard/PreviewContext", () => ({
  PreviewProvider: ({ children }) => <>{children}</>,
}));
vi.mock("@/components/chart-builder/wizard/ViewHydrator", () => ({
  default: () => null,
}));
vi.mock("@/components/chart-builder/MultiChartToolbar", () => ({
  default: () => <div>Multi-chart workspace</div>,
}));
vi.mock("@/components/chart-builder/wizard/steps/ImportStep", () => ({
  default: () => <div>Import content</div>,
}));
vi.mock("@/components/chart-builder/wizard/steps/EditStep", () => ({
  default: () => <div>Edit content</div>,
}));
vi.mock("@/components/chart-builder/wizard/steps/ExportStep", () => ({
  default: () => <div>Export content</div>,
}));

import VisualizationWizard, {
  DEFAULT_STEPS,
} from "@/components/chart-builder/wizard/VisualizationWizard";
import * as wizardModule from "@/components/chart-builder/wizard/VisualizationWizard";

describe("standalone VisualizationWizard after module divergence", () => {
  it("shows exactly three steps", () => {
    state.config = { data: { source: "inline", inline: null } };
    render(<VisualizationWizard schema={state.schema} initialConfig={{}} />);
    expect(DEFAULT_STEPS).toEqual(["import", "edit", "export"]);
    expect(
      screen.getAllByRole("button").slice(0, 3).map((button) => button.textContent),
    ).toEqual(["Import", "Edit", "Export"]);
  });

  it("offers no Chart Type step", () => {
    render(<VisualizationWizard schema={state.schema} initialConfig={{}} />);
    expect(screen.queryByRole("button", { name: "Chart Type" })).not.toBeInTheDocument();
    expect(screen.queryByText("Chart Type content")).not.toBeInTheDocument();
  });

  it("disables Edit and Export until a table is imported", () => {
    state.config = { data: { source: "inline", inline: null } };
    render(<VisualizationWizard schema={state.schema} initialConfig={{}} />);
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("falls back to Import when the table is cleared", async () => {
    const user = userEvent.setup();
    state.config = {
      data: {
        source: "inline",
        inline: { columns: [{ name: "Value", type: "number" }], rows: [[1]] },
      },
    };
    const { rerender } = render(
      <VisualizationWizard schema={state.schema} initialConfig={{}} />,
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Edit content")).toBeInTheDocument();

    state.config = { data: { source: "inline", inline: null } };
    rerender(<VisualizationWizard schema={state.schema} initialConfig={{}} />);
    expect(await screen.findByText("Import content")).toBeInTheDocument();
  });

  it("removes the module-only steps export", () => {
    expect(wizardModule.MODULE_STEPS).toBeUndefined();
  });

  it("keeps presets, saved views, multi-chart, and activity on wizard-owned surfaces", () => {
    const files = [
      "components/chart-builder/wizard/VisualizationWizard.js",
      "components/chart-builder/wizard/steps/ImportStep.js",
      "components/chart-builder/wizard/steps/EditStep.js",
      "components/chart-builder/wizard/steps/ExportStep.js",
      "components/chart-builder/sections/EditorSidebar.js",
    ];
    const source = files
      .map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8"))
      .join("\n");
    for (const retained of [
      "PresetSection",
      "FooterActions",
      "MultiChartToolbar",
      "EditorActivityLog",
      "ImportConfigButton",
      "ExportConfigButton",
    ]) {
      expect(
        new RegExp(`(?:import|<)\\s*[^\\n]*\\b${retained}\\b`).test(source),
        `standalone wiring for ${retained}`,
      ).toBe(true);
    }
  });
});
