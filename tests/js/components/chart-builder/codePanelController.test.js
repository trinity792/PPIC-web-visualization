/**
 * Tests for components/chart-builder/codePanelController.js — pure
 * controller logic behind CodeEditorPanel (kept free of React/CodeMirror).
 */

import { describe, expect, it } from "vitest";

import { evaluateSpecDraft, runCodeDraft } from "@/components/chart-builder/codePanelController";
import { normalizeSpec, printSpec } from "@/lib/visualization/chartSpec";

const schema = {
  id: "widgets",
  label: "Widgets Module",
  sources: null,
  fields: {
    Year: { kind: "temporal" },
    Location: { kind: "dimension" },
    "Total Widgets": {
      kind: "measure",
      unit: "count",
      comparisonGroup: "widgets",
      transforms: ["actual", "indexed", "percentChange"],
      chartRoles: ["yMeasure", "xMeasure", "color", "size"],
    },
  },
};

const liveConfig = normalizeSpec(
  {
    version: 2,
    module: "widgets",
    preset: "trend-over-time",
    chartType: "line",
    data: { source: "module" },
    bindings: { x: "Year", y: "Total Widgets" },
    period: {},
    filters: {},
    transform: "actual",
    comparisonMode: "places",
    labels: { title: "Widgets over time" },
    format: {},
    appearance: {},
    annotations: [],
    layers: [],
    referenceLines: [],
    tier: "moderate",
  },
  schema,
);

describe("evaluateSpecDraft", () => {
  it("classifies a label-only edit as small", () => {
    const draft = { ...liveConfig, labels: { title: "New title" } };
    const result = evaluateSpecDraft(printSpec(draft, schema), liveConfig, schema);
    expect(result.classification).toBe("small");
    expect(result.errors).toEqual([]);
  });

  it("classifies a chartType edit as structural", () => {
    const draft = {
      ...liveConfig,
      chartType: "bar",
      bindings: { category: "Location", y: "Total Widgets" },
    };
    const result = evaluateSpecDraft(printSpec(draft, schema), liveConfig, schema);
    expect(result.classification).toBe("structural");
  });

  it("classifies an unparseable draft as none, surfacing the parse error", () => {
    const result = evaluateSpecDraft("{ not json", liveConfig, schema);
    expect(result.classification).toBe("none");
    expect(result.errors[0].code).toBe("SPEC_PARSE_ERROR");
  });
});

describe("runCodeDraft", () => {
  it("applies a valid R draft", () => {
    const text = 'ggplot(data, aes(x = `Year`, y = `Total Widgets`)) +\n' + '  geom_line()\n';
    const { spec, errors } = runCodeDraft("r", text, liveConfig, schema);
    expect(errors).toEqual([]);
    expect(spec.chartType).toBe("line");
  });

  it("returns errors and no spec for broken R", () => {
    const text = "ggplot(data, aes(x = `Year`, y = `No Such Field`";
    const { spec, errors } = runCodeDraft("r", text, liveConfig, schema);
    expect(spec).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });

  it("dispatches Stata drafts to parseStataCode", () => {
    const text = "twoway (line total_widgets year)";
    const { spec, errors } = runCodeDraft("stata", text, liveConfig, schema);
    expect(errors).toEqual([]);
    expect(spec.chartType).toBe("line");
  });

  it("dispatches spec drafts to parseSpec, splitting warn/error findings", () => {
    const draft = { ...liveConfig, labels: { title: "Edited" } };
    const { spec, errors, warnings } = runCodeDraft(
      "spec",
      printSpec(draft, schema),
      liveConfig,
      schema,
    );
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(spec.labels.title).toBe("Edited");
  });
});
