/** Workstream A: forest reference-line and category-axis regressions. */

import { describe, expect, it } from "vitest";

import { COLORS } from "@/lib/constants";
import { toPlotly } from "@/lib/visualization/toPlotly";

const studies = [
  { category: "Study A", start: 0.4, end: 1.2, point: 0.8 },
  { category: "Study B", start: 0.7, end: 1.8, point: 1.1 },
];

function forestSpec(appearance = {}, series = studies, bindings = {}) {
  return toPlotly({
    chartType: "forest",
    bindings: {
      category: "category",
      start: "start",
      end: "end",
      point: "point",
      ...bindings,
    },
    series,
    labels: {},
    appearance,
  });
}

function referenceShapes(result) {
  return (result.layout.shapes || []).filter(
    (shape) => shape.type === "line" && shape.line?.dash === "dash",
  );
}

describe("forest interval endpoints", () => {
  it("renders lower and upper bounds as separate hoverable legend items", () => {
    const { data } = forestSpec();
    const lower = data.find((trace) => trace.name === "start");
    const upper = data.find((trace) => trace.name === "end");
    const interval = data.find(
      (trace) => trace.mode === "lines" && trace.showlegend === false,
    );

    expect(lower.x).toEqual([0.4, 0.7]);
    expect(upper.x).toEqual([1.2, 1.8]);
    expect(lower.showlegend).not.toBe(false);
    expect(upper.showlegend).not.toBe(false);
    expect(lower.hovertemplate).toContain("start: %{x}");
    expect(upper.hovertemplate).toContain("end: %{x}");
    expect(interval.hovertemplate).toContain("start: %{customdata[0]}");
    expect(interval.hovertemplate).toContain("end: %{customdata[1]}");
  });

  it("keeps vertical bars neutral while coloring other endpoints from the palette", () => {
    const caps = forestSpec({ endpointStyle: "caps", palette: "ui-kit-teal" });
    const dots = forestSpec({ endpointStyle: "dots", palette: "ui-kit-teal" });

    expect(caps.data.find((trace) => trace.name === "start").marker.color).toBe(
      COLORS.gray5,
    );
    expect(caps.data.find((trace) => trace.name === "end").marker.color).toBe(
      COLORS.gray5,
    );
    expect(caps.data.find((trace) => trace.name === "point").marker.color).toBe(
      COLORS.teal7,
    );

    expect(dots.data.find((trace) => trace.name === "start").marker.color).toBe(
      COLORS.teal7,
    );
    expect(dots.data.find((trace) => trace.name === "end").marker.color).toBe(
      COLORS.teal2,
    );
    expect(dots.data.find((trace) => trace.name === "point").marker.color).toBe(
      COLORS.teal8,
    );
  });

  it("renders the estimate circle at the same size as endpoint circles", () => {
    const { data } = forestSpec({ endpointStyle: "dots", pointStyle: "dot" });
    const lower = data.find((trace) => trace.name === "start");
    const estimate = data.find((trace) => trace.name === "point");

    expect(lower.marker.symbol).toBe("circle");
    expect(estimate.marker.symbol).toBe("circle");
    expect(estimate.marker.size).toBe(lower.marker.size);
  });
});

describe("forest value-axis center", () => {
  it("symmetrically anchors the range around an explicit center", () => {
    const centered = forestSpec(
      { center: 1 },
      [
        { category: "Study A", start: 0.15, end: 0.5, point: 0.25 },
        { category: "Study B", start: 0.2, end: 0.4, point: 0.3 },
      ],
    );
    const [minimum, maximum] = centered.layout.xaxis.range;

    expect((minimum + maximum) / 2).toBeCloseTo(1);
    expect(minimum).toBeLessThan(0.15);
    expect(maximum).toBeGreaterThan(1);
    expect(centered.layout.xaxis.autorange).toBe(false);
  });

  it("leaves Plotly autoranging in place when center is blank", () => {
    expect(forestSpec({ center: null }).layout.xaxis.range).toBeUndefined();
  });
});

describe("forest line of no effect", () => {
  it("draws no reference shape when noEffectValue is null", () => {
    expect(referenceShapes(forestSpec({ noEffectValue: null }))).toEqual([]);
  });

  it("draws no reference shape when noEffectValue is undefined", () => {
    expect(referenceShapes(forestSpec({}))).toEqual([]);
  });

  it("draws a reference shape at zero when noEffectValue is 0", () => {
    expect(referenceShapes(forestSpec({ noEffectValue: 0 }))).toHaveLength(1);
    expect(referenceShapes(forestSpec({ noEffectValue: 0 }))[0]).toMatchObject({
      x0: 0,
      x1: 0,
    });
  });

  it("draws a reference shape at one when noEffectValue is 1", () => {
    expect(referenceShapes(forestSpec({ noEffectValue: 1 }))).toHaveLength(1);
    expect(referenceShapes(forestSpec({ noEffectValue: 1 }))[0]).toMatchObject({
      x0: 1,
      x1: 1,
    });
  });

  it("removes the reference shape when noEffectValue returns to null", () => {
    const shown = forestSpec({ noEffectValue: 1 });
    const cleared = forestSpec({ noEffectValue: null });

    expect(referenceShapes(shown)).toHaveLength(1);
    expect(referenceShapes(cleared)).toHaveLength(0);
  });

  it("bounds the reference line to the plotted rows, not the paper", () => {
    const grouped = forestSpec(
      { noEffectValue: 1, groupGap: 1 },
      [
        { ...studies[0], group: "Education" },
        { ...studies[1], group: "Occupation" },
      ],
      { group: "group" },
    );
    const [line] = referenceShapes(grouped);

    expect(line.yref).toBe("y");
    expect(line.y0).toBe(-0.5);
    expect(line.y1).toBeLessThanOrEqual(grouped.layout.yaxis.range[0]);
    const firstHeader = grouped.layout.annotations.find(
      (annotation) => annotation.name === "ppic-group-header",
    );
    expect(line.y0).toBeGreaterThan(firstHeader.y);

    const [ungroupedLine] = referenceShapes(forestSpec({ noEffectValue: 1 }));
    expect(ungroupedLine).toMatchObject({
      yref: "y",
      y0: "Study A",
      y1: "Study B",
    });
  });

  it("keeps the category axis free of tick marks and a spine", () => {
    const grouped = forestSpec(
      {},
      studies.map((study, index) => ({
        ...study,
        group: index ? "Occupation" : "Education",
      })),
      { group: "group" },
    );
    const ungrouped = forestSpec();

    for (const result of [grouped, ungrouped]) {
      expect(result.layout.yaxis.ticks).toBe("");
      expect(result.layout.yaxis.showline).toBe(false);
    }
  });

  it("keeps horizontal gridlines", () => {
    expect(forestSpec().layout.yaxis.showgrid).toBe(true);
    expect(
      forestSpec(
        {},
        studies.map((study) => ({ ...study, group: "Section" })),
        { group: "group" },
      ).layout.yaxis.showgrid,
    ).toBe(true);
  });
});
