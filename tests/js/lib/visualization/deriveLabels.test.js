/**
 * Tests for lib/visualization/deriveLabels.js's axis-binding default, focused
 * on Workstream B: a diverging bar defaults to horizontal, a plain bar to
 * vertical, and after the `divergingBar` id retired to a `bar` variant flag
 * (`appearance.diverging`) the default must still follow the same rule.
 */

import { describe, expect, it } from "vitest";

import { deriveLabels } from "@/lib/visualization/deriveLabels";

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

  it("the legacy divergingBar id still defaults horizontal (pre-migration configs)", () => {
    const labels = deriveLabels(config({ chartType: "divergingBar" }), schema);
    expect(labels.xAxis).toBe("On-track score");
    expect(labels.yAxis).toBe("Location");
  });
});
