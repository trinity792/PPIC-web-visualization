/**
 * Tests for lib/visualization/codebridge/parseStataCode.js — static parsing
 * of the recognized twoway/graph subset, including the generator/parser
 * round trip and the slug-resolution fallback path.
 */

import { describe, expect, it } from "vitest";

import { parseStataCode } from "@/lib/visualization/codebridge/parseStataCode";
import { toStataCode } from "@/lib/visualization/codebridge/toStataCode";

const schema = {
  id: "widgets",
  label: "Widgets Module",
  fields: {
    Year: { kind: "temporal" },
    Location: { kind: "dimension" },
    "Total Widgets": { kind: "measure" },
    "Spare Widgets": { kind: "measure" },
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
  const { code } = toStataCode(spec, null);
  return parseStataCode(code, { schema, baseSpec: spec });
}

describe("parseStataCode — generator/parser round trip", () => {
  it("reproduces a line chart", () => {
    const spec = {
      ...baseFields,
      chartType: "line",
      bindings: { x: "Year", y: "Total Widgets" },
      labels: { title: "Widgets over time" },
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
});

describe("parseStataCode — slug resolution", () => {
  const spec = {
    ...baseFields,
    chartType: "line",
    bindings: { x: "Year", y: "Total Widgets" },
    labels: {},
    appearance: {},
  };

  it("resolves via the generator's mapping comments", () => {
    const { code } = toStataCode(spec, null);
    expect(code).toContain('* total_widgets = "Total Widgets"');
    const { spec: parsed, errors } = parseStataCode(code, { schema, baseSpec: spec });
    expect(errors).toEqual([]);
    expect(parsed.bindings).toEqual(spec.bindings);
  });

  it("resolves via grammar.fieldForSlug when mapping comments are absent", () => {
    const { code } = toStataCode(spec, null);
    const withoutComments = code
      .split("\n")
      .filter((line) => !line.trim().startsWith("*"))
      .join("\n");
    const { spec: parsed, errors } = parseStataCode(withoutComments, { schema, baseSpec: spec });
    expect(errors).toEqual([]);
    expect(parsed.bindings).toEqual(spec.bindings);
  });
});

describe("parseStataCode — error and warning taxonomy", () => {
  const baseSpec = {
    ...baseFields,
    chartType: "line",
    bindings: { x: "Year", y: "Total Widgets" },
    labels: {},
    appearance: {},
  };

  it("warns on an unrecognized command line but still builds the chart", () => {
    const text =
      'import delimited "widgets-line.csv", clear\n' +
      '\n' +
      '* total_widgets = "Total Widgets"\n' +
      '* year = "Year"\n' +
      '\n' +
      'twoway (line total_widgets year)\n' +
      'graph export "chart.png"\n';
    const { spec, warnings, errors } = parseStataCode(text, { schema, baseSpec });
    expect(errors).toEqual([]);
    expect(spec.chartType).toBe("line");
    expect(warnings.some((f) => f.code === "CODE_UNSUPPORTED" && f.message.includes("graph export"))).toBe(
      true,
    );
  });

  it("errors on unbalanced parentheses, naming the line", () => {
    const text = 'twoway (line total_widgets year';
    const { spec, errors } = parseStataCode(text, { schema, baseSpec });
    expect(spec).toBeNull();
    expect(errors[0].code).toBe("CODE_PARSE_ERROR");
    expect(typeof errors[0].line).toBe("number");
  });

  it("errors on an unresolvable variable slug and returns a null spec", () => {
    const text = "twoway (line total_widgets no_such_slug)";
    const { spec, errors } = parseStataCode(text, { schema, baseSpec });
    expect(spec).toBeNull();
    expect(errors.some((f) => f.code === "UNKNOWN_FIELD")).toBe(true);
  });

  it("never throws on garbage input", () => {
    expect(() => parseStataCode("!!! not stata at all ###", { schema, baseSpec })).not.toThrow();
    const { spec, errors } = parseStataCode("", { schema, baseSpec });
    expect(spec).toBeNull();
    expect(errors[0].code).toBe("CODE_PARSE_ERROR");
  });
});
