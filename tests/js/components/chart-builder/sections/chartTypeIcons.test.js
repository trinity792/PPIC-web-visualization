/** Chart-type tile drawings (owner, 2026-10-12). */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import React from "react";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChartTypeIcon, hasChartTypeIcon } from "@/components/chart-builder/sections/chartTypeIcons";
import { CHART_FAMILIES, CHART_TYPE_IDS, chartFamilyOf } from "@/lib/visualization/chartRegistry";

// Every chart that is a tile, or the variant a family tile can show.
const DRAWN = [
  "line",
  "bar",
  "dumbbell",
  "choroplethMap",
  "symbolMap",
  "forest",
  "scatter",
  "pie",
  "heatmap",
  "dataTable",
];

describe("chartTypeIcons", () => {
  it("has a drawing for every chart offered as a tile", () => {
    for (const id of DRAWN) expect(hasChartTypeIcon(id), id).toBe(true);
  });

  it("has a drawing for every registered type that is its own tile, and every family's opening variant", () => {
    const ownTiles = CHART_TYPE_IDS.filter((id) => !chartFamilyOf(id));
    const familyDefaults = Object.values(CHART_FAMILIES).map((family) => family.variants[0].id);
    for (const id of [...ownTiles, ...familyDefaults]) expect(hasChartTypeIcon(id), id).toBe(true);
  });

  it("renders a decorative svg tagged with the drawing it shows", () => {
    const { container } = render(<ChartTypeIcon id="bar" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("data-chart-icon", "bar");
  });

  it("falls back to a generic drawing for an unknown id", () => {
    expect(hasChartTypeIcon("experimental")).toBe(false);
    const { container } = render(<ChartTypeIcon id="experimental" />);
    expect(container.querySelector("svg")).toHaveAttribute("data-chart-icon", "fallback");
  });

  // Colors come from the palette tokens (lib/constants.js → app/globals.css),
  // never from literals, so a palette change reaches the drawings too.
  it("uses palette tokens, not hex literals", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "components/chart-builder/sections/chartTypeIcons.js"),
      "utf8",
    );
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).toMatch(/var\(--ppic-/);
  });
});
