import { describe, expect, it } from "vitest";

import { representativePoint } from "@/lib/geography/representativePoint";

describe("representativePoint", () => {
  it("returns the exact center of a rectangle", () => {
    const rectangle = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 5],
          [0, 5],
          [0, 0],
        ],
      ],
    };
    const [lon, lat] = representativePoint(rectangle);
    expect(lon).toBeCloseTo(5);
    expect(lat).toBeCloseTo(2.5);
  });

  it("falls back to a scanline point when the plain centroid lands outside a concave ring", () => {
    // A "U" shape: a notch cut from the top-middle of an otherwise solid
    // rectangle. Its area-weighted centroid sits inside the notch (i.e.
    // outside the polygon), which is exactly the case a plain centroid gets
    // wrong and the scanline fallback exists to fix.
    const uShape = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [12, 0],
          [12, 10],
          [8, 10],
          [8, 4],
          [4, 4],
          [4, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    };
    const ring = uShape.coordinates[0];
    const point = representativePoint(uShape);

    // The naive centroid of this exact shape lands at (6, 4.5), inside the
    // notch — confirming this fixture actually exercises the fallback.
    expect(pointInRing([6, 4.5], ring)).toBe(false);

    expect(pointInRing(point, ring)).toBe(true);
  });

  it("stays out of a hole the centroid would otherwise land in", () => {
    // A square with a large square cut out of its middle: the centroid of the
    // outer ring sits dead centre, which is inside the hole and therefore
    // outside the shape. No California county has a hole today, but a place
    // enclosing an independent jurisdiction does, and a marker in the middle of
    // the hole would label somewhere that is not the place it names.
    const donut = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [3, 3],
          [7, 3],
          [7, 7],
          [3, 7],
          [3, 3],
        ],
      ],
    };
    const [lon, lat] = representativePoint(donut);
    const inOuter = pointInRing([lon, lat], donut.coordinates[0]);
    const inHole = pointInRing([lon, lat], donut.coordinates[1]);
    expect(inOuter).toBe(true);
    expect(inHole).toBe(false);
  });

  it("prefers the mainland part of a MultiPolygon over a small island part", () => {
    const mainlandPlusIsland = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
        [
          [
            [20, 20],
            [21, 20],
            [21, 21],
            [20, 21],
            [20, 20],
          ],
        ],
      ],
    };
    const [lon, lat] = representativePoint(mainlandPlusIsland);
    expect(lon).toBeGreaterThanOrEqual(0);
    expect(lon).toBeLessThanOrEqual(10);
    expect(lat).toBeGreaterThanOrEqual(0);
    expect(lat).toBeLessThanOrEqual(10);
  });
});

// Re-implemented locally (not imported) so the "naive centroid lands
// outside" assertion above exercises the same ray-casting rule the module
// uses internally, without reaching into its unexported internals.
function pointInRing([px, py], ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}
