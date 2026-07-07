/**
 * Tests for lib/visualization/chartSpec.js — spec v2 migration, printing,
 * parsing, and the small/structural diff classification that drives the
 * code editor's auto-apply vs Run behavior.
 */

import { describe, expect, it } from "vitest";

import {
  diffSpec,
  migrateSpec,
  normalizeSpec,
  parseSpec,
  printSpec,
  SPEC_VERSION,
  STRUCTURAL_KEYS,
} from "@/lib/visualization/chartSpec";

const schema = {
  id: "testmodule",
  label: "Test Module",
  sources: null,
  fields: {
    Year: { kind: "temporal" },
    Location: { kind: "dimension" },
    "Total Widgets": {
      kind: "measure",
      unit: "count",
      comparisonGroup: "widgets",
      transforms: ["actual", "indexed", "percentChange"],
      chartRoles: ["yMeasure"],
    },
  },
};

const v2Spec = {
  version: 2,
  module: "testmodule",
  preset: "trend-over-time",
  chartType: "line",
  data: { source: "module" },
  bindings: { x: "Year", y: "Total Widgets", series: "Location" },
  period: { startYear: 2020, endYear: 2024 },
  filters: { subset: "Counties" },
  transform: "actual",
  comparisonMode: "places",
  labels: { title: "Widgets over time" },
  format: {},
  appearance: { legendPosition: "right" },
  annotations: [],
  layers: [],
  referenceLines: [],
  tier: "moderate",
};

describe("migrateSpec", () => {
  it("unpacks the v1 wire shape's filters-smuggled keys exactly (issue 6)", () => {
    const v1Wire = {
      version: 1,
      module: "testmodule",
      preset: "trend-over-time",
      bindings: { x: "Year", y: "Total Widgets" },
      period: {},
      filters: {
        subset: "Counties",
        transform: "indexed",
        chartType: "line",
        appearance: { legendPosition: "bottom" },
      },
      labels: {},
      referenceLines: [],
      layers: [],
    };
    const out = migrateSpec(v1Wire);
    expect(out.version).toBe(SPEC_VERSION);
    expect(out.transform).toBe("indexed");
    expect(out.chartType).toBe("line");
    expect(out.appearance).toEqual({ legendPosition: "bottom" });
    expect(out.filters).toEqual({ subset: "Counties" });
    expect(out.filters.transform).toBeUndefined();
  });

  it("adds the v2 containers to a v1 in-memory shape", () => {
    const out = migrateSpec({ version: 1, module: "testmodule", chartType: "bar" });
    expect(out.data).toEqual({ source: "module" });
    expect(out.format).toEqual({});
    expect(out.annotations).toEqual([]);
    expect(out.tier).toBe("moderate");
  });

  it("passes a v2 spec through unchanged", () => {
    expect(migrateSpec(v2Spec)).toEqual(v2Spec);
  });
});

describe("printSpec", () => {
  it("prints a stable canonical key order regardless of input order", () => {
    const shuffled = Object.fromEntries(Object.entries(v2Spec).reverse());
    expect(printSpec(shuffled, schema)).toBe(printSpec(v2Spec, schema));
    expect(printSpec(v2Spec, schema).trimStart().startsWith('{\n  "version"')).toBe(true);
  });

  it("strips computed keys", () => {
    const withComputed = { ...v2Spec, seriesCount: 4, validation: [{ code: "X" }] };
    expect(printSpec(withComputed, schema)).not.toContain("seriesCount");
    expect(printSpec(withComputed, schema)).not.toContain("validation");
  });
});

