/**
 * Tests for lib/visualization/validation.js — the guardrail enforcement point.
 * Fixtures use a minimal generic schema (mirroring the pytest rule that shared
 * tests use generic data, not a real module's).
 */

import { describe, expect, it } from "vitest";

import {
  hasBlockingErrors,
  validateBaseYear,
  validateBindings,
  validateComparability,
  validateComplexity,
  validateConfig,
  validateGeographyAndSource,
  validateGeoUnmatched,
  validateInlineBindings,
  validateLayers,
  validateTransform,
} from "@/lib/visualization/validation";

const schema = {
  id: "testmodule",
  label: "Test Module",
  sources: null,
  fields: {
    Year: { kind: "temporal", label: "Year" },
    Location: { kind: "dimension", label: "Location" },
    "Total Widgets": {
      kind: "measure",
      unit: "count",
      comparisonGroup: "widgets",
      transforms: ["actual", "indexed", "numericChange", "percentChange"],
      chartRoles: ["yMeasure", "xMeasure", "color", "size"],
    },
    "Spare Widgets": {
      kind: "measure",
      unit: "count",
      comparisonGroup: "widgets",
      transforms: ["actual", "numericChange"],
      chartRoles: ["yMeasure"],
    },
    "Widget Rate": {
      kind: "measure",
      unit: "percent",
      comparisonGroup: "widgetRate",
      transforms: ["actual", "percentagePointChange"],
      chartRoles: ["yMeasure", "color"],
    },
  },
};

const codes = (findings) => findings.map((f) => f.code);

describe("validateBindings", () => {
  it("flags a missing required role", () => {
    const findings = validateBindings("line", { x: "Year" }, schema);
    expect(codes(findings)).toContain("MISSING_REQUIRED_ROLE");
  });

  it("passes a complete, well-typed line binding", () => {
    const findings = validateBindings(
      "line",
      { x: "Year", y: "Total Widgets", series: "Location" },
      schema,
    );
    expect(findings).toEqual([]);
  });

  it("flags a field that is not in the module", () => {
    const findings = validateBindings("line", { x: "Year", y: "No Such Field" }, schema);
    expect(codes(findings)).toContain("UNKNOWN_FIELD");
  });

  it("flags a kind mismatch (dimension bound to a measure role)", () => {
    const findings = validateBindings("line", { x: "Year", y: "Location" }, schema);
    expect(codes(findings)).toContain("ROLE_KIND_MISMATCH");
  });

  it("flags dumbbell endpoints bound to two different metrics", () => {
    const findings = validateBindings(
      "dumbbell",
      { category: "Location", start: "Total Widgets", end: "Spare Widgets" },
      schema,
    );
    expect(codes(findings)).toContain("SAME_METRIC_REQUIRED");
  });

  it("rejects an unknown chart type by name", () => {
    const findings = validateBindings("sparkline", {}, schema);
    expect(codes(findings)).toEqual(["UNKNOWN_CHART_TYPE"]);
    expect(findings[0].message).toContain("sparkline");
  });
});

describe("validateComparability", () => {
  it("allows two measures in the same comparison group", () => {
    expect(validateComparability(["Total Widgets", "Spare Widgets"], schema)).toEqual([]);
  });

  it("warns when measures from different groups share an axis", () => {
    const findings = validateComparability(["Total Widgets", "Widget Rate"], schema);
    expect(codes(findings)).toContain("INCOMPATIBLE_AXIS_MEASURES");
    expect(findings[0].level).toBe("warn");
  });
});

describe("validateLayers", () => {
  it("rejects a layer type outside the predefined set (guardrail #2)", () => {
    const findings = validateLayers(
      [{ type: "rawPlotlyTrace" }],
      { y: "Total Widgets" },
      schema,
    );
    expect(codes(findings)).toContain("UNSUPPORTED_LAYER_TYPE");
  });

  it("rejects a second-source layer on a single-source module", () => {
    const findings = validateLayers(
      [{ type: "secondSource" }],
      { y: "Total Widgets" },
      schema,
    );
    expect(codes(findings)).toContain("SECOND_SOURCE_UNAVAILABLE");
  });

  it("rejects an incomparable second measure", () => {
    const findings = validateLayers(
      [{ type: "secondMeasure", y: "Widget Rate" }],
      { y: "Total Widgets" },
      schema,
    );
    expect(codes(findings)).toContain("INCOMPATIBLE_SECOND_MEASURE");
  });

  it("accepts a comparable second measure", () => {
    const findings = validateLayers(
      [{ type: "secondMeasure", y: "Spare Widgets" }],
      { y: "Total Widgets" },
      schema,
    );
    expect(findings).toEqual([]);
  });
});

