/**
 * Tests for lib/visualization/toPlotly.js — the declarative-spec → Plotly
 * adapter. Focused on the graph-editor overhaul Phase 2 changes: heatmap
 * transforms, and colors sourced through lib/visualization/palettes.js.
 */

import { describe, expect, it } from "vitest";

import { BASE_PLOTLY_COLORS, COLORS } from "@/lib/constants";
import { paletteForScale, resolveToken } from "@/lib/visualization/palettes";
import {
  fitFootnoteLayout,
  groupedCategorySections,
  toPlotly,
} from "@/lib/visualization/toPlotly";

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

  it("renders a soft, light callout below the x-axis text", () => {
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
      bgcolor: COLORS.gray1,
      bordercolor: COLORS.gray2,
      borderpad: 8,
      borderwidth: 1,
      showarrow: false,
      font: { color: COLORS.gray6 },
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

  it("spans the x-axis width, minus a side legend, and reserves wrap space", () => {
    const footnoteWidth = (layout, w, h) =>
      fitFootnoteLayout(layout, w, h).annotations.find(
        (annotation) => annotation.name === "ppic-footnote",
      ).width;

    // No legend → the callout spans the full plot width.
    // 600px - 70 left - 40 right - 2*(8 pad + 1 border) = 472.
    const noLegend = toPlotly({
      ...spec,
      appearance: { legendPosition: "hidden" },
      labels: { ...spec.labels, footnote: "Short note" },
    }).layout;
    const fullWidth = footnoteWidth(noLegend, 600, 420);
    expect(fullWidth).toBe(472);

    // A right-hand legend reserves a column, so the callout stops before it.
    const rightLegend = toPlotly({
      ...spec,
      labels: { ...spec.labels, footnote: "Short note" },
    }).layout;
    expect(footnoteWidth(rightLegend, 600, 420)).toBeLessThan(fullWidth);

    // Wrapped and hard-broken footnotes still grow the bottom margin.
    const longLayout = toPlotly({
      ...spec,
      labels: {
        ...spec.labels,
        footnote: "A long footnote that wraps onto several lines in a narrow graph. ".repeat(4),
      },
    }).layout;
    expect(fitFootnoteLayout(longLayout, 300, 420).margin.b).toBeGreaterThan(
      longLayout.margin.b,
    );
    const manualBreakLayout = toPlotly({
      ...spec,
      labels: { ...spec.labels, footnote: "First line\nSecond line" },
    }).layout;
    expect(fitFootnoteLayout(manualBreakLayout, 600, 420).margin.b).toBeGreaterThan(
      manualBreakLayout.margin.b,
    );
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

describe("toPlotly hidden series", () => {
  const spec = {
    chartType: "line",
    bindings: { x: "Year", y: "Value" },
    series: [
      { location: "California", years: [2020, 2025], values: [10, 20] },
      { location: "Texas", years: [2020, 2025], values: [5, 15] },
    ],
    labels: {},
  };

  it("marks a hidden series trace visible:false, leaving others shown", () => {
    const { data } = toPlotly({
      ...spec,
      appearance: { hiddenSeries: ["Texas"] },
    });
    const texas = data.find((trace) => trace.name === "Texas");
    const california = data.find((trace) => trace.name === "California");
    expect(texas.visible).toBe(false);
    expect(california.visible).not.toBe(false);
  });

  it("does not touch traces when no series are hidden", () => {
    const { data } = toPlotly({ ...spec, appearance: {} });
    expect(data.every((trace) => trace.visible !== false)).toBe(true);
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

describe("toPlotly grouped category sections", () => {
  const records = [
    { category: "Graduate degree", group: "Education", value: 30 },
    { category: "Bachelor degree", group: "Education", value: 10 },
    { category: "Dentists", group: "Occupation", value: 40 },
    { category: "Lawyers", group: "Occupation", value: 20 },
  ];

  it("computes block order, spacer positions, and one header per block directly", () => {
    const sections = groupedCategorySections(records, {
      bindings: { category: "category", group: "group" },
      appearance: { groupGap: 0.5 },
    });
    expect(sections.items.map((item) => item.category)).toEqual([
      "Graduate degree",
      "Bachelor degree",
      "Dentists",
      "Lawyers",
    ]);
    expect(sections.tickvals).toEqual([0, 1, 2.5, 3.5]);
    expect(sections.headers.map((header) => header.label)).toEqual([
      "Education",
      "Occupation",
    ]);
  });

  it("sections bars independently from their color-series split", () => {
    const { data, layout } = toPlotly({
      chartType: "bar",
      bindings: {
        category: "category",
        group: "group",
        color: "color",
        y: "value",
      },
      series: [
        { category: "Degree", group: "Education", color: "Women", value: 75 },
        { category: "Degree", group: "Education", color: "Men", value: 100 },
        { category: "Dentists", group: "Occupation", color: "Women", value: 140 },
        { category: "Dentists", group: "Occupation", color: "Men", value: 170 },
      ],
      labels: {},
      appearance: { groupGap: 1 },
    });
    expect(data.map((trace) => trace.name)).toEqual(["Women", "Men"]);
    expect(layout.xaxis.ticktext).toEqual(["Degree", "Dentists"]);
    expect(layout.annotations.filter((annotation) => annotation.name === "ppic-group-header"))
      .toHaveLength(2);
  });

  it("widens Range row spacing with groupGap while preserving every row mark", () => {
    const spec = {
      chartType: "dumbbell",
      bindings: {
        category: "category",
        group: "group",
        start: "Women",
        end: "Men",
        point: "Total",
      },
      series: [
        { category: "Degree", group: "Education", Women: 75, Men: 100, Total: 88 },
        { category: "Dentists", group: "Occupation", Women: 140, Men: 170, Total: 152 },
      ],
      labels: {},
      // Inline shape builders use synthetic period indices internally; the
      // legend must still use the bound endpoint column names.
      period: { startYear: 0, endYear: 1 },
    };
    const compact = toPlotly({ ...spec, appearance: { groupGap: 0.5 } });
    const wide = toPlotly({ ...spec, appearance: { groupGap: 2 } });
    const compactStarts = compact.data.find((trace) => trace.name === "Women");
    const wideStarts = wide.data.find((trace) => trace.name === "Women");
    expect(compactStarts.x).toEqual([75, 140]);
    expect(wideStarts.x).toEqual([75, 140]);
    expect(wideStarts.y[1] - wideStarts.y[0]).toBeGreaterThan(
      compactStarts.y[1] - compactStarts.y[0],
    );
    expect(wide.layout.yaxis.ticktext).toEqual(["Degree", "Dentists"]);
    expect(wide.layout.yaxis.showline).toBe(false);
    const groupedAxis = wide.layout.shapes.filter(
      (shape) => shape.name === "ppic-group-axis",
    );
    expect(groupedAxis).toHaveLength(2);
    expect(groupedAxis[0]).toMatchObject({ x0: 0, x1: 0, xref: "paper", yref: "y" });
    const secondHeader = wide.layout.annotations.find(
      (annotation) => annotation.text === "<b>Occupation</b>",
    );
    expect(groupedAxis[0].y1).toBeLessThan(secondHeader.y);
    expect(groupedAxis[1].y0).toBeGreaterThan(secondHeader.y);
    const legendTraces = wide.data.filter((trace) => trace.showlegend !== false);
    expect(legendTraces.map((trace) => trace.name)).toEqual(["Women", "Men", "Total"]);
    expect(new Set(legendTraces.map((trace) => trace.marker.color)).size).toBe(3);
  });

  it("uses the same grouped row axis for dot plots and forest plots", () => {
    const dot = toPlotly({
      chartType: "dotPlot",
      bindings: { y: "Label", x: "Series", color: "Value", group: "Section" },
      series: {
        x: ["Women", "Men"],
        y: ["Degree", "Dentists"],
        z: [[75, 100], [140, 170]],
        groups: ["Education", "Occupation"],
      },
      labels: {},
      appearance: { groupGap: 1 },
    });
    expect(dot.layout.yaxis.ticktext).toEqual(["Degree", "Dentists"]);

    const forest = toPlotly({
      chartType: "forest",
      bindings: {
        category: "category",
        group: "group",
        start: "start",
        end: "end",
        point: "point",
      },
      series: [
        { category: "Study A", group: "Primary", start: 0.5, end: 1.5, point: 1 },
        { category: "Study B", group: "Secondary", start: 1, end: 2, point: 1.5 },
      ],
      labels: {},
      appearance: { groupGap: 1 },
    });
    expect(forest.layout.yaxis.ticktext).toEqual(["Study A", "Study B"]);
  });

  it("sections slopegraph legend entries into labeled groups with adjustable gap", () => {
    const { data, layout } = toPlotly({
      chartType: "slope",
      bindings: {
        category: "category",
        group: "group",
        start: "start",
        end: "end",
      },
      series: [
        { category: "A", group: "Education", start: 1, end: 2 },
        { category: "B", group: "Occupation", start: 2, end: 3 },
      ],
      labels: {},
      appearance: { groupGap: 2 },
      period: {},
    });
    expect(data[0].legendgrouptitle.text).toContain("Education");
    expect(data[1].legendgrouptitle.text).toContain("Occupation");
    expect(layout.legend.tracegroupgap).toBe(48);
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

describe("toPlotly decimal-places (measure formatting)", () => {
  const ratioField = { kind: "measure", unit: "ratio" };
  const countField2 = { kind: "measure", unit: "count" };

  const divergingSpec = (appearance = {}, field = ratioField) => ({
    chartType: "divergingBar",
    bindings: { category: "region", y: "value" },
    series: [
      { region: "A", value: 1.234 },
      { region: "B", value: 0.5 },
    ],
    appearance,
    field,
  });

  it("defaults non-integer measures to two decimals on hover and ticks", () => {
    const { data, layout } = toPlotly(divergingSpec());
    expect(data[0].hovertemplate).toContain("%{customdata:,.2f}");
    // Horizontal diverging bar → measure lives on the x-axis.
    expect(layout.xaxis.hoverformat).toBe(",.2f");
    expect(layout.xaxis.tickformat).toBe(",.2f");
  });

  it("honors an explicit decimalPlaces setting", () => {
    const { data, layout } = toPlotly(divergingSpec({ decimalPlaces: 0 }));
    expect(data[0].hovertemplate).toContain("%{customdata:,.0f}");
    expect(layout.xaxis.tickformat).toBe(",.0f");
  });

  it("leaves whole-number count measures unformatted", () => {
    const { data, layout } = toPlotly(divergingSpec({}, countField2));
    expect(data[0].hovertemplate).toContain("%{customdata}");
    expect(data[0].hovertemplate).not.toContain(":,.2f");
    expect(layout.xaxis.tickformat).toBeUndefined();
  });

  it("formats a percent-change transform of a count measure", () => {
    const { layout } = toPlotly({
      chartType: "line",
      bindings: { x: "Year", y: "Value" },
      series: [{ location: "CA", years: [2020, 2021], values: [10, 12] }],
      appearance: {},
      field: countField2,
      transforms: { id: "percentChange", baseYear: 2020 },
    });
    // Line measure lives on the y-axis; x (year) stays unformatted.
    expect(layout.yaxis.hoverformat).toBe(",.2f");
    expect(layout.xaxis.hoverformat).toBeUndefined();
  });

  it("formats non-axis tokens for pie and choropleth measures", () => {
    const pie = toPlotly({
      chartType: "pie",
      bindings: { category: "region", y: "value" },
      series: [{ region: "A", value: 1.5 }],
      appearance: {},
      field: ratioField,
    });
    expect(pie.data[0].hovertemplate).toContain("%{value:,.2f}");
  });
});

describe("toPlotly divergingBar (dashboard-style styling)", () => {
  const ratioField = { kind: "measure", unit: "ratio" };
  const baseSpec = (appearance = {}) => ({
    chartType: "divergingBar",
    bindings: { category: "region", y: "value" },
    series: [
      { region: "Ahead", value: 1.2 },
      { region: "Nearly", value: 0.8 },
      { region: "Behind", value: 0.4 },
    ],
    appearance: { center: 1, ...appearance },
    field: ratioField,
  });

  it("colors bars by threshold buckets when configured", () => {
    const buckets = [
      { at: 1.0, color: "blue3" },
      { at: 0.7, color: "teal5" },
      { at: null, color: "orange3" },
    ];
    const { data } = toPlotly(baseSpec({ colorBuckets: buckets }));
    // The single (non-rail) trace carries the per-bar colors.
    const bars = data[data.length - 1];
    expect(bars.marker.color).toEqual([COLORS.blue3, COLORS.teal5, COLORS.orange3]);
  });

  it("falls back to the above/below two-color split without buckets", () => {
    const { data } = toPlotly(baseSpec());
    const bars = data[data.length - 1];
    // center=1: 1.2 is above, 0.8 and 0.4 are below.
    expect(bars.marker.color).toEqual([COLORS.blue3, COLORS.orange3, COLORS.orange3]);
  });

  it("pins the measure axis to a fixed value range", () => {
    const { layout } = toPlotly(baseSpec({ valueRange: [0, 2] }));
    expect(layout.xaxis.range).toEqual([0, 2]);
    expect(layout.xaxis.autorange).toBe(false);
  });

  it("draws a background track rail spanning the range, behind the bars", () => {
    const { data, layout } = toPlotly(baseSpec({ trackRail: true, valueRange: [0, 2] }));
    expect(layout.barmode).toBe("overlay");
    expect(data).toHaveLength(2);
    const [rail, bars] = data;
    expect(rail.hoverinfo).toBe("skip");
    expect(rail.showlegend).toBe(false);
    expect(rail.base).toBe(0);
    expect(rail.x).toEqual([2, 2, 2]); // full-range length per category
    expect(bars.customdata).toEqual([1.2, 0.8, 0.4]);
  });

  it("strips axis chrome in minimal mode but keeps category labels", () => {
    const { layout } = toPlotly(baseSpec({ minimalAxis: true }));
    expect(layout.xaxis.showticklabels).toBe(false);
    expect(layout.xaxis.showline).toBe(false);
    expect(layout.xaxis.showgrid).toBe(false);
    // Category axis (y) keeps its labels — only its line/ticks are dropped.
    expect(layout.yaxis.showline).toBe(false);
    expect(layout.yaxis.showticklabels).not.toBe(false);
  });
});
