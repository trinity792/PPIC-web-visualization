/**
 * Tests for lib/visualization/toPlotly.js — the declarative-spec → Plotly
 * adapter. Focused on the graph-editor overhaul Phase 2 changes: heatmap
 * transforms, and colors sourced through lib/visualization/palettes.js.
 */

import { describe, expect, it } from "vitest";

import { BASE_PLOTLY_COLORS, COLORS } from "@/lib/constants";
import { paletteForScale, resolveToken } from "@/lib/visualization/palettes";
import { fitFootnoteLayout, toPlotly } from "@/lib/visualization/toPlotly";

const countField = {
  kind: "measure",
  unit: "count",
  transforms: ["actual", "indexed", "numericChange", "percentChange"],
};

describe("toPlotly footnote", () => {
  const spec = {
    chartType: "line",
    bindings: { x: "Year", y: "Value" },
    series: [{ location: "California", years: [2024], values: [10] }],
    labels: { xAxis: "Year" },
    appearance: {},
  };

  it("renders a gray3 callout below the x-axis text", () => {
    const withoutFootnote = toPlotly(spec);
    const { layout } = toPlotly({
      ...spec,
      labels: { ...spec.labels, footnote: "Source: PPIC" },
    });
    const footnote = layout.annotations.find(
      (annotation) => annotation.text === "Source: PPIC",
    );

    expect(footnote).toMatchObject({
      x: 0,
      xanchor: "left",
      y: 0,
      yanchor: "top",
      bgcolor: COLORS.gray3,
      bordercolor: COLORS.gray3,
      borderpad: 8,
      borderwidth: 0,
      showarrow: false,
      font: { color: COLORS.darkGray },
    });
    expect(footnote.yshift).toBeLessThan(0);
    expect(layout.margin.b).toBeGreaterThan(withoutFootnote.layout.margin.b);
  });

  it("keeps a bottom legend below the footnote callout", () => {
    const { layout } = toPlotly({
      ...spec,
      labels: { ...spec.labels, footnote: "Source: PPIC" },
      appearance: { legendPosition: "bottom" },
    });

    expect(layout.legend.y).toBeLessThan(-0.3);
    expect(layout.margin.b).toBeGreaterThan(104);
  });

  it("spans the x-axis width and reserves space for wrapped lines", () => {
    const shortLayout = toPlotly({
      ...spec,
      labels: { ...spec.labels, footnote: "Short note" },
    }).layout;
    const longLayout = toPlotly({
      ...spec,
      labels: {
        ...spec.labels,
        footnote: "A long footnote that wraps onto several lines in a narrow graph. ".repeat(4),
      },
    }).layout;
    const fittedShort = fitFootnoteLayout(shortLayout, 600, 420);
    const fittedLong = fitFootnoteLayout(longLayout, 300, 420);
    const manualBreakLayout = toPlotly({
      ...spec,
      labels: { ...spec.labels, footnote: "First line\nSecond line" },
    }).layout;
    const fittedManualBreak = fitFootnoteLayout(manualBreakLayout, 600, 420);
    const shortFootnote = fittedShort.annotations.find(
      (annotation) => annotation.name === "ppic-footnote",
    );

    // 600px chart - 70px left margin - 40px right margin - 16px callout padding.
    expect(shortFootnote.width).toBe(474);
    expect(fittedLong.margin.b).toBeGreaterThan(longLayout.margin.b);
    expect(fittedManualBreak.margin.b).toBeGreaterThan(manualBreakLayout.margin.b);
  });

  it("supports bold and italic Markdown while escaping raw HTML", () => {
    const { layout } = toPlotly({
      ...spec,
      labels: {
        ...spec.labels,
        footnote: "**Bold** and *italic*; __also bold__ and _also italic_ <script>",
      },
    });
    const footnote = layout.annotations.find(
      (annotation) => annotation.name === "ppic-footnote",
    );

    expect(footnote.text).toBe(
      "<b>Bold</b> and <i>italic</i>; <b>also bold</b> and <i>also italic</i> &lt;script&gt;",
    );
  });
});

describe("toPlotly line spacing", () => {
  const spec = {
    chartType: "line",
    bindings: { x: "Year", y: "Value" },
    series: [{ location: "California", years: [2020, 2025], values: [10, 20] }],
    labels: {},
  };

  it("keeps the existing grid defaults in Automatic mode", () => {
    const { layout } = toPlotly({ ...spec, appearance: {} });

    expect(layout.xaxis.showgrid).toBe(false);
    expect(layout.xaxis.nticks).toBeUndefined();
    expect(layout.yaxis.showgrid).toBe(true);
    expect(layout.yaxis.nticks).toBeUndefined();
  });

  it("keeps tick intervals intact and passes pixel padding with position counts", () => {
    const { layout } = toPlotly({
      ...spec,
      appearance: {
        horizontalLinePadding: 8,
        verticalLinePadding: 12,
      },
    });

    expect(layout.xaxis.showgrid).toBe(false);
    expect(layout.xaxis.nticks).toBeUndefined();
    expect(layout.yaxis.showgrid).toBe(true);
    expect(layout.yaxis.nticks).toBeUndefined();
    expect(layout.meta.ppicLinePadding).toEqual({
      horizontal: 8,
      vertical: 12,
      horizontalCount: 1,
      verticalCount: 2,
    });
  });

  it("uses category positions for vertical bars and x-axis ticks for horizontal bars", () => {
    const barSpec = {
      chartType: "bar",
      bindings: { category: "category", y: "value" },
      series: [
        { category: "A", value: 10 },
        { category: "B", value: 20 },
        { category: "C", value: 30 },
      ],
      labels: {},
      appearance: { horizontalLinePadding: 4, verticalLinePadding: 6 },
    };

    expect(toPlotly(barSpec).layout.meta.ppicLinePadding).toMatchObject({
      horizontalCount: 6,
      verticalCount: 3,
    });
    expect(
      toPlotly({
        ...barSpec,
        appearance: { ...barSpec.appearance, orientation: "horizontal" },
      }).layout.meta.ppicLinePadding,
    ).toMatchObject({ horizontalCount: 3, verticalCount: 6 });
  });
});

