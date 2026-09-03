/**
 * Workstream D - the Advanced Mode boundary.
 *
 * Belongs to `advancedMode.test.js` and folds back into it once
 * `lib/visualization/resolveEditorModel.js` and `questionSpec.js` exist. Split
 * out only so an unwritten module does not stop the live Advanced Mode tests
 * from collecting.
 */

import { describe, expect, it } from "vitest";

/**
 * Workstream D - what Advanced Mode is and is not.
 *
 * Advanced Mode reveals complexity that is valid but crowded, or that most
 * readers do not need. It is not a bypass: a control that no capability
 * declares does not exist in either mode, and a calculation that is
 * mathematically invalid for the chosen measure stays invalid when the switch
 * is on. Otherwise the switch becomes the place bugs go to hide.
 *
 * Mode is interface state. It never reaches the saved question, because two
 * people opening the same link must see the same chart.
 */

const resolveEditorModel = () => import("@/lib/visualization/resolveEditorModel");
const questionSpecModule = () => import("@/lib/visualization/questionSpec");

/**
 * The Advanced Mode inventory from the implementation plan. Each row is a
 * control the audit found gated today, plus the two the refactor adds. Every
 * one of them must be reachable ONLY when its capability declares a consumer.
 */
const ADVANCED_INVENTORY = [
  { setting: "ranking", capability: "calculations", value: "ranking" },
  { setting: "benchmarkDifference", capability: "calculations", value: "benchmarkDifference" },
  { setting: "comparisonGeographyOverride", capability: "comparison", value: "geographyOverride" },
  { setting: "comparisonTimeOverride", capability: "comparison", value: "timeOverride" },
  { setting: "customDivergingStops", capability: "appearance", value: "divergingStops" },
  { setting: "hideXAxis", capability: "appearance", value: "hideXAxis" },
];

function v3Question(overrides = {}) {
  return {
    version: 3,
    question: {
      dataset: { kind: "module", moduleId: "components-of-change" },
      source: "DoF",
      outcome: { measureId: "Crude Birth Rate" },
      geography: { subset: "Counties", locations: ["Fresno"] },
      time: { contract: "snapshot", year: 2025 },
      calculation: { id: "actual", params: {} },
      comparisons: [{ id: "cmp_all", dimensions: {} }],
      ...overrides,
    },
    presentation: { chartType: "bar", comparisonPresentation: "combined" },
  };
}

const rateSchema = {
  id: "components-of-change",
  fields: {
    "Crude Birth Rate": {
      kind: "measure",
      label: "Crude birth rate",
      unit: "ratePerThousand",
      calculations: ["actual", "percentagePointChange"],
    },
  },
};

describe("Workstream D Advanced Mode boundaries", () => {
  it("shows every inventoried advanced setting only with its capability", async () => {
    const { resolveEditorModel: resolve } = await resolveEditorModel();

    for (const row of ADVANCED_INVENTORY) {
      const without = resolve({
        spec: v3Question(),
        schema: rateSchema,
        mode: "advanced",
        capabilities: { calculations: [], comparison: [], appearance: [] },
      });
      expect(
        without.visibleSettings.map((entry) => entry.id),
        `${row.setting} without its capability`,
      ).not.toContain(row.setting);

      const withCapability = resolve({
        spec: v3Question(),
        schema: rateSchema,
        mode: "advanced",
        capabilities: {
          calculations: [],
          comparison: [],
          appearance: [],
          [row.capability]: [row.value],
        },
      });
      expect(
        withCapability.visibleSettings.map((entry) => entry.id),
        `${row.setting} with its capability`,
      ).toContain(row.setting);
    }
  });

  it("allows a crowded valid choice and blocks an invalid choice", async () => {
    const { resolveEditorModel: resolve } = await resolveEditorModel();

    // Ten comparisons on one line chart is hard to read, not wrong. Advanced
    // Mode may offer it, with a low-key note.
    const crowded = resolve({
      spec: v3Question({
        comparisons: Array.from({ length: 10 }, (_, index) => ({
          id: `cmp_${index}`,
          dimensions: {},
        })),
      }),
      schema: rateSchema,
      mode: "advanced",
    });
    expect(crowded.chartChoices.find((choice) => choice.id === "line")).toMatchObject({
      available: true,
      information: expect.any(String),
    });

    // Percent change of a rate is wrong, and the mathematical boundary is the
    // same in both modes.
    for (const mode of ["standard", "advanced"]) {
      const resolved = resolve({ spec: v3Question(), schema: rateSchema, mode });
      expect(
        resolved.calculationChoices.map((choice) => choice.id),
        mode,
      ).not.toContain("percentChange");
    }
  });

  it("hides an unsupported chart in Standard Mode and never selects one for the reader", async () => {
    const { resolveEditorModel: resolve } = await resolveEditorModel();
    const standard = resolve({ spec: v3Question(), schema: rateSchema, mode: "standard" });

    // The resolver returns choices and reasons. It does not rewrite
    // presentation.chartType, because a chart that changes itself is a chart
    // the reader did not choose.
    expect(standard.chartChoices.every((choice) => "reason" in choice || choice.available)).toBe(
      true,
    );
    expect(standard.presentation.chartType).toBe("bar");
    expect(standard).not.toHaveProperty("recommendedChartType");
  });

  it("does not serialize Advanced Mode", async () => {
    const { normalizeQuestion, serializeQuestion } = await questionSpecModule();
    const wire = serializeQuestion(
      normalizeQuestion({ ...v3Question(), advancedMode: true, mode: "advanced" }),
    );

    // Mode is where the reader is standing, not what the chart says.
    expect(JSON.stringify(wire)).not.toMatch(/advanced/i);
    expect(wire).not.toHaveProperty("advancedMode");
    expect(wire.question).not.toHaveProperty("mode");
    expect(wire.presentation).not.toHaveProperty("mode");
  });
});
