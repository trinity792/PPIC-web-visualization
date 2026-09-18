/**
 * Regression coverage for the built-in `?view=` deep links. Every id is a
 * public URL, so the set is pinned; since the v3 cutover each view must also
 * be a complete, runnable v3 question for its module - a deep link that opens
 * on the skeleton is a broken link.
 */

import { describe, expect, it } from "vitest";

import {
  BUILT_IN_VIEWS,
  getBuiltInView,
} from "@/lib/visualization/builtInViews";
import { MODULE_IDS, getModuleSchema } from "@/lib/visualization/moduleRegistry";
import { missingQuestionSelections } from "@/lib/visualization/questionReadiness";
import { readQuestion } from "@/lib/visualization/questionSpec";
import { resolveEditorModel } from "@/lib/visualization/resolveEditorModel";

const SHIPPED_VIEW_IDS = [
  "population-trend",
  "housing-trend",
  "county-population-ranking",
  "county-population-map",
  "migration-trend",
  "population-area",
  "persons-per-household-map",
  "housing-stress-share-trend",
  "renter-cost-burden-trend",
  "housing-stress-county-ranking",
  "housing-stress-county-map",
];

describe("built-in views", () => {
  it("resolves every built-in view id that shipped before the overhaul", () => {
    expect(Object.keys(BUILT_IN_VIEWS).sort()).toEqual(
      [...SHIPPED_VIEW_IDS].sort(),
    );

    for (const viewId of SHIPPED_VIEW_IDS) {
      expect(getBuiltInView(viewId)).toEqual(BUILT_IN_VIEWS[viewId]);
    }
  });

  it("hands out a copy so the store can never mutate the registry", () => {
    const copy = getBuiltInView("population-trend");
    copy.question.geography.locations.push("Nowhere");
    expect(getBuiltInView("population-trend").question.geography.locations).not.toContain(
      "Nowhere",
    );
  });

  it("keeps the three views the landing dashboards used", () => {
    for (const viewId of [
      "population-area",
      "persons-per-household-map",
      "migration-trend",
    ]) {
      expect(getBuiltInView(viewId)).toBeDefined();
    }
  });

  it("is a complete v3 question for a registered module, ready to run on arrival", () => {
    for (const viewId of SHIPPED_VIEW_IDS) {
      const spec = getBuiltInView(viewId);
      const moduleId = spec.question.dataset.moduleId;
      const schema = getModuleSchema(moduleId);

      expect(MODULE_IDS, viewId).toContain(moduleId);
      expect(readQuestion(spec).ok, viewId).toBe(true);
      expect(schema.fields[spec.question.outcome.measureId]?.kind, viewId).toBe("measure");
      expect(Object.keys(schema.subsets), viewId).toContain(spec.question.geography.subset);
      // A deep link is the one v3 entry point that must not land on the
      // "Select ... to build this chart" skeleton.
      expect(missingQuestionSelections(spec, schema), viewId).toEqual([]);
      expect(
        resolveEditorModel({ spec, schema }).chartChoices.find(
          (choice) => choice.id === spec.presentation.chartType,
        )?.available,
        viewId,
      ).toBe(true);
    }
  });

  it("pins every stratum a stratified module declares", () => {
    // Housing Stress compares populations, so "all households" is a real
    // comparison with both dimensions set - not an absent filter.
    for (const viewId of SHIPPED_VIEW_IDS) {
      const spec = getBuiltInView(viewId);
      const schema = getModuleSchema(spec.question.dataset.moduleId);
      for (const comparison of spec.question.comparisons) {
        for (const dimension of schema.comparisonDimensions || []) {
          expect(dimension.values, `${viewId} ${dimension.id}`).toContain(
            comparison.dimensions[dimension.id],
          );
        }
      }
    }
  });

  it("returns undefined for an unknown view id", () => {
    expect(getBuiltInView("not-a-real-view")).toBeUndefined();
  });
});
