import { describe, expect, it } from "vitest";

import { placePointLabels } from "@/lib/visualization/chartLayout/pointLabels";

// Owner's reference scatter (2026-10-05): names beside their points, right
// first, wrapped onto short lines, never covering each other.
const plot = { fontSize: 14, maxWidth: 96, gap: 6, width: 600, height: 400 };

describe("placePointLabels", () => {
  it("puts a name to the right of its point first", () => {
    const [label] = placePointLabels({ ...plot, points: [{ x: 100, y: 100, radius: 4, text: "Bay Area" }] });
    expect(label).toMatchObject({ side: "right", textAnchor: "start", lines: ["Bay Area"] });
    expect(label.x).toBe(110);
  });

  it("wraps a long name onto short lines", () => {
    const [label] = placePointLabels({ ...plot, points: [{ x: 100, y: 100, radius: 4, text: "Central Valley and Sierra" }] });
    expect(label.lines).toEqual(["Central", "Valley and", "Sierra"]);
  });

  it("moves to the left near the right edge, then above or below", () => {
    const [left] = placePointLabels({ ...plot, points: [{ x: 590, y: 100, radius: 4, text: "Bay Area" }] });
    expect(left.side).toBe("left");
    const [first, second] = placePointLabels({
      ...plot,
      points: [
        { x: 100, y: 100, radius: 4, text: "Orange County" },
        { x: 104, y: 100, radius: 4, text: "Los Angeles County" },
      ],
    });
    expect([first.side, second.side]).toEqual(["right", "left"]);
    const [above] = placePointLabels({ ...plot, width: 120, points: [{ x: 60, y: 100, radius: 4, text: "Bay Area" }] });
    expect(above).toMatchObject({ side: "above", textAnchor: "middle" });
  });

  it("reads a corner point's name away from the edges", () => {
    const [label] = placePointLabels({ ...plot, points: [{ x: 588, y: 12, radius: 4, text: "Inland Empire" }] });
    expect(label).toMatchObject({ side: "below-left", textAnchor: "end", x: 588 });
    expect(label.box.x1).toBeLessThanOrEqual(600);
  });

  it("leaves out a name that fits nowhere, and avoids obstacles", () => {
    const crowded = placePointLabels({ ...plot, width: 30, height: 30, points: [{ x: 15, y: 15, radius: 4, text: "Sacramento Area" }] });
    expect(crowded).toEqual([null]);
    const [label] = placePointLabels({
      ...plot,
      points: [{ x: 100, y: 100, radius: 4, text: "Northern" }],
      obstacles: [{ x0: 104, y0: 80, x1: 300, y1: 120 }],
    });
    expect(label.side).not.toBe("right");
  });

  it("keeps a name off every other point", () => {
    const [label] = placePointLabels({
      ...plot,
      points: [
        { x: 100, y: 100, radius: 4, text: "Northern" },
        { x: 130, y: 100, radius: 4, text: "" },
      ],
    });
    expect(label.side).toBe("left");
  });

  it("names close neighbours at a narrow plot edge, using a corner placement", () => {
    const points = [
      { x: 20, y: 200, radius: 4, text: "Bay" },
      { x: 60, y: 200, radius: 4, text: "Northern" },
    ];
    const labels = placePointLabels({ ...plot, width: 130, height: 400, points });
    expect(labels.filter(Boolean)).toHaveLength(2);
  });
});
