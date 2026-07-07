/**
 * Tests for lib/visualization/codebridge/parseRCode.js — static parsing of
 * the recognized ggplot2 subset, including the generator/parser round trip.
 */

import { describe, expect, it } from "vitest";

import { parseRCode } from "@/lib/visualization/codebridge/parseRCode";
import { toRCode } from "@/lib/visualization/codebridge/toRCode";

const schema = {
  id: "widgets",
  label: "Widgets Module",
  fields: {
    Year: { kind: "temporal" },
    Location: { kind: "dimension" },
    "Total Widgets": { kind: "measure" },
    "Spare Widgets": { kind: "measure" },
    "Widget Density": { kind: "measure" },
  },
};

const baseFields = {
  module: "widgets",
  data: { source: "module" },
  filters: {},
  transform: "actual",
  layers: [],
  annotations: [],
  referenceLines: [],
};

function roundTrip(spec) {
  const { code } = toRCode(spec, null);
  return parseRCode(code, { schema, baseSpec: spec });
}

describe("parseRCode — generator/parser round trip", () => {
  it("reproduces a line chart with a series binding", () => {
    const spec = {
      ...baseFields,
      chartType: "line",
      bindings: { x: "Year", y: "Total Widgets", series: "Location" },
      labels: { title: "Widgets over time", xAxis: "Year", yAxis: "Widgets" },
      appearance: {},
    };
    const { spec: parsed, errors } = roundTrip(spec);
    expect(errors).toEqual([]);
    expect(parsed.chartType).toBe(spec.chartType);
    expect(parsed.bindings).toEqual(spec.bindings);
    expect(parsed.labels).toEqual(spec.labels);
  });

  it("reproduces a horizontal bar chart", () => {
    const spec = {
      ...baseFields,
      chartType: "bar",
      bindings: { category: "Location", y: "Total Widgets" },
      labels: { title: "Widgets by place" },
      appearance: { orientation: "horizontal" },
    };
    const { spec: parsed, errors } = roundTrip(spec);
    expect(errors).toEqual([]);
    expect(parsed.chartType).toBe(spec.chartType);
    expect(parsed.bindings).toEqual(spec.bindings);
    expect(parsed.labels).toEqual(spec.labels);
    expect(parsed.appearance.orientation).toBe("horizontal");
  });

  it("reproduces a scatter chart", () => {
    const spec = {
      ...baseFields,
      chartType: "scatter",
      bindings: { x: "Total Widgets", y: "Spare Widgets", unit: "Location" },
      labels: {},
      appearance: {},
    };
    const { spec: parsed, errors } = roundTrip(spec);
    expect(errors).toEqual([]);
    expect(parsed.chartType).toBe(spec.chartType);
    expect(parsed.bindings).toEqual(spec.bindings);
  });

  it("reproduces a bubble chart (geom_point + size aes upgrades scatter to bubble)", () => {
    const spec = {
      ...baseFields,
      chartType: "bubble",
      bindings: {
        x: "Total Widgets",
        y: "Spare Widgets",
        size: "Widget Density",
        unit: "Location",
      },
      labels: {},
      appearance: {},
    };
    const { spec: parsed, errors } = roundTrip(spec);
    expect(errors).toEqual([]);
    expect(parsed.chartType).toBe("bubble");
    expect(parsed.bindings).toEqual(spec.bindings);
  });

  it("reproduces a heatmap (fill aes maps to the color role)", () => {
    const spec = {
      ...baseFields,
      chartType: "heatmap",
      bindings: { x: "Year", y: "Location", color: "Total Widgets" },
      labels: {},
      appearance: {},
    };
    const { spec: parsed, errors } = roundTrip(spec);
    expect(errors).toEqual([]);
    expect(parsed.chartType).toBe(spec.chartType);
    expect(parsed.bindings).toEqual(spec.bindings);
  });
});

describe("parseRCode — error and warning taxonomy", () => {
  const baseSpec = {
    ...baseFields,
    chartType: "line",
    bindings: { x: "Year", y: "Total Widgets" },
    labels: {},
    appearance: {},
  };

  it("warns on an unknown geom but still builds the chart from recognized parts", () => {
    const text =
      'library(tidyverse)\n' +
      '\n' +
      'data <- read_csv("widgets-line.csv")\n' +
      '\n' +
      'ggplot(data, aes(x = `Year`, y = `Total Widgets`)) +\n' +
      '  geom_line() +\n' +
      '  geom_smooth() +\n' +
      '  labs(title = "Trend")\n';
    const { spec, warnings, errors } = parseRCode(text, { schema, baseSpec });
    expect(errors).toEqual([]);
    expect(spec.chartType).toBe("line");
    expect(spec.labels.title).toBe("Trend");
    expect(warnings.some((f) => f.code === "CODE_UNSUPPORTED" && f.message.includes("geom_smooth"))).toBe(
      true,
    );
  });

  it("errors on unbalanced parentheses, naming the line", () => {
    const text = "ggplot(data, aes(x = `Year`, y = `Total Widgets`)\n  + geom_line(";
    const { spec, errors } = parseRCode(text, { schema, baseSpec });
    expect(spec).toBeNull();
    expect(errors[0].code).toBe("CODE_PARSE_ERROR");
    expect(typeof errors[0].line).toBe("number");
  });

  it("errors on an unknown field name and returns a null spec", () => {
    const text =
      'ggplot(data, aes(x = `Year`, y = `No Such Field`)) +\n' + '  geom_line()\n';
    const { spec, errors } = parseRCode(text, { schema, baseSpec });
    expect(spec).toBeNull();
    expect(errors.some((f) => f.code === "UNKNOWN_FIELD")).toBe(true);
  });

  it("never throws on garbage input", () => {
    expect(() => parseRCode("!!! not r code at all ###", { schema, baseSpec })).not.toThrow();
    const { spec, errors } = parseRCode("", { schema, baseSpec });
    expect(spec).toBeNull();
    expect(errors[0].code).toBe("CODE_PARSE_ERROR");
  });
});
