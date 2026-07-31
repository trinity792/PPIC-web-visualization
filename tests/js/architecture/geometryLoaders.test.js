/**
 * Guards the Workstream D bug class: a chart type declaring `requiresGeometry`
 * (choroplethMap, symbolMap) must have an actual geometry/points loader wired
 * for it in chartData.js. symbolMap was registered, given a Plotly adapter,
 * and put on the tile grid before any loader existed for it — this fails the
 * same way if the next map type repeats that.
 */

/* global process */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CHART_TYPES } from "@/lib/visualization/chartRegistry";

describe("geometry loaders", () => {
  it("wires a chartData.js loader for every chart type that requiresGeometry", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "components/chart-builder/chartData.js"),
      "utf8",
    );
    const geometryRequiring = Object.entries(CHART_TYPES)
      .filter(([, descriptor]) => descriptor.requiresGeometry)
      .map(([id]) => id);

    // Sanity check the guard itself has something to guard, so a future
    // registry refactor that drops the flag entirely doesn't leave this
    // test silently checking zero chart types.
    expect(geometryRequiring).toEqual(expect.arrayContaining(["choroplethMap", "symbolMap"]));

    for (const id of geometryRequiring) {
      const wired = new RegExp(
        `config\\.chartType === "${id}"[\\s\\S]{0,40}\\?\\s*load(Geometry|Points)\\(`,
      );
      expect(
        wired.test(source),
        `"${id}" declares requiresGeometry but chartData.js has no geometry/points loader wired for it`,
      ).toBe(true);
    }
  });
});
