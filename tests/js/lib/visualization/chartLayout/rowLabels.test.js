import { expect, it } from "vitest";
import { rowLabels } from "@/lib/visualization/chartLayout/rowLabels";
it("right-aligns row labels by default", () => {
  const result = rowLabels({ labels: ["San Francisco", "Los Angeles"], fontSize: 14, maxWidth: 160 });
  expect(result.width).toBeGreaterThan(0);
  expect(result.labels.map(l => l.textAnchor)).toEqual(["end", "end"]);
  expect(result.labels[0].x).toBe(result.labels[1].x);
});
it("wraps a long row label instead of cutting it off", () => {
  const text = "San Francisco residents aged sixty five and older";
  const result = rowLabels({ labels: [text], fontSize: 14, maxWidth: 160 });
  expect(result.labels[0].lines.length).toBeGreaterThan(1);
  expect(result.labels[0].lines.join(" ")).toBe(text);
  expect(result.width).toBeLessThanOrEqual(160);
});
it.each([["left", "start"], ["center", "middle"], ["right", "end"]])("honors %s alignment", (alignment, anchor) => expect(rowLabels({ labels: ["A"], fontSize: 14, maxWidth: 160, alignment }).labels[0].textAnchor).toBe(anchor));
