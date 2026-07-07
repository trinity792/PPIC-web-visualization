/**
 * Tests for lib/visualization/codebridge/toRCode.js — ggplot2 script
 * generation. Fixtures use a minimal generic schema (mirroring the pytest
 * rule that shared tests use generic data, not a real module's).
 */

import { describe, expect, it } from "vitest";

import { toRCode } from "@/lib/visualization/codebridge/toRCode";

const baseSpec = {
  module: "widgets",
  data: { source: "module" },
  filters: {},
  transform: "actual",
  layers: [],
  annotations: [],
  referenceLines: [],
  appearance: {},
  labels: {},
};

describe("toRCode", () => {
  it("generates a line chart with a series binding", () => {
    const spec = {
      ...baseSpec,
      chartType: "line",
      bindings: { x: "Year", y: "Total Widgets", series: "Location" },
      labels: { title: "Widgets over time", xAxis: "Year", yAxis: "Widgets" },
    };
    const { code, warnings } = toRCode(spec, null);
    expect(warnings).toEqual([]);
    expect(code).toBe(
      'library(tidyverse)\n' +
        '\n' +
        'data <- read_csv("widgets-line.csv")\n' +
        '\n' +
        'ggplot(data, aes(x = `Year`, y = `Total Widgets`, color = `Location`)) +\n' +
        '  geom_line() +\n' +
        '  labs(title = "Widgets over time", x = "Year", y = "Widgets")\n',
    );
  });

  it("generates a horizontal bar chart", () => {
    const spec = {
      ...baseSpec,
      chartType: "bar",
      bindings: { category: "Location", y: "Total Widgets" },
      labels: { title: "Widgets by place" },
      appearance: { orientation: "horizontal" },
    };
    const { code, warnings } = toRCode(spec, null);
    expect(warnings).toEqual([]);
    expect(code).toBe(
      'library(tidyverse)\n' +
        '\n' +
        'data <- read_csv("widgets-bar.csv")\n' +
        '\n' +
        'ggplot(data, aes(x = `Location`, y = `Total Widgets`)) +\n' +
        '  geom_col() +\n' +
        '  labs(title = "Widgets by place") +\n' +
        '  coord_flip()\n',
    );
  });

  it("generates a scatter chart and omits labs() when labels are blank", () => {
    const spec = {
      ...baseSpec,
      chartType: "scatter",
      bindings: { x: "Total Widgets", y: "Spare Widgets", unit: "Location" },
    };
    const { code, warnings } = toRCode(spec, null);
    expect(warnings).toEqual([]);
    expect(code).toBe(
      'library(tidyverse)\n' +
        '\n' +
        'data <- read_csv("widgets-scatter.csv")\n' +
        '\n' +
        'ggplot(data, aes(x = `Total Widgets`, y = `Spare Widgets`)) +\n' +
        '  geom_point()\n',
    );
    expect(code).not.toContain("labs(");
  });

  it("generates a bubble chart (geom_point with a size aes)", () => {
    const spec = {
      ...baseSpec,
      chartType: "bubble",
      bindings: {
        x: "Total Widgets",
        y: "Spare Widgets",
        size: "Widget Density",
        unit: "Location",
      },
    };
    const { code, warnings } = toRCode(spec, null);
    expect(warnings).toEqual([]);
    expect(code).toBe(
      'library(tidyverse)\n' +
        '\n' +
        'data <- read_csv("widgets-bubble.csv")\n' +
        '\n' +
        'ggplot(data, aes(x = `Total Widgets`, y = `Spare Widgets`, size = `Widget Density`)) +\n' +
        '  geom_point()\n',
    );
  });

  it("generates a heatmap (color role rides fill)", () => {
    const spec = {
      ...baseSpec,
      chartType: "heatmap",
      bindings: { x: "Year", y: "Location", color: "Total Widgets" },
    };
    const { code, warnings } = toRCode(spec, null);
    expect(warnings).toEqual([]);
    expect(code).toBe(
      'library(tidyverse)\n' +
        '\n' +
        'data <- read_csv("widgets-heatmap.csv")\n' +
        '\n' +
        'ggplot(data, aes(x = `Year`, y = `Location`, fill = `Total Widgets`)) +\n' +
        '  geom_tile()\n',
    );
  });

  it("uses the table's filename when provided", () => {
    const spec = {
      ...baseSpec,
      chartType: "scatter",
      bindings: { x: "Total Widgets", y: "Spare Widgets", unit: "Location" },
    };
    const { code } = toRCode(spec, { filename: "custom-export.csv" });
    expect(code).toContain('read_csv("custom-export.csv")');
  });

  it("returns empty code and a named warning for an unsupported chart type", () => {
    const spec = {
      ...baseSpec,
      chartType: "dumbbell",
      bindings: { category: "Location", start: "Total Widgets", end: "Spare Widgets" },
    };
    const { code, warnings } = toRCode(spec, null);
    expect(code).toBe("");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("CODEGEN_UNSUPPORTED");
    expect(warnings[0].feature).toContain("dumbbell");
  });
});
