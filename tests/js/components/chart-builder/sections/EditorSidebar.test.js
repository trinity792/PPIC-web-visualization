/** Workstream F: one sidebar body serves both editor shells. */

import React from "react";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  config: { chartType: "line", validation: [], filters: {}, bindings: {}, layers: [] },
  schema: { id: "widgets", fields: {}, subsets: {} },
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));
vi.mock("@/components/chart-builder/ValidationNotice", () => ({
  default: () => <div>Validation notice</div>,
}));
vi.mock("@/components/chart-builder/sections/PresetSection", () => ({
  default: () => <div data-testid="presets-tool">Preset tools</div>,
}));
vi.mock("@/components/chart-builder/ChartSidebar", () => ({
  FooterActions: () => <div data-testid="saved-views-tool">Saved views</div>,
}));
vi.mock("@/components/chart-builder/LayerEditor", () => ({
  default: () => <div data-testid="layers-tool">Trace layers</div>,
}));
vi.mock("@/components/chart-builder/EditorActivityLog", () => ({
  default: () => <div data-testid="activity-tool">Activity log</div>,
}));
vi.mock("@/components/chart-builder/ConfigActions", () => ({
  ImportConfigButton: () => <button type="button">Import config</button>,
  ExportConfigButton: () => <button type="button">Export config</button>,
}));
vi.mock("@/lib/visualization/sidebarSections", () => {
  const sections = [
    { value: "datasets", label: "Datasets", Component: () => null },
    { value: "chart-type", label: "Chart Type", Component: () => null },
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

import { AdvancedModeProvider } from "@/components/chart-builder/advancedMode";
import {
  EditorCapabilitiesProvider,
} from "@/components/chart-builder/editorCapabilities";
import EditorSidebar from "@/components/chart-builder/sections/EditorSidebar";

const NONE = {
  presets: false,
  savedViews: false,
  layers: false,
  activityLog: false,
  multiChart: false,
};

function mount({ capabilities = NONE, advanced = false, ...props } = {}) {
  return render(
    <EditorCapabilitiesProvider capabilities={capabilities}>
      <AdvancedModeProvider defaultAdvanced={advanced}>
        <EditorSidebar {...props} />
      </AdvancedModeProvider>
    </EditorCapabilitiesProvider>,
  );
}

const toolCases = [
  ["presets", "presets-tool"],
  ["savedViews", "saved-views-tool"],
  ["layers", "layers-tool"],
  ["activityLog", "activity-tool"],
];

describe("EditorSidebar", () => {
  beforeEach(() => {
    state.config = { chartType: "line", validation: [], filters: {}, bindings: {}, layers: [] };
  });

  it.each([
    ["workbench", { ...NONE, multiChart: true }],
    [
      "standalone",
      { presets: true, savedViews: true, layers: true, activityLog: true, multiChart: true },
    ],
  ])("renders the registry sections in registry order for the %s", (_surface, capabilities) => {
    mount({ capabilities });
    const names = screen
      .getAllByRole("button")
      .map((button) => button.textContent.trim())
      .filter((name) => ["Datasets", "Chart Type", "Outcome", "Labels", "Appearance"].includes(name));
    expect(names).toEqual(["Datasets", "Chart Type", "Outcome", "Labels", "Appearance"]);
  });

  it("renders no presets block without the capability, even in advanced mode", () => {
    mount({ advanced: true, capabilities: NONE });
    expect(screen.queryByTestId("presets-tool")).not.toBeInTheDocument();
  });

  it("renders no presets block with the capability but out of advanced mode", () => {
    mount({ capabilities: { ...NONE, presets: true } });
    expect(screen.queryByTestId("presets-tool")).not.toBeInTheDocument();
  });

  it("renders the presets block with the capability in advanced mode", () => {
    mount({ advanced: true, capabilities: { ...NONE, presets: true } });
    expect(screen.getByTestId("presets-tool")).toBeInTheDocument();
  });

  it.each(toolCases)(
    "applies capability and Advanced Mode gates to %s",
    (capability, testId) => {
      const unavailable = mount({ advanced: true, capabilities: NONE });
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
      unavailable.unmount();

      const basic = mount({ capabilities: { ...NONE, [capability]: true } });
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
      basic.unmount();

      mount({ advanced: true, capabilities: { ...NONE, [capability]: true } });
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    },
  );

  it("honours an exclude filter", () => {
    mount({ exclude: ["chart-type", "labels"] });
    expect(screen.queryByRole("button", { name: "Chart Type" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Labels" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Outcome" })).toBeInTheDocument();
  });
});