describe("parseSpec", () => {
  it("round-trips printSpec output cleanly", () => {
    const { spec, errors } = parseSpec(printSpec(v2Spec, schema), schema);
    expect(errors).toEqual([]);
    expect(spec).toEqual(normalizeSpec(v2Spec, schema));
  });

  it("never throws on malformed JSON — returns SPEC_PARSE_ERROR", () => {
    const { spec, errors } = parseSpec("{ not json", schema);
    expect(spec).toBeNull();
    expect(errors[0].code).toBe("SPEC_PARSE_ERROR");
  });

  it("rejects a non-object", () => {
    expect(parseSpec("[1,2]", schema).errors[0].code).toBe("SPEC_PARSE_ERROR");
  });

  it("rejects an unsupported version by name", () => {
    const { errors } = parseSpec(JSON.stringify({ ...v2Spec, version: 99 }), schema);
    expect(errors[0].code).toBe("SPEC_VERSION_UNSUPPORTED");
    expect(errors[0].message).toContain("99");
  });

  it("warns on an unknown top-level key, naming it", () => {
    const { errors } = parseSpec(JSON.stringify({ ...v2Spec, chartTypo: "line" }), schema);
    const finding = errors.find((f) => f.code === "SPEC_UNKNOWN_KEY");
    expect(finding.level).toBe("warn");
    expect(finding.message).toContain("chartTypo");
  });

  it("warns on a raw hex color instead of a token", () => {
    const spec = {
      ...v2Spec,
      appearance: { ...v2Spec.appearance, seriesColors: { California: "#ff0000" } },
    };
    const { errors } = parseSpec(JSON.stringify(spec), schema);
    expect(errors.some((f) => f.code === "SPEC_RAW_HEX")).toBe(true);
  });

  it("errors on inline rows whose width disagrees with the columns", () => {
    const spec = {
      ...v2Spec,
      data: {
        source: "inline",
        inline: { columns: [{ name: "a" }, { name: "b" }], rows: [[1, 2], [3]] },
      },
    };
    const { errors } = parseSpec(JSON.stringify(spec), schema);
    const finding = errors.find((f) => f.code === "SPEC_INLINE_SHAPE");
    expect(finding.level).toBe("error");
    expect(finding.message).toContain("row 2");
  });

  it("surfaces validateConfig findings (an unknown field errors)", () => {
    const spec = { ...v2Spec, bindings: { ...v2Spec.bindings, y: "No Such Field" } };
    const { errors } = parseSpec(JSON.stringify(spec), schema);
    expect(errors.some((f) => f.code === "UNKNOWN_FIELD")).toBe(true);
  });
});

describe("diffSpec", () => {
  it("classifies no change as none", () => {
    expect(diffSpec(v2Spec, { ...v2Spec }, schema).classification).toBe("none");
  });

  it("classifies label/format/appearance/annotation edits as small", () => {
    for (const draft of [
      { ...v2Spec, labels: { title: "New title" } },
      { ...v2Spec, format: { "Total Widgets": { decimals: 1 } } },
      { ...v2Spec, appearance: { legendPosition: "bottom" } },
      { ...v2Spec, annotations: [{ type: "text", text: "note" }] },
      { ...v2Spec, referenceLines: [{ type: "horizontal", value: 5 }] },
      { ...v2Spec, tier: "advanced" },
    ]) {
      expect(diffSpec(v2Spec, draft, schema).classification).toBe("small");
    }
  });

  it("classifies every STRUCTURAL_KEY change as structural", () => {
    const structuralDrafts = {
      module: { ...v2Spec, module: "othermodule" },
      preset: { ...v2Spec, preset: "compare-places" },
      chartType: { ...v2Spec, chartType: "bar" },
      data: { ...v2Spec, data: { source: "inline", inline: { columns: [{ name: "a" }], rows: [] } } },
      bindings: { ...v2Spec, bindings: { ...v2Spec.bindings, y: "Total Widgets2" } },
      period: { ...v2Spec, period: { startYear: 2000, endYear: 2024 } },
      filters: { ...v2Spec, filters: { subset: "Regions" } },
      transform: { ...v2Spec, transform: "indexed" },
      comparisonMode: { ...v2Spec, comparisonMode: "sources" },
      layers: { ...v2Spec, layers: [{ id: "l1", type: "benchmark" }] },
    };
    for (const [key, draft] of Object.entries(structuralDrafts)) {
      const result = diffSpec(v2Spec, draft, schema);
      expect(result.classification, `key: ${key}`).toBe("structural");
      expect(result.changedPaths).toContain(key);
      expect(STRUCTURAL_KEYS).toContain(key);
    }
  });

  it("mixed small + structural edits classify as structural", () => {
    const draft = { ...v2Spec, labels: { title: "x" }, chartType: "bar" };
    expect(diffSpec(v2Spec, draft, schema).classification).toBe("structural");
  });
});
