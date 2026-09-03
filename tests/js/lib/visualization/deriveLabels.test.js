/**
 * Tests for lib/visualization/deriveLabels.js's axis-binding default, focused
 * on Workstream B: a diverging bar defaults to horizontal, a plain bar to
 * vertical, and after the `divergingBar` id retired to a `bar` variant flag
 * (`appearance.diverging`) the default must still follow the same rule.
 */

import { describe, expect, it } from "vitest";

import { deriveLabels, effectiveLabels } from "@/lib/visualization/deriveLabels";

const schema = {
  fields: {
    Location: { kind: "dimension", label: "Location" },
    Score: { kind: "measure", label: "On-track score" },
  },
};

function config(overrides = {}) {
  return {
    chartType: "bar",
    bindings: { category: "Location", y: "Score" },
    appearance: {},
    ...overrides,
  };
}

describe("deriveLabels axis default for bar vs. diverging bar", () => {
  it("plain bar defaults vertical: category on x, measure on y", () => {
    const labels = deriveLabels(config(), schema);
    expect(labels.xAxis).toBe("Location");
    expect(labels.yAxis).toBe("On-track score");
  });

  it("appearance.diverging defaults horizontal: measure on x, category on y", () => {
    const labels = deriveLabels(
      config({ appearance: { diverging: true } }),
      schema,
    );
    expect(labels.xAxis).toBe("On-track score");
    expect(labels.yAxis).toBe("Location");
  });

  it("an explicit orientation still overrides either default", () => {
    const labels = deriveLabels(
      config({ appearance: { diverging: true, orientation: "vertical" } }),
      schema,
    );
    expect(labels.xAxis).toBe("Location");
    expect(labels.yAxis).toBe("On-track score");
  });
});

describe("v3 geography-aware labels", () => {
  const v3Schema = {
    fields: {
      Year: { kind: "temporal", label: "Year" },
      Population: { kind: "measure", label: "Population" },
    },
  };
  const v3 = (geography, labels = {}) => ({
    version: 3,
    question: {
      outcome: { measureId: "Population" },
      geography,
    },
    presentation: { chartType: "line", labels },
  });

  it("tracks the selected place and geographic level", () => {
    expect(
      deriveLabels(v3({ subset: "Counties", locations: ["San Francisco"] }), v3Schema)
        .title,
    ).toBe("Population over time in San Francisco");
    expect(
      deriveLabels(v3({ subset: "Regions", locations: [] }), v3Schema).title,
    ).toBe("Population over time by region");
  });

  it("keeps a typed title while blank labels continue following geography", () => {
    expect(
      effectiveLabels(
        v3({ subset: "Regions", locations: ["Bay Area"] }, { title: "My title" }),
        v3Schema,
      ),
    ).toMatchObject({ title: "My title", xAxis: "Year", yAxis: "Population" });
  });

  it("includes both shared and per-comparison jurisdictions in the title", () => {
    const spec = v3({ subset: "Counties", locations: ["Alameda"] });
    spec.question.comparisons = [
      { id: "cmp_region", geography: { subset: "Regions", locations: ["Bay Area"] } },
      { id: "cmp_county" },
    ];

    expect(deriveLabels(spec, v3Schema).title).toBe(
      "Population over time in Bay Area and Alameda",
    );
  });

  it("uses the geographic level instead of clipping a title with many places", () => {
    const spec = v3({
      subset: "Regions",
      locations: ["Bay Area", "Central Coast", "Far North", "Inland Empire"],
    });

    expect(deriveLabels(spec, v3Schema).title).toBe(
      "Population over time by region",
    );
    spec.presentation.chartType = "bar";
    expect(deriveLabels(spec, v3Schema)).toMatchObject({
      title: "Population by region",
      xAxis: "Location",
      yAxis: "Population",
    });
  });
});
