/** Workstream F: the wizard Edit step mounts the shared editor sidebar. */

import React from "react";

import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  config: { chartType: "line", validation: [], filters: {}, bindings: {}, layers: [] },
  schema: { id: "byod", inlineOnly: true, fields: {}, subsets: {} },
}));

// The real store passes through for the byod-shapes helpers (createChartConfig,
// reduceChartConfig); only the hook the component reads is replaced.
vi.mock("@/components/chart-builder/chartConfigStore", async (importOriginal) => ({
  ...(await importOriginal()),
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
vi.mock("@/components/chart-builder/EditorActivityLog", () => ({ default: () => null }));
vi.mock("@/components/chart-builder/ConfigActions", () => ({
  ImportConfigButton: () => null,
  ExportConfigButton: () => null,
}));
vi.mock("@/lib/visualization/sidebarSections", () => {
  // Reports any prop the shell hands the Chart Type section, so a wizard-only
  // variant of this section cannot creep back in unnoticed.
  const ChartTypeProbe = (props) => {
    const passed = Object.keys(props).sort();
    return passed.length ? `chart-type props: ${passed.join(",")}` : "chart types, no props";
  };
  const sections = [
    { value: "datasets", label: "Datasets", Component: () => null },
    { value: "chart-type", label: "Chart Type", Component: ChartTypeProbe },
    { value: "axis", label: "Outcome", Component: () => null },
    { value: "appearance", label: "Appearance", Component: () => null },
    { value: "labels", label: "Labels", Component: () => null },
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

  it("renders the module workbench's chart-type section, unmodified", () => {
    render(<EditStep />);
    expect(screen.getByText("chart types, no props")).toBeInTheDocument();
    cleanup();

    state.schema = { id: "widgets", inlineOnly: false, fields: {}, subsets: {} };
    render(<ModuleSidebar />);
    expect(screen.getByText("chart types, no props")).toBeInTheDocument();
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

import { fixtureTable as datasetFixture, importInline as datasetImport, dispatchInline as datasetDispatch } from "@/tests/fixtures/byod-shapes/helpers";
it("shows the reason until the reader changes chart type", async () => {
  state.config = datasetImport(await datasetFixture("wide-monthly-shares"));
  state.schema = { id: "byod", inlineOnly: true, fields: {}, subsets: {} };
  const view = render(<EditStep />);
  expect(screen.getByText(/line chart:.*date column.*(six|6).*number columns/i)).toBeInTheDocument();
  state.config = datasetDispatch(state.config, { type: "SET_CHART_TYPE", chartType: "scatter" });
  view.rerender(<EditStep />);
  expect(screen.queryByText(/line chart:.*date column/i)).not.toBeInTheDocument();
});
