import { describe, expect, it } from "vitest";

import { missingQuestionSelections } from "@/lib/visualization/questionReadiness";

const schema = {
  subsets: { Counties: ["County"], Regions: ["Region"] },
  fields: {
    "Race/Ethnicity": { label: "Race/ethnicity" },
    Sex: { label: "Sex" },
    "Age Group": { label: "Age group" },
  },
  comparisonDimensions: [
    { id: "Race/Ethnicity" },
    { id: "Sex" },
    { id: "Age Group" },
  ],
};

function spec(overrides = {}) {
  return {
    version: 3,
    question: {
      geography: { subset: "Counties", locations: ["San Francisco"] },
      time: { contract: "range", startYear: 2020, endYear: 2070 },
      comparisons: [{ id: "cmp_1", dimensions: {} }],
      ...overrides,
    },
    presentation: { chartType: "line" },
  };
}

describe("v3 question readiness", () => {
  it("lists every missing demographic selection without inventing defaults", () => {
    expect(missingQuestionSelections(spec(), schema)).toEqual([
      "Race/ethnicity",
      "Sex",
      "Age group",
    ]);
  });

  it("requires an explicit Line location after geographic level changes", () => {
    const readyDimensions = {
      "Race/Ethnicity": "All",
      Sex: "Both Sexes",
      "Age Group": "All Ages",
    };
    expect(
      missingQuestionSelections(
        spec({
          geography: { subset: "Regions", locations: [] },
          comparisons: [{ id: "cmp_1", dimensions: readyDimensions }],
        }),
        schema,
      ),
    ).toEqual(["Location"]);
  });

  it("keeps a cleared Bar selection empty instead of treating it as every place", () => {
    const cleared = spec({
      geography: { subset: "Regions", locations: [] },
      comparisons: [{
        id: "cmp_1",
        dimensions: {
          "Race/Ethnicity": "Black",
          Sex: "Female",
          "Age Group": "All Ages",
        },
      }],
    });
    cleared.presentation.chartType = "bar";

    expect(missingQuestionSelections(cleared, schema)).toEqual(["Location"]);
  });

  it("treats an empty Bar year selection as unfinished rather than invalid", () => {
    const needsYears = spec({
      time: { contract: "selectedSnapshots", years: [] },
      comparisons: [{
        id: "cmp_1",
        dimensions: {
          "Race/Ethnicity": "Black",
          Sex: "Female",
          "Age Group": "All Ages",
        },
      }],
    });
    needsYears.presentation.chartType = "bar";

    expect(missingQuestionSelections(needsYears, schema)).toEqual(["Time"]);
    needsYears.question.time.years = [2025];
    expect(missingQuestionSelections(needsYears, schema)).toEqual([]);
  });

  it("lets a bare snapshot through when the module publishes no periods to pick", () => {
    // RHNA Progress: the schema lists no snapshot dates (see rhnaProgress.js
    // `time`), so the service resolves "snapshot" to its latest row. There is
    // no year for the reader to choose, so it must not read as unfinished —
    // otherwise the preview never sends a request and the module cannot render.
    const noPeriods = {
      ...schema,
      comparisonDimensions: [{ id: "Income Level" }],
      fields: { "Income Level": { label: "Income level" } },
      time: { availablePeriods: [], reportingPeriods: [], defaultReportingPeriod: null },
    };
    const snapshot = spec({
      time: { contract: "snapshot" },
      comparisons: [{ id: "cmp_1", dimensions: { "Income Level": "Total" } }],
    });
    snapshot.presentation.chartType = "bar";
    expect(missingQuestionSelections(snapshot, noPeriods)).toEqual([]);

    // With a published list, a bare snapshot is still an unfinished selection.
    const withPeriods = { ...noPeriods, time: { availablePeriods: [2024, 2025] } };
    expect(missingQuestionSelections(snapshot, withPeriods)).toEqual(["Time"]);
  });

  it("requires a geographic level before requesting any geographic chart", () => {
    const noLevel = spec({
      geography: { subset: "", locations: [] },
      comparisons: [{
        id: "cmp_1",
        dimensions: {
          "Race/Ethnicity": "All",
          Sex: "Both Sexes",
          "Age Group": "All Ages",
        },
      }],
    });

    expect(missingQuestionSelections(noLevel, schema)).toEqual([
      "Geographic level",
      "Location",
    ]);

    noLevel.presentation.chartType = "choroplethMap";
    expect(missingQuestionSelections(noLevel, schema)).toEqual(["Geographic level"]);
  });

  it("allows an unfiltered map to request every feature at its level", () => {
    const map = spec({
      geography: { subset: "Counties", locations: [] },
      comparisons: [{
        id: "cmp_1",
        dimensions: {
          "Race/Ethnicity": "All",
          Sex: "Both Sexes",
          "Age Group": "All Ages",
        },
      }],
    });
    map.presentation.chartType = "choroplethMap";
    expect(missingQuestionSelections(map, schema)).toEqual([]);
  });
});
