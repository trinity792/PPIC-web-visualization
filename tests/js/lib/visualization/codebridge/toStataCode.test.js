/**
 * Tests for lib/visualization/codebridge/toStataCode.js — Stata twoway/graph
 * script generation. Fixtures use a minimal generic schema (mirroring the
 * pytest rule that shared tests use generic data, not a real module's).
 */

import { describe, expect, it } from "vitest";

import { toStataCode } from "@/lib/visualization/codebridge/toStataCode";

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

describe("toStataCode", () => {
  it("generates a line command and warns about multi-series grouping", () => {
    const spec = {
      ...baseSpec,
      chartType: "line",
      bindings: { x: "Year", y: "Total Widgets", series: "Location" },
      labels: { title: "Widgets over time" },
    };
    const { code, warnings } = toStataCode(spec, null);
    expect(code).toBe(
      'import delimited "widgets-line.csv", clear\n' +
        '\n' +
        '* total_widgets = "Total Widgets"\n' +
        '* year = "Year"\n' +
        '\n' +
        'twoway (line total_widgets year), title("Widgets over time")\n',
    );
    expect(warnings.some((f) => f.feature === "series grouping in Stata")).toBe(true);
  });

  it("generates a horizontal bar (graph hbar) command", () => {
    const spec = {
      ...baseSpec,
      chartType: "bar",
      bindings: { category: "Location", y: "Total Widgets" },
      labels: { title: "Widgets by place" },
      appearance: { orientation: "horizontal" },
    };
    const { code, warnings } = toStataCode(spec, null);
    expect(warnings).toEqual([]);
    expect(code).toBe(
      'import delimited "widgets-bar.csv", clear\n' +
        '\n' +
        '* total_widgets = "Total Widgets"\n' +
        '* location = "Location"\n' +
        '\n' +
        'graph hbar (asis) total_widgets, over(location) title("Widgets by place")\n',
    );
  });

  it("generates a scatter command and omits option()s when labels are blank", () => {
    const spec = {
      ...baseSpec,
      chartType: "scatter",
      bindings: { x: "Total Widgets", y: "Spare Widgets", unit: "Location" },
    };
    const { code, warnings } = toStataCode(spec, null);
    expect(warnings).toEqual([]);
    expect(code).toBe(
      'import delimited "widgets-scatter.csv", clear\n' +
        '\n' +
        '* spare_widgets = "Spare Widgets"\n' +
        '* total_widgets = "Total Widgets"\n' +
        '\n' +
        'twoway scatter spare_widgets total_widgets\n',
    );
    expect(code).not.toContain("title(");
  });

  it("uses the table's filename when provided", () => {
    const spec = {
      ...baseSpec,
      chartType: "scatter",
      bindings: { x: "Total Widgets", y: "Spare Widgets", unit: "Location" },
    };
    const { code } = toStataCode(spec, { filename: "custom-export.csv" });
    expect(code).toContain('import delimited "custom-export.csv", clear');
  });

  it("returns empty code and a named warning for an unsupported chart type", () => {
    const spec = {
      ...baseSpec,
      chartType: "heatmap",
      bindings: { x: "Year", y: "Location", color: "Total Widgets" },
    };
    const { code, warnings } = toStataCode(spec, null);
    expect(code).toBe("");
    expect(warnings.some((f) => f.code === "CODEGEN_UNSUPPORTED" && f.feature.includes("heatmap"))).toBe(
      true,
    );
  });
});
