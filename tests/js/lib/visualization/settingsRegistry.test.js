/**
 * Workstream G - lib/visualization/settingsRegistry.js.
 *
 * The repository has no machine-readable inventory of settings. Advanced Mode
 * gates are spread across several components, and the Settings Reference is a
 * hand-maintained section of `visualization-specification.md`, so nothing can
 * currently prove that a control the reader can see has a consumer, or that a
 * value the app stores still does anything.
 *
 * The registry supplies facts - id, label, section, mode, classification,
 * applicability, valid values, config path, consumer, chart-switch policy. A
 * person writes the explanation in `settingsCopy.js` against the same id. The
 * split matters: generated facts stay current without a person re-typing them,
 * and generated prose is not worth reading.
 */

import { describe, expect, it } from "vitest";

import { SETTINGS_COPY } from "@/lib/visualization/settingsCopy";
import {
  getSetting,
  listSettings,
  resolveVisibleSettings,
  unwiredSettings,
} from "@/lib/visualization/settingsRegistry";

const REQUIRED_FIELDS = [
  "id",
  "label",
  "section",
  "mode", // standard | advanced
  "classification", // question | presentation
  "charts", // chart ids, or "all"
  "datasets", // module ids, or "all"
  "values", // enumerated values, a range, or a described limit
  "configPath", // where it is stored in the v3 spec
  "consumer", // what reads it
  "chartSwitchPolicy", // keep | remember | clear
  "documentationId",
  "approval", // pending | approved
];

/** A v3 question and the editor model a resolver returns for it. */
function editorModel(overrides = {}) {
  return {
    chartType: "line",
    mode: "standard",
    spec: {
      version: 3,
      question: {
        dataset: { kind: "module", moduleId: "projections" },
        source: "DoF P-3",
        outcome: { measureId: "Population" },
        geography: { subset: "Counties", locations: ["San Francisco"] },
        time: { contract: "range", startYear: 2020, endYear: 2030 },
        calculation: { id: "actual", params: {} },
        comparisons: [{ id: "cmp_latina", dimensions: { Sex: "Female" } }],
      },
      presentation: { chartType: "line", comparisonPresentation: "combined" },
    },
    ...overrides,
  };
}

describe("the registry is complete", () => {
  it("describes every setting with the same facts", () => {
    for (const setting of listSettings()) {
      for (const field of REQUIRED_FIELDS) {
        expect(setting, `${setting.id}.${field}`).toHaveProperty(field);
      }
      expect(["standard", "advanced"], setting.id).toContain(setting.mode);
      expect(["question", "presentation"], setting.id).toContain(setting.classification);
      expect(["keep", "remember", "clear"], setting.id).toContain(setting.chartSwitchPolicy);
    }
  });

  it("uses a unique id for every setting", () => {
    const ids = listSettings().map((setting) => setting.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("inventories every resolved visible setting", () => {
    // Standard and Advanced, across every chart family: no control may exist
    // outside the product contract.
    for (const chartType of ["line", "bar", "choroplethMap", "pie", "dataTable"]) {
      for (const mode of ["standard", "advanced"]) {
        const visible = resolveVisibleSettings(editorModel({ chartType, mode }));
        for (const control of visible) {
          expect(getSetting(control.id), `${chartType}/${mode}: ${control.id}`).toBeDefined();
        }
      }
    }
  });

  it("gives every stored setting a named consumer", () => {
    for (const setting of listSettings()) {
      // A value that is written to the config and read by nothing is a setting
      // that appears to work. It is the failure mode the audit found repeatedly
      // and the reason this file exists.
      expect(setting.consumer, setting.id).toEqual(expect.any(String));
      expect(setting.consumer.length, setting.id).toBeGreaterThan(0);
      expect(setting.configPath, setting.id).toMatch(/^(question|presentation)\./);
    }
  });

  it("gives every setting one human explanation", () => {
    for (const setting of listSettings()) {
      const copy = SETTINGS_COPY[setting.documentationId];
      expect(copy, setting.id).toBeDefined();
      expect(copy.purpose, setting.id).toEqual(expect.any(String));
    }
  });

  it("leaves no copy row without a setting", () => {
    const documented = new Set(listSettings().map((setting) => setting.documentationId));
    for (const id of Object.keys(SETTINGS_COPY)) {
      // Orphan help text describes a control that no longer exists, which is
      // worse than no help at all.
      expect(documented, `copy: ${id}`).toContain(id);
    }
  });

  it("includes every Advanced Mode item the audit found", () => {
    // Recorded before anything is renamed or removed. The list is evidence, not
    // a promise that each one survives.
    const ids = listSettings().map((setting) => setting.id);
    for (const id of [
      "ranking",
      "seriesBinding",
      "comparisonLegendLabel",
      "comparisonColor",
      "comparisonVisibility",
      "customDivergingStops",
      "hideXAxis",
      "comparisonGeographyOverride",
      "comparisonTimeOverride",
    ]) {
      expect(ids, id).toContain(id);
    }
  });
});

describe("the approval gate", () => {
  it("rejects an unapproved visible setting", () => {
    const visible = resolveVisibleSettings(editorModel({ mode: "advanced" }));
    for (const control of visible) {
      // Every new or changed setting enters as `pending` and the developer
      // reviews its meaning, placement, default, capability, tests, and
      // documentation before it can be seen.
      expect(getSetting(control.id).approval, control.id).toBe("approved");
    }
  });

  it("fails the production build when a pending setting is visible", async () => {
    const { assertNoPendingVisibleSettings } = await import(
      "@/lib/visualization/settingsRegistry"
    );

    expect(() => assertNoPendingVisibleSettings(editorModel())).not.toThrow();
    expect(() =>
      assertNoPendingVisibleSettings(
        editorModel({ overrideApprovals: { ranking: "pending" } }),
      ),
    ).toThrow(/pending/i);
  });
});

describe("the honest audit", () => {
  it("lists declared but unwired settings without treating them as supported", () => {
    const unwired = unwiredSettings();
    const supported = new Set(listSettings().map((setting) => setting.id));

    for (const entry of unwired) {
      // A separate list, not a to-do list: the developer decides whether each
      // one gets an implementation or a removal-changelog entry. What it must
      // never do is sit in the supported inventory pretending to work.
      expect(supported, entry.id).not.toContain(entry.id);
      expect(entry.reason, entry.id).toEqual(expect.any(String));
      expect(entry.lastConsumer, entry.id).not.toBeUndefined();
    }
  });

  it("never lists the same id as both supported and unwired", () => {
    const supported = new Set(listSettings().map((setting) => setting.id));
    for (const entry of unwiredSettings()) {
      expect(supported.has(entry.id), entry.id).toBe(false);
    }
  });
});
