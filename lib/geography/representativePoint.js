/**
 * A representative point for a GeoJSON Polygon/MultiPolygon, guaranteed to
 * fall inside the shape (unlike a plain centroid, which can land outside a
 * concave ring, or offshore on an irregular coastline).
 *
 * Client-safe — no `node:fs` — so it can be unit-tested directly and reused
 * by any server module that owns the actual file read (today: lib/data/geography.js).
 *
 * Coordinates are always [lon, lat], matching GeoJSON order.
 *
 * KNOWN LIMITATION: this derives a point from the existing county polygons
 * rather than from an authoritative point source. It is a reasonable stand-in
 * for a magnitude-by-county symbol map, but is not a verified place marker —
 * revisit with a dedicated point file if a derived point ever proves
 * insufficient (see Workstream D, visualization-specification.md).
 */

/** Signed shoelace area of a [lon, lat][] ring. Positive/negative encodes winding, not used here beyond magnitude. */
function ringArea(ring) {
  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Area-weighted polygon centroid. Falls back to a plain vertex average for a degenerate (zero-area) ring. */
function ringCentroid(ring) {
  const area = ringArea(ring);
  if (area === 0) {
    const n = ring.length;
    const sum = ring.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
    return [sum[0] / n, sum[1] / n];
  }
  let cx = 0;
  let cy = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  const factor = 1 / (6 * area);
  return [cx * factor, cy * factor];
}

/** Ray-casting point-in-ring test. */
function pointInRing([px, py], ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * The part to derive a point from — all of its rings, outer first: a Polygon's
 * own rings, or a MultiPolygon's largest part by outer-ring area (so a mainland
 * county with small island parts places its point on the mainland, never on an
 * island).
 */
function largestPart(geometry) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates;
  }
  if (geometry.type === "MultiPolygon") {
    let best = null;
    let bestArea = -Infinity;
    for (const part of geometry.coordinates) {
      const area = Math.abs(ringArea(part[0]));
      if (area > bestArea) {
        bestArea = area;
        best = part;
      }
    }
    return best;
  }
  throw new Error(`representativePoint: unsupported geometry type "${geometry.type}"`);
}

/**
 * Inside the part, meaning inside its outer ring and outside every hole. No
 * California county has a hole today, but a place that fully encloses an
 * independent jurisdiction does, and a point in the middle of the hole would be
 * a marker sitting in a place that is not the one it labels.
 */
function pointInPart([px, py], rings) {
  if (!pointInRing([px, py], rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing([px, py], hole));
}

/**
 * Horizontal-scanline fallback: intersect every ring's edges with y, sort the
 * crossings, and return the midpoint of the widest inside interval (even-odd
 * rule). A simplified version of the "point on surface" technique GIS tools
 * use — guarantees an interior point for any simple polygon, unlike a plain
 * centroid on a concave shape. Holes need no special case: their crossings join
 * the same sorted list, and even-odd parity already treats the span across a
 * hole as outside.
 */
function scanlineInteriorPoint(rings, y) {
  const xs = [];
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % n];
      if (y1 === y2) continue; // horizontal edge: no single crossing
      if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
  }
  xs.sort((a, b) => a - b);
  let widest = null;
  let widestSpan = -Infinity;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const span = xs[i + 1] - xs[i];
    if (span > widestSpan) {
      widestSpan = span;
      widest = [(xs[i] + xs[i + 1]) / 2, y];
    }
  }
  return widest;
}

/**
 * A point guaranteed to fall inside the geometry's largest part: the area-
 * weighted centroid where that lands inside the shape, otherwise a
 * scanline-derived interior point. Returns [lon, lat].
 */
export function representativePoint(geometry) {
  const rings = largestPart(geometry);
  const outer = rings[0];
  const centroid = ringCentroid(outer);
  if (pointInPart(centroid, rings)) return centroid;

  // A concave ring (or a hole under the centroid) can put the centroid outside
  // the shape; nudge the scanline off the centroid's own y in case that y
  // grazes a vertex with no clean crossing pair, rather than guessing forever.
  const ys = outer.map(([, y]) => y);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const epsilon = (yMax - yMin) * 1e-6 || 1e-9;
  for (const y of [centroid[1], centroid[1] + epsilon, centroid[1] - epsilon]) {
    const point = scanlineInteriorPoint(rings, y);
    if (point) return point;
  }
  // Degenerate ring the scanline couldn't resolve: the centroid is the best
  // answer left, even though it may sit outside the shape.
  return centroid;
}