describe("toPlotly heatmap", () => {
  const matrix = { x: [2020, 2021, 2022], y: ["A", "B"], z: [
    [10, 20, 30],
    [5, 10, 15],
  ] };

  it("leaves the matrix unchanged for the default 'actual' transform", () => {
    const { data } = toPlotly({
      chartType: "heatmap",
      series: matrix,
      appearance: {},
      field: countField,
    });
    expect(data[0].z).toEqual(matrix.z);
  });

  it("indexes each row to 100 at the base-year column", () => {
    const { data } = toPlotly({
      chartType: "heatmap",
      series: matrix,
      appearance: {},
      field: countField,
      transforms: { id: "indexed", baseYear: 2020 },
    });
    expect(data[0].z).toEqual([
      [100, 200, 300],
      [100, 200, 300],
    ]);
  });

  it("is null-safe: a missing cell stays null rather than becoming 0", () => {
    const withGap = { x: [2020, 2021], y: ["A"], z: [[10, null]] };
    const { data } = toPlotly({
      chartType: "heatmap",
      series: withGap,
      appearance: {},
      field: countField,
      transforms: { id: "numericChange", baseYear: 2020 },
    });
    expect(data[0].z).toEqual([[0, null]]);
  });
});

describe("toPlotly bar (unchanged for 'actual')", () => {
  it("renders raw values and the default palette's first color", () => {
    const { data } = toPlotly({
      chartType: "bar",
      bindings: { category: "category", y: "value" },
      series: [
        { category: "A", value: 10 },
        { category: "B", value: 20 },
      ],
      appearance: {},
    });
    expect(data).toHaveLength(1);
    expect(data[0].y).toEqual([10, 20]);
    expect(data[0].marker.color).toBe(BASE_PLOTLY_COLORS[0]);
  });

  it("applies advanced category visibility and drag order", () => {
    const { data } = toPlotly({
      chartType: "bar",
      bindings: { category: "category", y: "value" },
      series: [
        { category: "Alpha", value: 10 },
        { category: "Bravo", value: 20 },
        { category: "Charlie", value: 30 },
      ],
      appearance: {
        categoryOrder: ["Charlie", "Alpha", "Bravo"],
        hiddenCategories: ["Alpha"],
      },
    });
    expect(data[0].x).toEqual(["Charlie", "Bravo"]);
    expect(data[0].y).toEqual([30, 20]);
  });
});

describe("toPlotly choropleth (unchanged for 'actual')", () => {
  it("renders raw values with the legacy sequential ramp", () => {
    const { data } = toPlotly({
      chartType: "choroplethMap",
      bindings: { geography: "geoid", color: "value" },
      series: [{ geoid: "06001", value: 5 }],
      geometry: { type: "FeatureCollection", features: [] },
      appearance: {},
    });
    expect(data[0].z).toEqual([5]);
    expect(data[0].colorscale).toEqual(paletteForScale("sequential"));
  });

  it("switches to the diverging ramp when appearance.colorScale is 'diverging'", () => {
    const { data } = toPlotly({
      chartType: "choroplethMap",
      bindings: { geography: "geoid", color: "value" },
      series: [{ geoid: "06001", value: 5 }],
      geometry: { type: "FeatureCollection", features: [] },
      appearance: { colorScale: "diverging" },
    });
    expect(data[0].colorscale).toBe("RdBu");
  });
});

describe("toPlotly line series colors", () => {
  const series = [
    { location: "A", years: [2020, 2021], values: [1, 2] },
    { location: "B", years: [2020, 2021], values: [3, 4] },
  ];

  it("uses the default palette cycle when no override or palette is set", () => {
    const { data } = toPlotly({
      chartType: "line",
      bindings: { x: "Year", y: "Value" },
      series,
      appearance: {},
    });
    expect(data[0].line.color).toBe(BASE_PLOTLY_COLORS[0]);
    expect(data[1].line.color).toBe(BASE_PLOTLY_COLORS[1]);
  });

  it("applies advanced line visibility and drag order", () => {
    const { data } = toPlotly({
      chartType: "line",
      bindings: { x: "Year", y: "Value" },
      series,
      appearance: {
        categoryOrder: ["B", "A"],
        hiddenCategories: ["A"],
      },
    });
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("B");
  });

  it("honors a per-series seriesColors override", () => {
    const { data } = toPlotly({
      chartType: "line",
      bindings: { x: "Year", y: "Value" },
      series,
      appearance: { seriesColors: { B: "burntOrange" } },
    });
    expect(data[0].line.color).toBe(BASE_PLOTLY_COLORS[0]);
    // "burntOrange" overrides B's default-cycle color ("orange3" at index 1).
    expect(data[1].line.color).toBe(COLORS.burntOrange);
    expect(data[1].line.color).not.toBe(BASE_PLOTLY_COLORS[1]);
  });

  it("switches every un-overridden series when the palette changes", () => {
    const { data } = toPlotly({
      chartType: "line",
      bindings: { x: "Year", y: "Value" },
      series,
      appearance: { palette: "colorblind-safe" },
    });
    expect(data[0].line.color).toBe(resolveToken("blue5"));
    expect(data[1].line.color).toBe(resolveToken("orange2"));
  });
});
