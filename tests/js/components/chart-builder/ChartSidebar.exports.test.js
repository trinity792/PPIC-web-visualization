/** Phase 0 extraction boundary for ChartSidebar. */

/* global process */

import fs from "node:fs";
import path from "node:path";
import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({
    config: {
      module: "widgets",
      labels: { title: "Widgets" },
      filters: {},
      bindings: {},
      period: {},
      appearance: {},
      layers: [],
    },
    dispatch: state.dispatch,
    schema: { id: "widgets", label: "Widgets", fields: {} },
  }),
}));

import * as chartSidebar from "@/components/chart-builder/ChartSidebar";

describe("ChartSidebar extraction boundary", () => {
  it("keeps FooterActions independently mountable", () => {
    render(<chartSidebar.FooterActions />);
    expect(screen.getByRole("button", { name: /save view/i })).toBeInTheDocument();
  });

  it("removes the obsolete resizable default export", () => {
    expect(chartSidebar.default).toBeUndefined();
  });

  it("has no first-party imports of the removed default sidebar shell", () => {
    const roots = ["app", "components", "lib"];
    const files = roots.flatMap((root) =>
      walk(path.join(process.cwd(), root)).filter((file) => /\.[cm]?[jt]sx?$/.test(file)),
    );
    const defaultImports = files.filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return /import\s+\w+\s+from\s+["']@\/components\/chart-builder\/ChartSidebar["']/.test(
        source,
      );
    });
    expect(defaultImports).toEqual([]);
  });
});

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
