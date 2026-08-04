/** Workstream C: the selected palette reaches every colour-bearing renderer. */

import { describe, expect, it } from "vitest";

import { COLORS } from "@/lib/constants";
import { rampFor } from "@/lib/visualization/palettes";
import { toPlotly } from "@/lib/visualization/toPlotly";

const categoricalCases = [
  {
    chartType: "line",
    spec: {
      bindings: { x: "Year", y: "Value" },
      series: [{ location: "A", years: [2024, 2025], values: [1, 2] }],
    },
    extract: (figure) => figure.data[0].line.color,
  },
  {
    chartType: "bar",
    spec: {
      bindings: { category: "category", y: "value" },
      series: [{ category: "A", value: 1 }],
    },
    extract: (figure) => figure.data[0].marker.color,
  },
  {
    chartType: "pie",
    spec: {
      bindings: { category: "category", y: "value" },
      series: [{ category: "A", value: 1 }],
    },
    extract: (figure) => figure.data[0].marker.colors[0],
  },
  {
    chartType: "scatter",
    spec: {
      bindings: { x: "x", y: "y", unit: "label" },
      series: [{ x: 1, y: 2, label: "A" }],
    },
    extract: (figure) => figure.data[0].marker.color,
  },
  {
    chartType: "bubble",
    spec: {
      bindings: { x: "x", y: "y", size: "size", unit: "label" },
      series: [{ x: 1, y: 2, size: 3, label: "A" }],
    },
    extract: (figure) => figure.data[0].marker.color,
  },
  {
    chartType: "dotPlot",
    spec: {
      bindings: { y: "row", x: "series", color: "value" },
      series: { x: ["Women"], y: ["A"], z: [[1]] },
    },
    extract: (figure) => figure.data.find((trace) => trace.name === "Women").marker.color,
  },
  {
    chartType: "dumbbell",
    spec: {
      bindings: { category: "category", start: "start", end: "end" },
      series: [{ category: "A", start: 1, end: 2 }],
    },
    extract: (figure) => figure.data.find((trace) => trace.name === "start").marker.color,
  },
  {
    chartType: "forest",
    spec: {
      bindings: {
        category: "category",
        start: "start",
        end: "end",
        point: "point",
      },
      series: [{ category: "A", start: 1, end: 2, point: 1.5 }],
    },
    extract: (figure) => figure.data.find((trace) => trace.name === "point").marker.color,
  },
];

function render(chartType, spec, appearance = {}) {
  return toPlotly({ chartType, labels: {}, appearance, ...spec });
}

describe("categorical chart palettes", () => {
  it.each(categoricalCases)(
    "$chartType honours the palette",
    ({ chartType, spec, extract }) => {
      const brand = render(chartType, spec, { palette: "brand-categorical" });
      const teal = render(chartType, spec, { palette: "ui-kit-teal" });

      expect(extract(brand)).toBe(COLORS.blue3);
      expect(extract(teal)).toBe(COLORS.teal7);
    },
  );
});

describe("diverging bar palettes", () => {
  const spec = {
    bindings: { category: "category", y: "value" },
    series: [
      { category: "Above", value: 2 },
      { category: "Below", value: 0 },
    ],
  };

  it("takes its above and below colours from the palette", () => {
    const brand = render("bar", spec, {
      diverging: true,
      center: 1,
      palette: "brand-categorical",
    });
    const teal = render("bar", spec, {
      diverging: true,
      center: 1,
      palette: "ui-kit-teal",
    });

    expect(brand.data.at(-1).marker.color).toEqual([COLORS.blue3, COLORS.orange3]);
    expect(teal.data.at(-1).marker.color).toEqual([COLORS.teal7, COLORS.teal2]);
  });

  it("keeps blue3 / orange3 under the default palette", () => {
    const figure = render("bar", spec, { diverging: true, center: 1 });
    expect(figure.data.at(-1).marker.color).toEqual([COLORS.blue3, COLORS.orange3]);
  });

  it("an explicit divergePositiveColor still wins over the palette", () => {
    const figure = render("bar", spec, {
      diverging: true,
      center: 1,
      palette: "ui-kit-teal",
      divergePositiveColor: "#123456",
    });
    expect(figure.data.at(-1).marker.color).toEqual(["#123456", COLORS.teal2]);
  });
});

