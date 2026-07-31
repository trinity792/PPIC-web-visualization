import { describe, expect, it } from "vitest";

import { loadGeometry, loadRepresentativePoints } from "@/lib/data/geography";

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
