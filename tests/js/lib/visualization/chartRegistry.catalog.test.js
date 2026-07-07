/**
 * Tests for lib/visualization/chartRegistry.js - Phase 6 catalog growth.
 * The overhaul adds three base chart ids and moves named visual forms into
 * descriptor variants rather than separate one-off components.
 */

import { describe, expect, it } from "vitest";

import {
  CHART_TYPE_IDS,
  CHART_TYPES,
  getChartType,
} from "@/lib/visualization/chartRegistry";

describe("Phase 6 catalog ids", () => {
  it("registers pie, symbolMap, and dataTable as base chart types", () => {
    expect(CHART_TYPE_IDS).toEqual(
      expect.arrayContaining(["pie", "symbolMap", "dataTable"]),
    );
  });

  it("keeps donut as a pie variant through appearance.hole", () => {
    const pie = getChartType("pie");
    expect(pie).toMatchObject({
      id: "pie",
      transformCapable: false,
      requiredRoles: ["category", "y"],
    });
    expect(pie.roleConstraints.category).toContain("dimension");
    expect(pie.roleConstraints.y).toContain("measure");
    expect(pie.defaults).toMatchObject({ hole: 0 });
  });

  it("registers proportional-symbol maps as the symbolMap chart family", () => {
    const symbolMap = getChartType("symbolMap");
    expect(symbolMap).toMatchObject({
      id: "symbolMap",
      transformCapable: false,
      requiredRoles: ["geography", "size"],
      requiresGeometry: true,
    });
    expect(symbolMap.roleConstraints.geography).toContain("dimension");
    expect(symbolMap.roleConstraints.size).toContain("measure");
  });

  it("registers dataTable as a chart type with table-specific appearance defaults", () => {
    const dataTable = getChartType("dataTable");
    expect(dataTable).toMatchObject({
      id: "dataTable",
      transformCapable: false,
      requiredRoles: [],
    });
    expect(dataTable.defaults).toMatchObject({
      search: true,
      sortable: true,
      pageSize: 25,
    });
  });
});

describe("descriptor metadata", () => {
  it("tags every chart descriptor with transform capability and per-control tier hints", () => {
    for (const [id, descriptor] of Object.entries(CHART_TYPES)) {
      expect(typeof descriptor.transformCapable, `chart type: ${id}`).toBe("boolean");
      const tierHints = descriptor.controlTiers || descriptor.tierHints;
      expect(tierHints, `chart type: ${id}`).toBeTruthy();
      expect(typeof tierHints, `chart type: ${id}`).toBe("object");
    }
  });

  it("keeps variants on base chart descriptors instead of growing one id per named form", () => {
    expect(CHART_TYPE_IDS).not.toEqual(
      expect.arrayContaining([
        "donut",
        "populationPyramid",
        "stackedBar",
        "groupedBar",
        "area",
      ]),
    );
    expect(getChartType("bar").defaults).toEqual(
      expect.objectContaining({ stackMode: expect.any(String), mirror: expect.any(Boolean) }),
    );
    expect(getChartType("line").defaults).toEqual(
      expect.objectContaining({ area: expect.any(Boolean) }),
    );
  });
});
