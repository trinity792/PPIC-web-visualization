import { expect, it } from "vitest";
import { directLabels } from "@/lib/visualization/chartLayout/directLabels";
import { contrastRatio } from "@/lib/visualization/chartLayout/contrast";
const series = [
  { id: "a", label: "A", color: "#293B54", points: [{ y: 30, value: 10, status: "available" }] },
  { id: "b", label: "B", color: "#F9E1D9", points: [{ y: 80, value: 20, status: "available" }] },
];
const layout = (items = series, height = 200) => directLabels({ series: items, height, fontSize: 14 });
it("places each label at its line's last point when nothing overlaps", () => {
  expect(layout().fits).toBe(true);
  expect(layout().labels.map(l => l.y)).toEqual([30, 80]);
});
it("pushes overlapping labels apart without swapping them", () => {
  const result = layout([series[0], { ...series[1], points: [{ y: 31, value: 20, status: "available" }] }]);
  expect(result.fits).toBe(true);
  expect(result.labels.map(l => l.id)).toEqual(["a", "b"]);
  expect(result.labels[1].y - result.labels[0].y).toBeGreaterThanOrEqual(14);
  expect(result.labels.every(l => l.y >= 0 && l.y <= 200)).toBe(true);
});
it("reports does-not-fit with more than four series", () => expect(layout(Array.from({length:5}, (_,i) => ({ ...series[0], id: String(i) }))).fits).toBe(false));
it("reports does-not-fit when labels cannot fit the height", () => expect(layout(series, 20).fits).toBe(false));
// Owner decision 2026-09-29: like PPIC's published charts, a pale series color
// is darkened (same hue) until it reads, instead of gray text with a sample.
it("keeps a series color that already reaches 4.5 to 1 contrast", () => {
  expect(layout().labels[0]).toMatchObject({ textColor: "#293B54", color: "#293B54" });
});
it("darkens a pale series color just enough to reach 4.5 to 1 contrast", () => {
  const pale = layout().labels[1];
  expect(pale.color).toBe("#F9E1D9");
  expect(contrastRatio(pale.textColor, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  // Only as dark as needed, not black.
  expect(contrastRatio(pale.textColor, "#FFFFFF")).toBeLessThan(5);
  // Same warm hue: red stays the strongest channel, blue the weakest.
  const [r, g, b] = [1, 3, 5].map(i => parseInt(pale.textColor.slice(i, i + 2), 16));
  expect(r).toBeGreaterThan(g);
  expect(g).toBeGreaterThan(b);
});
it("uses the last available point, skipping a trailing gap", () => {
  const result = layout([{ ...series[0], points: [...series[0].points, { y: null, value: null, status: "missing" }] }]);
  expect(result.labels[0].y).toBe(30);
});