describe("scale-driven chart palettes", () => {
  const heatmap = {
    bindings: { x: "column", y: "row", color: "value" },
    series: { x: ["X"], y: ["A"], z: [[1]] },
  };
  const choropleth = {
    bindings: { geography: "geoid", color: "value" },
    series: [{ geoid: "06001", value: 1 }],
    geometry: { type: "FeatureCollection", features: [] },
  };

  it("a heatmap's colorscale follows the palette", () => {
    const figure = render("heatmap", heatmap, { palette: "ppic-ramp-green" });
    // Hand-written: the guide's Green family, evenly spaced.
    expect(figure.data[0].colorscale).toEqual([
      [0, "#DEE5E2"],
      [0.25, "#BDE3D0"],
      [0.5, "#42BC89"],
      [0.75, "#196348"],
      [1, "#02391D"],
    ]);
    expect(figure.data[0].colorscale).not.toBe("Blues");
  });

  it("a choropleth's colorscale follows the palette", () => {
    const green = render("choroplethMap", choropleth, { palette: "ppic-ramp-green" });
    const violet = render("choroplethMap", choropleth, { palette: "ppic-ramp-violet" });
    expect(green.data[0].colorscale).not.toEqual(violet.data[0].colorscale);
    expect(violet.data[0].colorscale.at(-1)).toEqual([1, "#3C0965"]);
  });

  it("a choropleth keeps the legacy blues under a categorical palette", () => {
    // The no-visible-change guarantee: a default config never chose a ramp, so
    // it must still get exactly the stops the hardcoded builder used to emit.
    const figure = render("choroplethMap", choropleth, { palette: "brand-categorical" });
    expect(figure.data[0].colorscale).toEqual([
      [0, COLORS.blue1],
      [1, COLORS.blue5],
    ]);
  });

  it("a choropleth inverts its scale when invertScale is set", () => {
    const normal = render("choroplethMap", choropleth, {
      palette: "ppic-ramp-green",
    });
    const inverted = render("choroplethMap", choropleth, {
      palette: "ppic-ramp-green",
      invertScale: true,
    });
    expect(normal.data[0].reversescale).toBe(false);
    expect(inverted.data[0].reversescale).toBe(true);
    // The ramp itself is the same; only its direction changed.
    expect(inverted.data[0].colorscale).toEqual(normal.data[0].colorscale);
  });

  it("a diverging choropleth inverts its named RdBu scale too", () => {
    // The default palette's diverging ramp is the *named* scale "RdBu", which
    // has no stops to reorder. Inverting it has to reach Plotly's own
    // reversescale or the switch does nothing at all.
    const inverted = render("choroplethMap", choropleth, {
      colorScale: "diverging",
      invertScale: true,
    });
    expect(inverted.data[0].colorscale).toBe("RdBu");
    expect(inverted.data[0].reversescale).toBe(true);
  });

  it("a choropleth draws hand-picked diverging stops over its palette", () => {
    const figure = render("choroplethMap", choropleth, {
      colorScale: "diverging",
      palette: "ppic-diverging-choropleth",
      divergingStops: ["#8F3811", "#ECE8E7", "#0F4880"],
    });
    expect(figure.data[0].colorscale).toEqual([
      [0, "#8F3811"],
      [0.5, "#ECE8E7"],
      [1, "#0F4880"],
    ]);
  });

  it("a choropleth ignores hand-picked stops on a sequential scale", () => {
    const figure = render("choroplethMap", choropleth, {
      colorScale: "sequential",
      palette: "ppic-ramp-green",
      divergingStops: ["#8F3811", "#ECE8E7", "#0F4880"],
    });
    expect(figure.data[0].colorscale.at(0)).toEqual([0, "#DEE5E2"]);
  });

  it("a diverging heatmap starts unreversed and follows the invert switch", () => {
    // The old code reversed every diverging heatmap unconditionally. That quirk
    // is now the reader's switch instead, so the un-inverted state is forward.
    const plain = render("heatmap", heatmap, { colorScale: "diverging" });
    const inverted = render("heatmap", heatmap, {
      colorScale: "diverging",
      invertScale: true,
    });
    expect(plain.data[0].colorscale).toBe("RdBu");
    expect(plain.data[0].reversescale).toBe(false);
    expect(inverted.data[0].reversescale).toBe(true);
  });
});

describe("symbol map gradient", () => {
  const spec = {
    bindings: { geography: "location", size: "value" },
    series: [
      { location: "Alameda", lat: 37.65, lon: -121.91, value: 100 },
      { location: "Butte", lat: 39.65, lon: -121.59, value: 50 },
    ],
  };

  it("colours every marker alike when the gradient is off", () => {
    const figure = render("symbolMap", spec, {
      palette: "ui-kit-teal",
      symbolGradient: false,
    });
    expect(figure.data[0].marker.color).toBe(COLORS.teal7);
  });

  it("encodes the measure as colour when the gradient is on", () => {
    const figure = render("symbolMap", spec, {
      palette: "ui-kit-teal",
      symbolGradient: true,
    });
    expect(figure.data[0].marker).toMatchObject({
      color: [100, 50],
      size: [100, 50],
      showscale: true,
    });
    expect(figure.data[0].marker.colorscale).toEqual(
      rampFor({ palette: "ui-kit-teal" }, { kind: "sequential" }),
    );
    expect(figure.data[0].marker.reversescale).toBe(false);
  });

  it("inverts its gradient when asked", () => {
    const figure = render("symbolMap", spec, {
      palette: "ui-kit-teal",
      symbolGradient: true,
      invertScale: true,
    });
    expect(figure.data[0].marker.reversescale).toBe(true);
  });
});
