/**
 * Workstream Q - the Plotly scatter and bubble read a module's paired rows
 * (one row per measure) exactly as the visx model does, so the two renderers
 * agree on which points exist and where they sit.
 */

import { describe, expect, it } from "vitest";

import { adaptObservations } from "@/lib/visualization/adapters";
import { buildPointModel } from "@/lib/visualization/models/pointModel";
import { input } from "@/tests/fixtures/visualization-v3/renderer";
import { moduleScatterRows } from "@/tests/fixtures/visualization-v3/modulePoints";

describe("Plotly points from paired module rows", () => {
  it("draws the same points in the Plotly scatter", () => {
    const fixture = input("scatter", { observations: moduleScatterRows });
    const trace = adaptObservations(fixture).data[0];

    // Marin (suppressed horizontal value) is left out in both renderers.
    expect(trace.x).toEqual([10, 20]);
    expect(trace.y).toEqual([40000, 50000]);
    expect(trace.text).toEqual(["San Francisco", "Los Angeles"]);

    const model = buildPointModel(fixture);
    expect(model.points.map((point) => point.x)).toEqual(trace.x);
    expect(model.points.map((point) => point.y)).toEqual(trace.y);
  });

  it("sizes the Plotly bubble from the size measure", () => {
    const trace = adaptObservations(input("bubble", { observations: moduleScatterRows })).data[0];
    expect(trace.x).toEqual([10, 20]);
    expect(trace.marker.size).toEqual([100, 400]);
    expect(trace.marker.sizemode).toBe("area");
  });
});
