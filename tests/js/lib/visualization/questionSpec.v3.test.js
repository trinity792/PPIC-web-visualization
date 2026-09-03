/**
 * Workstream A - lib/visualization/questionSpec.js.
 *
 * Version 3 separates the *question* (what population, which outcome, which
 * geography, which time, which calculation, which comparisons) from the
 * *presentation* (chart type, tabs, labels, appearance). Two things follow from
 * that split and are what this file pins:
 *
 *   1. v3 is the only format the runtime reads. There is no v1 or v2 migration,
 *      because the old formats stored the question in chart-shaped keys that
 *      cannot be guessed back into comparisons.
 *   2. A change is either structural (the question changed, so the server has to
 *      answer again) or presentation-only (the same observations are re-drawn).
 *      Getting that classification wrong either strands stale data on screen or
 *      refetches on every tab click.
 */

import { describe, expect, it } from "vitest";

import {
  QUESTION_SPEC_VERSION,
  UNSUPPORTED_VERSION_MESSAGE,
  applyChartType,
  classifyChange,
  normalizeQuestion,
  readQuestion,
  serializeQuestion,
} from "@/lib/visualization/questionSpec";

function baseSpec(overrides = {}) {
  return {
    version: 3,
    question: {
      dataset: { kind: "module", moduleId: "projections" },
      source: "DoF P-3",
      outcome: { measureId: "Population" },
      geography: { subset: "Counties", locations: ["San Francisco", "Los Angeles"] },
      time: { contract: "range", startYear: 2020, endYear: 2030 },
      calculation: { id: "actual", params: {} },
      comparisons: [
        {
          id: "cmp_latina",
          dimensions: { "Race/Ethnicity": "Hispanic", Sex: "Female", "Age Group": "All Ages" },
        },
        {
          id: "cmp_white_women",
          dimensions: { "Race/Ethnicity": "White", Sex: "Female", "Age Group": "All Ages" },
        },
      ],
    },
    presentation: {
      chartType: "line",
      comparisonPresentation: "combined",
      activeTab: null,
      labels: { title: "Population by group" },
      format: {},
      appearance: { palette: "brand-categorical" },
      annotations: [],
      charts: {},
    },
    ...overrides,
  };
}

describe("questionSpec v3 serialization", () => {
  it("declares 3 as the only supported version", () => {
    expect(QUESTION_SPEC_VERSION).toBe(3);
  });

  it("round-trips one v3 question without computed state", () => {
    const spec = normalizeQuestion({
      ...baseSpec(),
      // Runtime-only fields the editor hangs off the working spec. None of them
      // define the question, so none may survive a save.
      observations: [{ comparisonId: "cmp_latina", value: 50000 }],
      issues: [{ code: "somethingTransient", level: "information", message: "x" }],
      status: "ready",
      loadedAt: 1756600000000,
      categoryNames: ["San Francisco", "Los Angeles"],
    });

    const wire = serializeQuestion(spec);

    expect(wire.version).toBe(3);
    expect(wire.question).toEqual(baseSpec().question);
    expect(wire.presentation).toEqual(baseSpec().presentation);
    expect(wire).not.toHaveProperty("observations");
    expect(wire).not.toHaveProperty("issues");
    expect(wire).not.toHaveProperty("status");
    expect(wire).not.toHaveProperty("loadedAt");
    expect(wire).not.toHaveProperty("categoryNames");

    // Reading the wire form back produces the same spec, so save -> restore ->
    // save is a fixed point rather than a slow drift.
    const restored = readQuestion(wire);
    expect(restored.ok).toBe(true);
    expect(serializeQuestion(restored.spec)).toEqual(wire);
  });

  it("writes keys in a canonical order so an unchanged view produces an identical string", () => {
    const shuffled = normalizeQuestion({
      version: 3,
      presentation: baseSpec().presentation,
      question: {
        comparisons: baseSpec().question.comparisons,
        time: baseSpec().question.time,
        outcome: baseSpec().question.outcome,
        calculation: baseSpec().question.calculation,
        geography: baseSpec().question.geography,
        source: baseSpec().question.source,
        dataset: baseSpec().question.dataset,
      },
    });

    expect(JSON.stringify(serializeQuestion(shuffled))).toBe(
      JSON.stringify(serializeQuestion(normalizeQuestion(baseSpec()))),
    );
  });
});

describe("questionSpec v3 rejects older formats", () => {
  it("rejects v1 and v2 without attempting a migration", () => {
    // A representative v2 spec: the question lived in `filters`, `bindings`,
    // and a scalar `transform`, with no comparison list to recover.
    const v2 = {
      version: 2,
      module: "projections",
      chartType: "line",
      bindings: { x: "Year", y: "Population" },
      filters: {
        subset: "Counties",
        locations: ["San Francisco"],
        raceEthnicity: "Hispanic",
        sex: "Female",
        tabColumn: "Sex",
        tabValue: "Female",
      },
      period: { startYear: 2020, endYear: 2030 },
      transform: "actual",
    };

    for (const older of [{ ...v2, version: 1 }, v2]) {
      const result = readQuestion(older);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("unsupported-version");
      expect(result.version).toBe(older.version);
      expect(result.message).toBe(UNSUPPORTED_VERSION_MESSAGE);
      // The point of the rejection is that nothing is guessed.
      expect(result).not.toHaveProperty("spec");
    }
  });

  it("states the unsupported format in plain language", () => {
    expect(UNSUPPORTED_VERSION_MESSAGE).toBe(
      "This view uses an older format and cannot open in this version.",
    );
  });

  it("rejects a missing or future version the same way", () => {
    for (const version of [undefined, 0, 4, "3", null]) {
      const result = readQuestion({ ...baseSpec(), version });
      expect(result.ok, `version: ${String(version)}`).toBe(false);
      expect(result.reason, `version: ${String(version)}`).toBe("unsupported-version");
    }
  });
});

