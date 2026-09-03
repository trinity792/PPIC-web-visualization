import { describe, expect, it } from "vitest";

import {
  V3_REVIEW_MODULE_IDS,
  getV3DevelopmentReviewSpec,
} from "@/lib/visualization/developmentReview";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";
import { readQuestion } from "@/lib/visualization/questionSpec";
import { resolveEditorModel } from "@/lib/visualization/resolveEditorModel";

describe("the selected-topic v3 editor questions", () => {
  it("provides a valid real-module question for every review dataset", () => {
    expect(V3_REVIEW_MODULE_IDS).toEqual([
      "demographic-projections",
      "components-of-change",
    ]);

    for (const moduleId of V3_REVIEW_MODULE_IDS) {
      const spec = getV3DevelopmentReviewSpec(moduleId);
      const schema = getModuleSchema(moduleId);
      const parsed = readQuestion(spec);

      expect(parsed.ok, moduleId).toBe(true);
      expect(spec.question.dataset).toEqual({ kind: "module", moduleId });
      if (moduleId === "demographic-projections") {
        expect(spec.question.comparisons).toEqual([]);
        expect(spec.presentation.appearance.palette).toBeUndefined();
      } else {
        expect(spec.question.comparisons.length, moduleId).toBeGreaterThan(0);
        expect(spec.question.comparisons[0].id).toBe("cmp_locations");
      }
      expect(spec.question.comparisons.length, moduleId).toBeLessThanOrEqual(10);
      expect(new Set(spec.question.comparisons.map((entry) => entry.id)).size).toBe(
        spec.question.comparisons.length,
      );
      expect(schema.fields[spec.question.outcome.measureId]?.kind, moduleId).toBe("measure");
      expect(spec.question.geography, moduleId).toEqual({ subset: "", locations: [] });
      expect(spec.question.time, moduleId).toEqual({
        contract: "range",
        startYear: schema.time.availablePeriods[0],
        endYear: schema.time.availablePeriods.at(-1),
      });
      expect(
        resolveEditorModel({ spec, schema }).chartChoices.find(
          (choice) => choice.id === spec.presentation.chartType,
        )?.available,
        moduleId,
      ).toBe(true);
    }
  });

  it("returns a fresh copy and rejects an unknown review dataset", () => {
    const first = getV3DevelopmentReviewSpec("demographic-projections");
    first.question.comparisons.push({ id: "changed-locally", dimensions: {} });

    expect(
      getV3DevelopmentReviewSpec("demographic-projections").question.comparisons,
    ).toEqual([]);
    expect(getV3DevelopmentReviewSpec("not-a-module")).toBeNull();
  });
});
