/**
 * Tests for lib/visualization/settingsTiers.js — the Basic/Moderate/Advanced
 * control-visibility registry.
 */

import { describe, expect, it } from "vitest";

import {
  CONTROL_TIERS,
  DEFAULT_TIER,
  hiddenCount,
  isVisible,
  TIERS,
} from "@/lib/visualization/settingsTiers";

describe("TIERS", () => {
  it("orders basic < moderate < advanced with a valid default", () => {
    expect(TIERS).toEqual(["basic", "moderate", "advanced"]);
    expect(TIERS).toContain(DEFAULT_TIER);
  });

  it("every registered control names a valid tier", () => {
    for (const [id, entry] of Object.entries(CONTROL_TIERS)) {
      expect(TIERS, `control: ${id}`).toContain(entry.tier);
      expect(typeof entry.section, `control: ${id}`).toBe("string");
    }
  });
});

describe("isVisible", () => {
  it("is tier-inclusive: a basic control shows at every tier", () => {
    for (const tier of TIERS) expect(isVisible("presets", tier)).toBe(true);
  });

  it("hides advanced controls below Advanced", () => {
    expect(isVisible("seriesColors", "basic")).toBe(false);
    expect(isVisible("seriesColors", "moderate")).toBe(false);
    expect(isVisible("seriesColors", "advanced")).toBe(true);
    expect(isVisible("categorySelection", "moderate")).toBe(false);
    expect(isVisible("categorySelection", "advanced")).toBe(true);
  });

  it("hides moderate controls at Basic only", () => {
    expect(isVisible("encodings", "basic")).toBe(false);
    expect(isVisible("encodings", "moderate")).toBe(true);
  });

  it("treats an unregistered control as always visible (fail open)", () => {
    expect(isVisible("someFutureControl", "basic")).toBe(true);
  });
});

describe("hiddenCount", () => {
  it("counts nothing hidden at Advanced", () => {
    expect(hiddenCount("advanced")).toBe(0);
  });

  it("counts more hidden at Basic than at Moderate", () => {
    expect(hiddenCount("basic")).toBeGreaterThan(hiddenCount("moderate"));
    expect(hiddenCount("moderate")).toBeGreaterThan(0);
  });

  it("scopes to a section and excludes the section's own entry", () => {
    const appearanceHidden = hiddenCount("moderate", "appearance");
    expect(appearanceHidden).toBeGreaterThan(0); // seriesColors, formatOverrides
    expect(appearanceHidden).toBeLessThan(hiddenCount("moderate"));
  });
});
