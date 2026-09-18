import { describe, expect, it } from "vitest";

import {
  DEFAULT_QUESTION_MODULE_IDS,
  getDefaultQuestion,
} from "@/lib/visualization/defaultQuestions";
import { MODULE_IDS, getModuleSchema } from "@/lib/visualization/moduleRegistry";
import { readQuestion } from "@/lib/visualization/questionSpec";
import { resolveEditorModel } from "@/lib/visualization/resolveEditorModel";

// Modules whose schema declares real comparison dimensions beyond location
// start as an unanswered question (empty comparisons), same as
// demographic-projections. Location-only modules start with one blank
// `cmp_locations` envelope, same as components-of-change.
const UNANSWERED_MODULES = new Set([
  "demographic-projections",
  "housing-stress",
  "rhna-progress",
]);

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
      if (UNANSWERED_MODULES.has(moduleId)) {
        expect(spec.question.comparisons, moduleId).toEqual([]);
        expect(spec.presentation.appearance.palette, moduleId).toBeUndefined();
      } else {
        expect(spec.question.comparisons.length, moduleId).toBeGreaterThan(0);
        expect(spec.question.comparisons[0].id, moduleId).toBe("cmp_locations");
      }
      expect(spec.question.comparisons.length, moduleId).toBeLessThanOrEqual(10);
      expect(new Set(spec.question.comparisons.map((entry) => entry.id)).size).toBe(
        spec.question.comparisons.length,
      );
      expect(schema.fields[spec.question.outcome.measureId]?.kind, moduleId).toBe("measure");
      expect(spec.question.geography, moduleId).toEqual({ subset: "", locations: [] });
      if (moduleId === "rhna-progress") {
        // Snapshot-versioned dataset with no static period list yet (see
        // rhnaProgress.js `time` comment) — resolves server-side instead.
        expect(spec.question.time, moduleId).toEqual({ contract: "snapshot" });
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

  it("returns a fresh copy and rejects an unknown review dataset", () => {
    const first = getDefaultQuestion("demographic-projections");
    first.question.comparisons.push({ id: "changed-locally", dimensions: {} });

    expect(
      getDefaultQuestion("demographic-projections").question.comparisons,
    ).toEqual([]);
    expect(getDefaultQuestion("not-a-module")).toBeNull();
  });
});
