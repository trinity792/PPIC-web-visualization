import { describe, expect, it } from "vitest";

import {
  AVAILABLE_GEO_LEVELS,
  FEATURE_ID_KEYS,
  getFeatureIdLookup,
  loadGeometry,
  loadRepresentativePoints,
} from "@/lib/data/geography";
import { GEOMETRY_LEVEL_BY_SUBSET } from "@/lib/visualization/chartAvailability";

// California's rough bounding box — generous enough to allow for a scanline
// fallback point landing a little off from the exact geographic centroid,
// tight enough to catch a join or projection mistake (e.g. swapped lon/lat).
const CA_BOUNDS = { lonMin: -125, lonMax: -113, latMin: 32, latMax: 43 };

describe("loadRepresentativePoints", () => {
  it("returns one [lon, lat] point per county GEOID, each within California", async () => {
    const geojson = await loadGeometry("counties");
    const points = await loadRepresentativePoints("counties");

    const geoids = (geojson.features || []).map((f) => f.properties.GEOID);
    expect(Object.keys(points).sort()).toEqual([...geoids].sort());

    for (const [geoid, point] of Object.entries(points)) {
      expect(point, geoid).toHaveLength(2);
      const [lon, lat] = point;
      expect(lon, geoid).toBeGreaterThan(CA_BOUNDS.lonMin);
      expect(lon, geoid).toBeLessThan(CA_BOUNDS.lonMax);
      expect(lat, geoid).toBeGreaterThan(CA_BOUNDS.latMin);
      expect(lat, geoid).toBeLessThan(CA_BOUNDS.latMax);
    }
  });

  it("caches by level, returning the same object on a second call", async () => {
    const first = await loadRepresentativePoints("counties");
    const second = await loadRepresentativePoints("counties");
    expect(second).toBe(first);
  });
});

describe("geometry levels", () => {
  const REGIONS = [
    "Bay Area",
    "Central Coast",
    "Far North",
    "Inland Empire",
    "Los Angeles (Regional)",
    "North San Joaquin Valley",
    "Sacramento (Regional)",
    "San Diego (Regional)",
    "South San Joaquin Valley",
  ];

  it("serves every level the client can ask for", () => {
    for (const level of Object.values(GEOMETRY_LEVEL_BY_SUBSET)) {
      expect(AVAILABLE_GEO_LEVELS).toContain(level);
    }
    for (const level of AVAILABLE_GEO_LEVELS) {
      expect(FEATURE_ID_KEYS[level]).toBe("properties.GEOID");
    }
  });

  it.each([
    ["counties", 58],
    ["regions", 9],
    ["states", 52],
  ])("gives each of the %s %i features a unique GEOID and a representative point", async (level, count) => {
    const geojson = await loadGeometry(level);
    const ids = geojson.features.map((feature) => feature.properties.GEOID);
    expect(ids).toHaveLength(count);
    expect(new Set(ids).size).toBe(count);
    expect(Object.keys(await loadRepresentativePoints(level)).sort()).toEqual([...ids].sort());
  });

  it("stays light enough to send to a browser", async () => {
    // The detailed source files hold 39,692, 246,286, and 13,706 points.
    const limits = { counties: 3000, regions: 1500, states: 5000 };
    for (const [level, limit] of Object.entries(limits)) {
      const geojson = await loadGeometry(level);
      const points = JSON.stringify(geojson).match(/\[-?\d+(\.\d+)?,-?\d+(\.\d+)?\]/g).length;
      expect(points, level).toBeLessThan(limit);
    }
  });

  // Plotly draws with d3-geo, which reads a ring's direction as which side is
  // inside. A counter-clockwise outer ring (the GeoJSON standard, and how the
  // source files run) fills the whole map except the shape: every place still
  // counts as drawn, so only this check or looking at the map will catch it.
  it.each(["counties", "regions", "states"])("winds every %s ring so its shape draws right side out", async (level) => {
    const signedArea = (ring) =>
      ring.slice(1).reduce((sum, [lon, lat], index) => sum + (lon - ring[index][0]) * (lat + ring[index][1]), 0);
    const geojson = await loadGeometry(level);
    for (const { properties, geometry } of geojson.features) {
      const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
      for (const [outer, ...holes] of polygons) {
        expect(signedArea(outer), properties.NAME).toBeGreaterThan(0);
        for (const hole of holes) expect(signedArea(hole), properties.NAME).toBeLessThan(0);
      }
    }
  });

  it("joins region names to themselves, the project's canonical region id", async () => {
    const lookup = await getFeatureIdLookup("regions");
    expect([...lookup.keys()].sort()).toEqual(REGIONS);
    expect(lookup.get("Bay Area")).toBe("Bay Area");
  });

  it("resolves a state from either its name or its abbreviation", async () => {
    const lookup = await getFeatureIdLookup("states");
    expect(lookup.get("Alaska")).toBe("02");
    expect(lookup.get("AK")).toBe("02");
    expect(lookup.get("California")).toBe("06");
    expect(lookup.get("CA")).toBe("06");
  });

  it("joins counties by bare name to their FIPS id", async () => {
    const lookup = await getFeatureIdLookup("counties");
    expect(lookup.get("Alameda")).toBe("06001");
  });
});
