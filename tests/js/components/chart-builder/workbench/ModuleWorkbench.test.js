/** Phase 2 shell contract: modules use a workbench, never the step wizard. */

/* eslint-disable react/prop-types */

import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  ChartConfigProvider: ({ children }) => <>{children}</>,
}));
const previewProps = vi.hoisted(() => ({ last: null }));
vi.mock("@/components/chart-builder/wizard/PreviewContext", () => ({
  PreviewProvider: ({ children, ...props }) => {
    previewProps.last = props;
    return <>{children}</>;
  },
}));
vi.mock("@/components/chart-builder/wizard/ViewHydrator", () => ({
  default: () => null,
}));
vi.mock("@/components/chart-builder/workbench/ModuleSidebar", () => ({
  default: () => <aside aria-label="Chart controls">Sidebar</aside>,
}));
vi.mock("@/components/chart-builder/workbench/ChartContainer", () => ({
  default: ({ embedded }) => (
    <section aria-label="Chart preview">
      Chart
      {embedded ? null : <footer>Footer</footer>}
    </section>
  ),
}));
vi.mock("@/components/chart-builder/wizard/StepNav", () => ({
  default: () => <nav aria-label="Steps">Steps</nav>,
}));

import ModuleWorkbench from "@/components/chart-builder/workbench/ModuleWorkbench";

const schema = { id: "widgets", label: "Widgets", fields: {}, subsets: {} };

describe("ModuleWorkbench", () => {
  it("renders sidebar and chart regions without wizard navigation", () => {
    render(<ModuleWorkbench schema={schema} initialConfig={{ module: "widgets" }} />);

    expect(screen.getByRole("complementary", { name: "Chart controls" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Chart preview" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Steps" })).not.toBeInTheDocument();
  });

  it("renders only the preview for embedded modules", () => {
    render(
      <ModuleWorkbench
        schema={schema}
        initialConfig={{ module: "widgets" }}
        embedded
      />,
    );

    expect(screen.getByRole("region", { name: "Chart preview" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByText("Footer")).not.toBeInTheDocument();
  });

  describe("deferred first render", () => {
    it("defers on a plain module landing", () => {
      render(<ModuleWorkbench schema={schema} initialConfig={{ module: "widgets" }} />);
      expect(previewProps.last.deferInitialRender).toBe(true);
    });

    it("does not defer a deep-linked or saved view", () => {
      render(
        <ModuleWorkbench
          schema={schema}
          initialConfig={{ module: "widgets" }}
          viewId="population-trend"
        />,
      );
      expect(previewProps.last.deferInitialRender).toBe(false);
    });

    it("does not defer an embed, which has no sidebar to touch", () => {
      render(
        <ModuleWorkbench
          schema={schema}
          initialConfig={{ module: "widgets" }}
          embedded
        />,
      );
      expect(previewProps.last.deferInitialRender).toBe(false);
    });
  });
});