describe("validateTransform", () => {
  it("returns no findings for actual or an empty transform", () => {
    expect(validateTransform("actual", { y: "Total Widgets" }, schema)).toEqual([]);
    expect(validateTransform(undefined, { y: "Total Widgets" }, schema)).toEqual([]);
  });

  it("blocks percent change on a rate field (guardrail #4)", () => {
    const findings = validateTransform("percentChange", { y: "Widget Rate" }, schema);
    expect(codes(findings)).toEqual(["TRANSFORM_NOT_ALLOWED"]);
    expect(findings[0].level).toBe("error");
  });
});

describe("validateComplexity", () => {
  it("recommends Top N when a bar chart has too many categories", () => {
    const findings = validateComplexity("bar", 40);
    expect(codes(findings)).toContain("RECOMMEND_TOP_N");
  });

  it("warns when a dumbbell has too few categories", () => {
    const findings = validateComplexity("dumbbell", 2);
    expect(codes(findings)).toContain("TOO_FEW_CATEGORIES");
  });

  it("is silent when the count is within limits", () => {
    expect(validateComplexity("bar", 10)).toEqual([]);
  });
});

describe("validateGeographyAndSource", () => {
  const multiSourceSchema = { ...schema, sources: ["DoF", "Census"] };

  it("requires a source choice on a multi-source module (guardrail #6)", () => {
    const findings = validateGeographyAndSource(
      { chartType: "line", filters: {} },
      multiSourceSchema,
    );
    expect(codes(findings)).toContain("SOURCE_REQUIRED");
  });

  it("accepts a chosen source or source-comparison mode", () => {
    expect(
      validateGeographyAndSource(
        { chartType: "line", filters: { source: "DoF" } },
        multiSourceSchema,
      ),
    ).toEqual([]);
    expect(
      validateGeographyAndSource(
        { chartType: "line", filters: {}, comparisonMode: "sources" },
        multiSourceSchema,
      ),
    ).toEqual([]);
  });

  it("requires one geographic level for a choropleth (guardrail #5)", () => {
    const findings = validateGeographyAndSource(
      { chartType: "choroplethMap", filters: {} },
      schema,
    );
    expect(codes(findings)).toContain("GEO_LEVEL_REQUIRED");
  });
});

describe("validateConfig", () => {
  const validLineConfig = {
    chartType: "line",
    preset: "trend-over-time",
    bindings: { x: "Year", y: "Total Widgets", series: "Location" },
    filters: { subset: "Counties" },
    layers: [],
    transform: "actual",
  };

  it("returns a clean result for a valid config", () => {
    expect(validateConfig(validLineConfig, schema)).toEqual([]);
  });

  it("de-duplicates identical findings by code and message", () => {
    const config = {
      ...validLineConfig,
      bindings: { x: "Year", y: "No Such Field", color: "No Such Field" },
    };
    const findings = validateConfig(config, schema);
    const unknown = findings.filter((f) => f.code === "UNKNOWN_FIELD");
    expect(unknown).toHaveLength(1);
  });

  it("appends complexity findings when a seriesCount is supplied", () => {
    const config = { ...validLineConfig, chartType: "bar", preset: "compare-places", bindings: { category: "Location", y: "Total Widgets" } };
    const findings = validateConfig(config, schema, { seriesCount: 40 });
    expect(codes(findings)).toContain("RECOMMEND_TOP_N");
  });

  it("returns [] for an empty config", () => {
    expect(validateConfig(null, schema)).toEqual([]);
  });
});

describe("validateBaseYear", () => {
  it("warns when the base year sits outside the selected period (flagged issue 4)", () => {
    const findings = validateBaseYear({
      transform: "indexed",
      period: { baseYear: 1990, startYear: 2000, endYear: 2020 },
    });
    expect(codes(findings)).toEqual(["BASE_YEAR_OUT_OF_RANGE"]);
    expect(findings[0].level).toBe("warn");
    expect(findings[0].message).toContain("1990");
  });

  it("is silent when the base year sits inside the period", () => {
    expect(
      validateBaseYear({
        transform: "numericChange",
        period: { baseYear: 2010, startYear: 2000, endYear: 2020 },
      }),
    ).toEqual([]);
  });

  it("is silent when the period bounds are absent", () => {
    expect(
      validateBaseYear({ transform: "percentChange", period: { baseYear: 1990 } }),
    ).toEqual([]);
  });

  it("is silent for a non-change/indexed transform", () => {
    expect(
      validateBaseYear({
        transform: "actual",
        period: { baseYear: 1990, startYear: 2000, endYear: 2020 },
      }),
    ).toEqual([]);
  });
});

describe("validateGeoUnmatched", () => {
  it("is silent for an empty or missing list", () => {
    expect(validateGeoUnmatched([])).toEqual([]);
    expect(validateGeoUnmatched()).toEqual([]);
  });

  it("names every place when 5 or fewer are unmatched", () => {
    const findings = validateGeoUnmatched(["Alpine", "Sierra"]);
    expect(codes(findings)).toEqual(["GEO_JOIN_UNMATCHED"]);
    expect(findings[0].level).toBe("warn");
    expect(findings[0].message).toContain("Alpine");
    expect(findings[0].message).toContain("Sierra");
    expect(findings[0].message).not.toContain("more");
  });

  it("truncates to 5 names, naming how many more", () => {
    const places = ["A", "B", "C", "D", "E", "F", "G"];
    const findings = validateGeoUnmatched(places);
    expect(findings[0].message).toContain("A, B, C, D, E");
    expect(findings[0].message).toContain("and 2 more");
    expect(findings[0].message).not.toContain("F");
  });
});

