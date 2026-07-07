/**
 * Tests for module-aware presets - Phase 6. A preset is data, not component
 * code: module schemas may contribute schema.presets entries, and each preset's
 * embedded config should validate against that module schema.
 */

import { describe, expect, it } from "vitest";

import { CHART_TYPE_IDS } from "@/lib/visualization/chartRegistry";
import { BUILDING_PERMITS_SCHEMA } from "@/lib/visualization/moduleSchemas/buildingPermits";
import { DEMOGRAPHIC_PROJECTIONS_SCHEMA } from "@/lib/visualization/moduleSchemas/demographicProjections";
import { MODULE_SCHEMAS } from "@/lib/visualization/moduleRegistry";
import { PRESETS } from "@/lib/visualization/presetRegistry";
import { hasBlockingErrors, validateConfig } from "@/lib/visualization/validation";

function modulePresets() {
  return Object.values(MODULE_SCHEMAS).flatMap((schema) =>
    (schema.presets || []).map((preset) => ({ schema, preset })),
  );
}

describe("schema.presets contract", () => {
  it("every module-owned preset has display metadata and a validating config", () => {
    for (const { schema, preset } of modulePresets()) {
      expect(preset.id, `${schema.id} preset`).toEqual(expect.any(String));
      expect(preset.title, `${schema.id} preset ${preset.id}`).toEqual(expect.any(String));
      expect(preset.question, `${schema.id} preset ${preset.id}`).toEqual(expect.any(String));
      expect(preset.config, `${schema.id} preset ${preset.id}`).toEqual(expect.any(Object));
      expect(preset.config.module, `${schema.id} preset ${preset.id}`).toBe(schema.id);
      expect(hasBlockingErrors(validateConfig(preset.config, schema))).toBe(false);
    }
  });

  it("every chart type has at least one generic or module-owned preset", () => {
    const presetChartTypes = new Set([
      ...Object.values(PRESETS).map((preset) => preset.chartType),
      ...modulePresets().map(({ preset }) => preset.config.chartType),
    ]);

    for (const chartType of CHART_TYPE_IDS) {
      expect(presetChartTypes, `chartType: ${chartType}`).toContain(chartType);
    }
  });
});

describe("Building Permits presets", () => {
  it("removes the underConstruction gate once monthly presets are present", () => {
    expect(BUILDING_PERMITS_SCHEMA.underConstruction).not.toBe(true);
    expect(BUILDING_PERMITS_SCHEMA.temporalGranularity).toBe("month");
    expect(BUILDING_PERMITS_SCHEMA.presets?.length).toBeGreaterThan(0);
  });

  it("includes at least one preset that uses the monthly Date field", () => {
    expect(BUILDING_PERMITS_SCHEMA.presets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          config: expect.objectContaining({
            module: "building-permits",
            bindings: expect.objectContaining({ x: "Date" }),
          }),
        }),
      ]),
    );
  });
});

describe("Demographic Projections presets", () => {
  it("includes the age pyramid as a mirrored bar preset", () => {
    const agePyramid = DEMOGRAPHIC_PROJECTIONS_SCHEMA.presets?.find((preset) =>
      /pyramid/i.test(`${preset.id} ${preset.title}`),
    );

    expect(agePyramid).toBeTruthy();
    expect(agePyramid.config).toMatchObject({
      module: "demographic-projections",
      chartType: "bar",
      bindings: {
        category: "Age Group",
        y: "Population",
        group: "Sex",
      },
      appearance: { mirror: true },
    });
    expect(hasBlockingErrors(validateConfig(agePyramid.config, DEMOGRAPHIC_PROJECTIONS_SCHEMA))).toBe(false);
  });
});
