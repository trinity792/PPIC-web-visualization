/** Phase 2 shell contract: modules use a workbench, never the step wizard. */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const configProps = vi.hoisted(() => ({ last: null }));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  ChartConfigProvider: ({ children, ...props }) => {
    configProps.last = props;
    return <>{children}</>;
  },
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
vi.mock("@/components/chart-builder/MultiChartToolbar", () => ({
  default: () => <div data-testid="multi-chart-toolbar">Multi-chart toolbar</div>,
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

  // The module surface declares multiChart, so the controls must be on screen
  // without a mode switch to find first — and above the grid, not inside the
  // chart card, since they act on the workspace rather than on one preview.
  it("shows the multi-chart bar above the sidebar and chart columns", () => {
    const { container } = render(
      <ModuleWorkbench schema={schema} initialConfig={{ module: "widgets" }} />,
    );

    const toolbar = screen.getByTestId("multi-chart-toolbar");
    expect(toolbar).toBeInTheDocument();
    const columns = container.querySelector('[style*="--sb-w"]');
    expect(columns, "two-column grid").not.toBeNull();
    expect(columns).toHaveClass(
      "lg:grid-cols-[var(--sb-w)_minmax(0,1fr)]",
    );
    expect(columns.contains(toolbar)).toBe(false);
    expect(
      toolbar.compareDocumentPosition(columns) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("resizes and persists the module sidebar like the standalone tool", () => {
    const { container } = render(
      <ModuleWorkbench schema={schema} initialConfig={{ module: "widgets" }} />,
    );
    const columns = container.querySelector('[style*="--sb-w"]');
    const handle = screen.getByRole("button", { name: "Resize panel" });

    expect(columns).toHaveStyle({ "--sb-w": "360px" });
    fireEvent.pointerDown(handle, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 180 });
    fireEvent.pointerUp(window);

    expect(columns).toHaveStyle({ "--sb-w": "440px" });
    expect(window.localStorage.getItem("wizardSidebarWidth")).toBe("440");
  });

  it("restores the sidebar width shared with the standalone tool", () => {
    window.localStorage.setItem("wizardSidebarWidth", "520");
    const { container } = render(
      <ModuleWorkbench schema={schema} initialConfig={{ module: "widgets" }} />,
    );

    expect(container.querySelector('[style*="--sb-w"]')).toHaveStyle({
      "--sb-w": "520px",
    });
  });

  it("renders no multi-chart bar in an embed, which has no editor chrome", () => {
    render(
      <ModuleWorkbench
        schema={schema}
        initialConfig={{ module: "widgets" }}
        embedded
      />,
    );
    expect(screen.queryByTestId("multi-chart-toolbar")).not.toBeInTheDocument();
  });

  it("binds nothing on the reader's behalf, on landing or on a chart-type switch", () => {
    render(<ModuleWorkbench schema={schema} initialConfig={{ module: "widgets" }} />);
    expect(configProps.last.autoBind).toBe(false);
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
