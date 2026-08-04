/**
 * Phase 2 responsive height contract. Class assertions are deliberate here:
 * the CSS positioning is the behavior that prevents sidebar intrinsic height
 * from growing the desktop chart row, and jsdom cannot perform layout.
 */

import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({
    config: { chartType: "line", filters: { locations: [] } },
    dispatch: vi.fn(),
    schema: { id: "widgets", label: "Widgets", fields: {}, subsets: {} },
  }),
}));
vi.mock("@/lib/visualization/sidebarSections", () => ({
  visibleSectionsFor: () => [],
}));

import ModuleSidebar from "@/components/chart-builder/workbench/ModuleSidebar";

// The sidebar always mounts inside the workbench's page shell, so the shell is
// part of what these assertions are about: the panel, not <main>, owns the
// scroll. Rendering it bare would leave `closest("main")` null.
function renderInShell() {
  return render(
    <main>
      <ModuleSidebar />
    </main>,
  );
}

describe("ModuleSidebar layout", () => {
  it("keeps the height clamp classes after the split", () => {
    renderInShell();
    const sidebar = screen.getByRole("complementary", { name: /chart controls/i });
    const cell = sidebar.parentElement;

    expect(cell).toHaveClass("lg:relative");
    expect(sidebar).toHaveClass(
      "lg:absolute",
      "lg:inset-0",
      "lg:overflow-y-auto",
    );
  });

  it("keeps natural static flow below the lg breakpoint", () => {
    renderInShell();
    const sidebar = screen.getByRole("complementary", { name: /chart controls/i });
    expect(sidebar).toHaveClass("static");
    expect(sidebar).not.toHaveClass("absolute", "inset-0", "overflow-y-auto");
  });

  it("owns vertical overflow instead of assigning it to the page shell", () => {
    renderInShell();
    const sidebar = screen.getByRole("complementary", { name: /chart controls/i });
    expect(sidebar).toHaveClass("lg:overflow-y-auto");
    expect(sidebar.closest("main")).not.toHaveClass("overflow-y-auto");
  });
});