describe("questionSpec change classification", () => {
  it("classifies a comparison edit as structural", () => {
    const before = normalizeQuestion(baseSpec());
    const after = normalizeQuestion({
      ...baseSpec(),
      question: {
        ...baseSpec().question,
        comparisons: [
          baseSpec().question.comparisons[0],
          {
            id: "cmp_white_women",
            // Same card, different population: Female becomes Male.
            dimensions: { "Race/Ethnicity": "White", Sex: "Male", "Age Group": "All Ages" },
          },
        ],
      },
    });

    expect(classifyChange(before, after)).toBe("structural");
  });

  it("classifies an outcome, time, geography, or calculation change as structural", () => {
    const before = normalizeQuestion(baseSpec());
    const cases = {
      outcome: { ...baseSpec().question, outcome: { measureId: "Households" } },
      time: {
        ...baseSpec().question,
        time: { contract: "range", startYear: 2025, endYear: 2030 },
      },
      geography: {
        ...baseSpec().question,
        geography: { subset: "Counties", locations: ["San Francisco"] },
      },
      calculation: {
        ...baseSpec().question,
        calculation: { id: "percentChange", params: { startYear: 2020, endYear: 2025 } },
      },
    };

    for (const [name, question] of Object.entries(cases)) {
      const after = normalizeQuestion({ ...baseSpec(), question });
      expect(classifyChange(before, after), name).toBe("structural");
    }
  });

  it("classifies an active tab change as presentation-only", () => {
    const before = normalizeQuestion({
      ...baseSpec(),
      presentation: {
        ...baseSpec().presentation,
        comparisonPresentation: "tabs",
        activeTab: "cmp_latina",
      },
    });
    const after = normalizeQuestion({
      ...baseSpec(),
      presentation: {
        ...baseSpec().presentation,
        comparisonPresentation: "tabs",
        // Moving between comparisons that were already loaded together.
        activeTab: "cmp_white_women",
      },
    });

    expect(classifyChange(before, after)).toBe("presentation");
  });

  it("classifies labels, colors, and chart type as presentation-only", () => {
    const before = normalizeQuestion(baseSpec());
    const cases = {
      labels: { ...baseSpec().presentation, labels: { title: "A different title" } },
      // Heatmap, not Bar: both Line and Heatmap accept a range, so this diff
      // is only a chart type and nothing in the question moves with it.
      chartType: { ...baseSpec().presentation, chartType: "heatmap" },
      appearance: { ...baseSpec().presentation, appearance: { palette: "ppic-main" } },
    };

    for (const [name, presentation] of Object.entries(cases)) {
      const after = normalizeQuestion({ ...baseSpec(), presentation });
      expect(classifyChange(before, after), name).toBe("presentation");
    }
  });

  it("reports no change when nothing moved", () => {
    expect(classifyChange(normalizeQuestion(baseSpec()), normalizeQuestion(baseSpec()))).toBe(
      "none",
    );
  });
});

describe("questionSpec chart-specific presentation memory", () => {
  it("remembers inactive chart presentation without applying it", () => {
    // Line is configured as an area chart, then the user switches to Bar.
    const asLine = normalizeQuestion({
      ...baseSpec(),
      presentation: { ...baseSpec().presentation, chartType: "line", appearance: { area: true } },
    });

    const asBar = applyChartType(asLine, "bar");

    expect(asBar.presentation.chartType).toBe("bar");
    // The line-only setting is remembered...
    expect(asBar.presentation.charts.line).toMatchObject({ area: true });
    // ...but it is not active on the current chart.
    expect(asBar.presentation.appearance.area).toBeUndefined();

    // Switching back restores it rather than resetting to the default.
    const backToLine = applyChartType(asBar, "line");
    expect(backToLine.presentation.appearance.area).toBe(true);
  });

  it("never leaves a remembered setting active on the chart that cannot use it", () => {
    const asBar = applyChartType(
      normalizeQuestion({
        ...baseSpec(),
        presentation: {
          ...baseSpec().presentation,
          chartType: "line",
          appearance: { area: true, palette: "brand-categorical" },
        },
      }),
      "bar",
    );

    // The shared appearance value survives; only the line-only one is parked.
    expect(asBar.presentation.appearance.palette).toBe("brand-categorical");
    expect(Object.keys(asBar.presentation.appearance)).not.toContain("area");
  });

  it("keeps the question untouched when the new chart accepts the same time", () => {
    // Line and Heatmap both accept a range, so nothing in the question moves.
    // (A switch to a snapshot-only chart clears the active time instead - that
    // rule is pinned in TimeSection.test.js and chartConfigStore.)
    const before = normalizeQuestion(baseSpec());
    const after = applyChartType(before, "heatmap");
    expect(after.question).toEqual(before.question);
  });
});
