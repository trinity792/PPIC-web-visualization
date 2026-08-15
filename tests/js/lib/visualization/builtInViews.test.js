/** Regression coverage for the built-in views preserved by the registry rename. */

import { describe, expect, it } from "vitest";

import {
  BUILT_IN_VIEWS,
  getBuiltInView,
} from "@/lib/visualization/builtInViews";

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
      expect(getBuiltInView(viewId)).toBe(BUILT_IN_VIEWS[viewId]);
    }
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

  it("returns undefined for an unknown view id", () => {
    expect(getBuiltInView("not-a-real-view")).toBeUndefined();
  });
});
