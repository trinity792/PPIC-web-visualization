import { describe, expect, it } from "vitest";

import {
  DEFAULT_QUESTION_MODULE_IDS,
  getDefaultQuestion,
} from "@/lib/visualization/defaultQuestions";
import { MODULE_IDS, getModuleSchema } from "@/lib/visualization/moduleRegistry";
import { REGION_NAMES } from "@/lib/geography/californiaGeography";
import { showsSourceBox } from "@/lib/visualization/models/sharedSettings";
import { readQuestion } from "@/lib/visualization/questionSpec";
import { missingQuestionSelections } from "@/lib/visualization/questionReadiness";
import { resolveEditorModel } from "@/lib/visualization/resolveEditorModel";

describe("the default v3 question every module opens on", () => {
  it("provides a valid real-module question for every registered module", () => {
    // Every registered module must have one: `/[module]` seeds the workbench
    // with it, so a module missing here has no editor at all.
    expect([...DEFAULT_QUESTION_MODULE_IDS].sort()).toEqual([...MODULE_IDS].sort());
    expect(DEFAULT_QUESTION_MODULE_IDS).toEqual([
      "demographic-projections",
      "components-of-change",
      "pophousing",
      "housing-stress",
      "building-permits",
      "rhna-progress",
    ]);

    for (const moduleId of DEFAULT_QUESTION_MODULE_IDS) {
      const spec = getDefaultQuestion(moduleId);
      const schema = getModuleSchema(moduleId);
      const parsed = readQuestion(spec);

      expect(parsed.ok, moduleId).toBe(true);
      expect(spec.question.dataset).toEqual({ kind: "module", moduleId });
      expect(missingQuestionSelections(spec, schema), moduleId).toEqual([]);
      expect(spec.question.comparisons.length, moduleId).toBeGreaterThan(0);
      expect(spec.question.comparisons.length, moduleId).toBeLessThanOrEqual(10);
      expect(new Set(spec.question.comparisons.map((entry) => entry.id)).size).toBe(
        spec.question.comparisons.length,
      );
      expect(schema.fields[spec.question.outcomes[0].measureId]?.kind, moduleId).toBe("measure");
      expect(schema.subsets[spec.question.geography.subset], moduleId).toBeDefined();
      expect(spec.question.geography.locations.length, moduleId).toBeGreaterThan(0);
      if (moduleId === "rhna-progress") {
        // Snapshot-versioned dataset with no static period list yet (see
        // rhnaProgress.js `time` comment) — resolves server-side instead.
        expect(spec.question.time, moduleId).toEqual({ contract: "snapshot" });
      } else if (moduleId === "components-of-change") {
        expect(spec.question.time).toEqual({
          contract: "snapshot",
          year: schema.time.defaultReportingPeriod,
        });
      } else {
        expect(spec.question.time, moduleId).toEqual({
          contract: "range",
          startYear: schema.time.availablePeriods[0],
          endYear: schema.time.availablePeriods.at(-1),
        });
      }
      expect(
        resolveEditorModel({ spec, schema }).chartChoices.find(
          (choice) => choice.id === spec.presentation.chartType,
        )?.available,
        moduleId,
      ).toBe(true);
    }
  });

  it("opens Population & Housing with total population across all regions", () => {
    const spec = getDefaultQuestion("pophousing");
    expect(spec.question.outcomes).toEqual([{ role: "y", measureId: "Total Population" }]);
    expect(spec.question.geography).toEqual({ subset: "Regions", locations: REGION_NAMES });
    expect(spec.presentation.chartType).toBe("line");
  });

  it("opens Components of Change with the latest DoF net migration ranking", () => {
    const spec = getDefaultQuestion("components-of-change");
    expect(spec.question.source).toBe("DoF");
    expect(spec.question.outcomes).toEqual([{ role: "y", measureId: "Net Migration" }]);
    expect(spec.question.geography).toEqual({ subset: "Regions", locations: REGION_NAMES });
    expect(spec.presentation).toMatchObject({ chartType: "bar", appearance: { sort: "descending" } });
  });

  it("opens Projections with all women and all men in separate tabs for the four regions", () => {
    const spec = getDefaultQuestion("demographic-projections");
    expect(spec.question.outcomes).toEqual([{ role: "y", measureId: "Population" }]);
    expect(spec.question.geography).toEqual({
      subset: "Regions",
      locations: ["Bay Area", "Inland Empire", "Central Coast", "San Diego (Regional)"],
    });
    expect(spec.question.comparisons.map(({ dimensions }) => dimensions)).toEqual([
      { "Race/Ethnicity": "All", Sex: "Female", "Age Group": "All Ages" },
      { "Race/Ethnicity": "All", Sex: "Male", "Age Group": "All Ages" },
    ]);
    expect(spec.presentation).toMatchObject({ chartType: "line", comparisonPresentation: "tabs" });
  });

  it("returns a fresh copy and rejects an unknown review dataset", () => {
    const first = getDefaultQuestion("demographic-projections");
    first.question.comparisons[0].dimensions.Sex = "Both Sexes";
    first.question.geography.locations.push("Far North");

    expect(
      getDefaultQuestion("demographic-projections").question.comparisons[0].dimensions.Sex,
    ).toBe("Female");
    expect(getDefaultQuestion("demographic-projections").question.geography.locations).toHaveLength(4);
    expect(getDefaultQuestion("not-a-module")).toBeNull();
  });

  it("opens RHNA on a county choropleth for the latest total-income on-track scores", () => {
    const spec = getDefaultQuestion("rhna-progress");
    expect(spec.question.outcomes).toEqual([{ role: "y", measureId: "On Track Score" }]);
    expect(spec.question.geography.subset).toBe("Counties");
    expect(spec.question.time).toEqual({ contract: "snapshot" });
    expect(spec.question.comparisons[0].dimensions).toEqual({ "Income Level": "Total" });
    expect(spec.presentation).toMatchObject({ chartType: "choroplethMap", comparisonPresentation: "tabs" });
    expect(spec.presentation.appearance.sort).toBeUndefined();
  });
});

describe("the source-and-notes (footnote) box default", () => {
  it("starts off in the custom Visualization Tool", () => {
    const spec = getDefaultQuestion("byod");
    expect(readQuestion(spec).ok).toBe(true);
    expect(showsSourceBox(spec.presentation.appearance)).toBe(false);
  });

  it("stays on for every module chart", () => {
    for (const moduleId of DEFAULT_QUESTION_MODULE_IDS) {
      const spec = getDefaultQuestion(moduleId);
      expect(showsSourceBox(spec.presentation.appearance), moduleId).toBe(true);
    }
  });
});
