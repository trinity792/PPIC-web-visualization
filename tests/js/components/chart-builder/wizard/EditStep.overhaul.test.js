/** Workstream F: the wizard Edit step mounts the shared editor sidebar. */

import React from "react";

import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  config: { chartType: "line", validation: [], filters: {}, bindings: {}, layers: [] },
  schema: { id: "byod", inlineOnly: true, fields: {}, subsets: {} },
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));
vi.mock("@/components/chart-builder/ValidationNotice", () => ({ default: () => null }));
vi.mock("@/components/chart-builder/wizard/PreviewPane", () => ({
  default: () => <div>Preview</div>,
}));
vi.mock("@/components/chart-builder/wizard/StepShell", () => ({
  default: ({ title, children }) => (
    <section>
      <h1>{title}</h1>
      {children}
    </section>
  ),
}));
vi.mock("@/components/chart-builder/sections/PresetSection", () => ({ default: () => null }));
vi.mock("@/components/chart-builder/ChartSidebar", () => ({ FooterActions: () => null }));
vi.mock("@/components/chart-builder/LayerEditor", () => ({ default: () => null }));
vi.mock("@/components/chart-builder/EditorActivityLog", () => ({ default: () => null }));
vi.mock("@/components/chart-builder/ConfigActions", () => ({
  ImportConfigButton: () => null,
  ExportConfigButton: () => null,
}));
vi.mock("@/lib/visualization/sidebarSections", () => {
  const ChartTypeProbe = ({ grouped }) =>
    grouped ? "Line family Bar family Map family" : "Flat chart types";
  const sections = [
    { value: "datasets", label: "Datasets", Component: () => null },
    { value: "chart-type", label: "Chart Type", Component: ChartTypeProbe },
    { value: "axis", label: "Outcome", Component: () => null },
    { value: "labels", label: "Labels", Component: () => null },
    { value: "appearance", label: "Appearance", Component: () => null },
  ];
  return {
    visibleSectionsFor: (_config, _schema, { only, exclude } = {}) =>
      sections.filter(
        (section) =>
          (!only || only.includes(section.value)) &&
          (!exclude || !exclude.includes(section.value)),
      ),
  };
});

import EditStep from "@/components/chart-builder/wizard/steps/EditStep";
import ModuleSidebar from "@/components/chart-builder/workbench/ModuleSidebar";

const SECTION_NAMES = ["Datasets", "Chart Type", "Outcome", "Labels", "Appearance"];

function sectionNames() {
  return screen
    .getAllByRole("button")
    .map((button) => button.textContent.trim())
    .filter((name) => SECTION_NAMES.includes(name));
}

describe("EditStep shared sidebar", () => {
  beforeEach(() => {
    state.config = { chartType: "line", validation: [], filters: {}, bindings: {}, layers: [] };
    state.schema = { id: "byod", inlineOnly: true, fields: {}, subsets: {} };
  });

  it("renders the Chart Type section in the sidebar", () => {
    render(<EditStep />);
    expect(screen.getByRole("button", { name: "Chart Type" })).toBeInTheDocument();
  });

  it("groups chart types into families", () => {
    render(<EditStep />);
    expect(screen.getByText(/Line family Bar family Map family/)).toBeInTheDocument();
  });

  it("renders the same section list as a module sidebar", () => {
    render(<EditStep />);
    const wizardSections = sectionNames();
    cleanup();

    state.schema = { id: "widgets", inlineOnly: false, fields: {}, subsets: {} };
    render(<ModuleSidebar />);
    expect(sectionNames()).toEqual(wizardSections);
  });
});