describe("validateConfig — geoUnmatched option", () => {
  const validLineConfig = {
    chartType: "line",
    preset: "trend-over-time",
    bindings: { x: "Year", y: "Total Widgets", series: "Location" },
    filters: { subset: "Counties" },
    layers: [],
    transform: "actual",
  };

  it("appends a GEO_JOIN_UNMATCHED warning when geoUnmatched is non-empty", () => {
    const findings = validateConfig(validLineConfig, schema, {
      geoUnmatched: ["Alpine"],
    });
    expect(codes(findings)).toContain("GEO_JOIN_UNMATCHED");
  });

  it("is silent when geoUnmatched is absent", () => {
    expect(codes(validateConfig(validLineConfig, schema, {}))).not.toContain(
      "GEO_JOIN_UNMATCHED",
    );
  });
});

describe("validateInlineBindings", () => {
  const table = {
    columns: [{ name: "County", type: "text" }, { name: "Population", type: "number" }],
    rows: [["Fresno", "100"]],
  };

  it("is silent when every bound role names a real column", () => {
    const config = {
      chartType: "line",
      bindings: { x: "County", y: "Population" },
    };
    expect(validateInlineBindings(config, table)).toEqual([]);
  });

  it("errors, naming the column and role, when a binding names a missing column", () => {
    const config = {
      chartType: "line",
      bindings: { x: "County", y: "No Such Column" },
    };
    const findings = validateInlineBindings(config, table);
    expect(codes(findings)).toEqual(["INLINE_BINDING_MISSING"]);
    expect(findings[0].level).toBe("error");
    expect(findings[0].message).toContain("No Such Column");
    expect(findings[0].message).toContain("y");
  });

  it("skips unbound (undefined) roles", () => {
    const config = { chartType: "line", bindings: { x: "County" } };
    expect(validateInlineBindings(config, table)).toEqual([]);
  });

  it("is silent for an unknown chart type or a missing table", () => {
    expect(validateInlineBindings({ chartType: "notAChart", bindings: {} }, table)).toEqual([]);
    expect(validateInlineBindings({ chartType: "line", bindings: { x: "County" } }, null)).toEqual([]);
  });
});

describe("validateConfig — inline data source", () => {
  it("wires validateInlineBindings in only when config.data.source is 'inline'", () => {
    const table = {
      columns: [{ name: "County", type: "text" }, { name: "Population", type: "number" }],
      rows: [["Fresno", "100"]],
    };
    const config = {
      chartType: "line",
      preset: "trend-over-time",
      bindings: { x: "County", y: "No Such Column" },
      filters: {},
      layers: [],
      transform: "actual",
      data: { source: "inline", inline: table },
    };
    const findings = validateConfig(config, schema);
    expect(codes(findings)).toContain("INLINE_BINDING_MISSING");
  });

  it("does not raise schema-coupled false positives when inline bindings are all valid", () => {
    const table = {
      columns: [
        { name: "County", type: "text" },
        { name: "Year", type: "number" },
        { name: "Population", type: "number" },
      ],
      rows: [["Fresno", "2020", "100"]],
    };
    const config = {
      chartType: "line",
      preset: "trend-over-time",
      bindings: { x: "Year", y: "Population", series: "County" },
      filters: {},
      layers: [],
      transform: "actual",
      data: { source: "inline", inline: table },
    };
    // Inline column names are not module schema fields and inline data has no
    // module source/geo-subset, so none of the schema-coupled checks should fire.
    const found = codes(validateConfig(config, schema));
    expect(found).not.toContain("UNKNOWN_FIELD");
    expect(found).not.toContain("SOURCE_REQUIRED");
    expect(found).not.toContain("INLINE_BINDING_MISSING");
  });

  it("does not run validateInlineBindings for a module-sourced config", () => {
    const config = {
      chartType: "line",
      preset: "trend-over-time",
      bindings: { x: "Year", y: "Total Widgets", series: "Location" },
      filters: { subset: "Counties" },
      layers: [],
      transform: "actual",
      data: { source: "module" },
    };
    expect(codes(validateConfig(config, schema))).not.toContain("INLINE_BINDING_MISSING");
  });
});

describe("hasBlockingErrors", () => {
  it("is true only when an error-level finding exists", () => {
    expect(hasBlockingErrors([{ level: "warn" }])).toBe(false);
    expect(hasBlockingErrors([{ level: "warn" }, { level: "error" }])).toBe(true);
    expect(hasBlockingErrors([])).toBe(false);
  });
});
