/**
 * Which chart types a surface can actually draw (Workstream D). The gate that
 * matters here is the third one: a chart type declaring `requiresGeometry` had
 * been offered wherever it was registered, including on modules holding no
 * geometry and on pasted data, where it can only fail or draw an empty figure.
 */

import { describe, expect, it } from "vitest";

import { BYOD_SCHEMA } from "@/lib/visualization/moduleSchemas/byod";
import { BUILDING_PERMITS_SCHEMA } from "@/lib/visualization/moduleSchemas/buildingPermits";
import { DEMOGRAPHIC_PROJECTIONS_SCHEMA } from "@/lib/visualization/moduleSchemas/demographicProjections";
import { POPHOUSING_SCHEMA } from "@/lib/visualization/moduleSchemas/pophousing";
import { RHNA_PROGRESS_SCHEMA } from "@/lib/visualization/moduleSchemas/rhnaProgress";
import {
  GEOMETRY_SUBSET,
  availableChartTypes,
  geometrySubsetFor,
  isChartTypeAvailable,
  requiresGeometry,
} from "@/lib/visualization/chartAvailability";

describe("geometrySubsetFor", () => {
  it("names the level a map can draw on when the module has one", () => {
    expect(geometrySubsetFor(POPHOUSING_SCHEMA)).toBe(GEOMETRY_SUBSET);
  });

  it("answers null for a module whose levels we hold no geometry for", () => {
    expect(geometrySubsetFor(BUILDING_PERMITS_SCHEMA)).toBeNull();
  });

  it("answers null for pasted data, which has no server levels at all", () => {
    expect(geometrySubsetFor(BYOD_SCHEMA)).toBeNull();
  });
});

describe("requiresGeometry", () => {
  it("is true for both map types and false for everything else", () => {
    expect(requiresGeometry("choroplethMap")).toBe(true);
    expect(requiresGeometry("symbolMap")).toBe(true);
    expect(requiresGeometry("bar")).toBe(false);
    expect(requiresGeometry("notAChart")).toBe(false);
  });
});

describe("isChartTypeAvailable", () => {
  it("offers both map types on a module with a Counties level", () => {
    expect(isChartTypeAvailable("choroplethMap", POPHOUSING_SCHEMA)).toBe(true);
    expect(isChartTypeAvailable("symbolMap", POPHOUSING_SCHEMA)).toBe(true);
  });

  it("offers neither map type on a module with no level we hold geometry for", () => {
    expect(isChartTypeAvailable("choroplethMap", BUILDING_PERMITS_SCHEMA)).toBe(false);
    expect(isChartTypeAvailable("symbolMap", BUILDING_PERMITS_SCHEMA)).toBe(false);
    // The rest of that module's grid is untouched.
    expect(isChartTypeAvailable("line", BUILDING_PERMITS_SCHEMA)).toBe(true);
  });

  it("keeps the choropleth but drops the symbol map on pasted data", () => {
    // A pasted table has an inline `geo` shape builder to feed a choropleth,
    // and no coordinate contract at all to feed a symbol map.
    expect(isChartTypeAvailable("choroplethMap", BYOD_SCHEMA)).toBe(true);
    expect(isChartTypeAvailable("symbolMap", BYOD_SCHEMA)).toBe(false);
  });

  it("still honours supportedChartTypes", () => {
    expect(isChartTypeAvailable("line", RHNA_PROGRESS_SCHEMA)).toBe(false);
    expect(isChartTypeAvailable("bar", RHNA_PROGRESS_SCHEMA)).toBe(true);
    expect(isChartTypeAvailable("choroplethMap", RHNA_PROGRESS_SCHEMA)).toBe(true);
    expect(isChartTypeAvailable("symbolMap", RHNA_PROGRESS_SCHEMA)).toBe(false);
  });

  it("never offers an unregistered id, retired or invented", () => {
    // `divergingBar`'s descriptor is deleted; a stored view carrying the id is
    // rewritten to "bar" by normalizeSpec long before a gallery asks about it.
    expect(isChartTypeAvailable("divergingBar", POPHOUSING_SCHEMA)).toBe(false);
    expect(isChartTypeAvailable("slope", POPHOUSING_SCHEMA)).toBe(false);
    expect(isChartTypeAvailable("notAChartType", POPHOUSING_SCHEMA)).toBe(false);
  });

  // Owner review, 2026-10-10: a Population & Housing forest plot drew nothing,
  // because no module question returns interval bounds.
  it("offers the forest plot on pasted data only", () => {
    for (const schema of [POPHOUSING_SCHEMA, DEMOGRAPHIC_PROJECTIONS_SCHEMA, BUILDING_PERMITS_SCHEMA]) {
      expect(isChartTypeAvailable("forest", schema), schema.id).toBe(false);
    }
    expect(isChartTypeAvailable("forest", BYOD_SCHEMA)).toBe(true);
  });

});

describe("availableChartTypes", () => {
  it("never offers a chart type that would fail at the data layer", () => {
    for (const id of availableChartTypes(BUILDING_PERMITS_SCHEMA)) {
      expect(requiresGeometry(id), `offered without geometry: ${id}`).toBe(false);
    }
    expect(availableChartTypes(POPHOUSING_SCHEMA)).toContain("symbolMap");
  });
});

// Workstream Q: scatter needs two measures and bubble three, so a topic is
// offered only the charts it can fill. Hidden, not disabled with a reason.
describe("charts that need extra measures", () => {
  const measure = (label) => ({ kind: "measure", label, unit: "number" });
  const topic = (count) => ({
    id: `topic-${count}`,
    subsets: { Counties: ["County"] },
    fields: {
      Year: { kind: "temporal" },
      ...Object.fromEntries(Array.from({ length: count }, (_, i) => [`M${i}`, measure(`M${i}`)])),
    },
  });

  it("offers scatter on a topic with two measures, bubble with three, and neither with one", () => {
    expect(isChartTypeAvailable("scatter", topic(1))).toBe(false);
    expect(isChartTypeAvailable("bubble", topic(1))).toBe(false);

    expect(isChartTypeAvailable("scatter", topic(2))).toBe(true);
    expect(isChartTypeAvailable("bubble", topic(2))).toBe(false);

    expect(isChartTypeAvailable("scatter", topic(3))).toBe(true);
    expect(isChartTypeAvailable("bubble", topic(3))).toBe(true);
  });

  it("hides scatter and bubble on Demographic Projections, which holds one measure", () => {
    const offered = availableChartTypes(DEMOGRAPHIC_PROJECTIONS_SCHEMA);
    expect(offered).not.toContain("scatter");
    expect(offered).not.toContain("bubble");
    expect(offered).toContain("dotPlot");
  });

  it("offers both on a topic with many measures, and on pasted data", () => {
    expect(availableChartTypes(POPHOUSING_SCHEMA)).toEqual(
      expect.arrayContaining(["scatter", "bubble"]),
    );
    expect(isChartTypeAvailable("scatter", BYOD_SCHEMA)).toBe(true);
    expect(isChartTypeAvailable("bubble", BYOD_SCHEMA)).toBe(true);
  });
});
