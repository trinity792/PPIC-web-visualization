/**
 * Tests for lib/visualization/codebridge/grammar.js — the shared R/Stata
 * surface-syntax table both the generators and parsers read from.
 */

import { describe, expect, it } from "vitest";

import {
  featureCoverage,
  fieldForSlug,
  slugForField,
} from "@/lib/visualization/codebridge/grammar";

const schema = {
  id: "testmodule",
  label: "Test Module",
  fields: {
    Year: { kind: "temporal" },
    Location: { kind: "dimension" },
    "Total Widgets": { kind: "measure" },
    "Vacancy Rate (%)": { kind: "measure" },
    "2020 Cohort Size": { kind: "measure" },
  },
};

describe("slugForField", () => {
  it("lowercases and collapses spaces to underscores", () => {
    expect(slugForField("Total Widgets")).toBe("total_widgets");
  });

  it("collapses punctuation like % and parentheses", () => {
    expect(slugForField("Vacancy Rate (%)")).toBe("vacancy_rate");
  });

  it("prefixes a leading digit with v_", () => {
    expect(slugForField("2020 Cohort Size")).toBe("v_2020_cohort_size");
  });

  it("trims leading/trailing underscores from punctuation at the edges", () => {
    expect(slugForField(" Persons Per Household! ")).toBe("persons_per_household");
  });

  it("returns an empty string for a falsy name", () => {
    expect(slugForField("")).toBe("");
    expect(slugForField(null)).toBe("");
  });
});

describe("fieldForSlug", () => {
  it("round-trips every schema field through slugForField", () => {
    for (const name of Object.keys(schema.fields)) {
      expect(fieldForSlug(slugForField(name), schema)).toBe(name);
    }
  });

  it("returns null for an unresolvable slug", () => {
    expect(fieldForSlug("no_such_field", schema)).toBeNull();
  });

  it("resolves Year/Location even if a schema omits them from fields", () => {
    const bareSchema = { fields: { "Total Widgets": { kind: "measure" } } };
    expect(fieldForSlug("year", bareSchema)).toBe("Year");
    expect(fieldForSlug("location", bareSchema)).toBe("Location");
  });
});

describe("featureCoverage", () => {
  const baseSpec = {
    chartType: "line",
    layers: [],
    annotations: [],
    referenceLines: [],
    transform: "actual",
    filters: { subset: "Counties" },
  };

  it("returns no findings for a fully-supported, plain spec", () => {
    expect(featureCoverage(baseSpec, "r")).toEqual([]);
    expect(featureCoverage(baseSpec, "stata")).toEqual([]);
  });

  it("names an unsupported chart type", () => {
    const findings = featureCoverage({ ...baseSpec, chartType: "dumbbell" }, "r");
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("CODEGEN_UNSUPPORTED");
    expect(findings[0].feature).toContain("dumbbell");
  });

  it("names non-empty layers", () => {
    const findings = featureCoverage({ ...baseSpec, layers: [{ id: "l1", type: "benchmark" }] }, "r");
    expect(findings.some((f) => f.feature === "layers")).toBe(true);
  });

  it("names non-empty annotations", () => {
    const findings = featureCoverage({ ...baseSpec, annotations: [{ type: "text" }] }, "r");
    expect(findings.some((f) => f.feature === "annotations")).toBe(true);
  });

  it("names a non-actual transform", () => {
    const findings = featureCoverage({ ...baseSpec, transform: "indexed" }, "r");
    const finding = findings.find((f) => f.feature.includes("transform"));
    expect(finding.message).toContain("indexed");
  });

  it("names stratification filters beyond subset/source", () => {
    const findings = featureCoverage(
      { ...baseSpec, filters: { subset: "Counties", ageGroup: "18-24" } },
      "stata",
    );
    const finding = findings.find((f) => f.feature === "stratification filters");
    expect(finding.message).toContain("ageGroup");
  });

  it("scatter/bubble/heatmap are unsupported in Stata but supported in R", () => {
    for (const chartType of ["scatter", "bubble", "heatmap"]) {
      const spec = { ...baseSpec, chartType };
      const stataFindings = featureCoverage(spec, "stata");
      if (chartType === "scatter") {
        expect(stataFindings).toEqual([]);
      } else {
        expect(stataFindings.some((f) => f.code === "CODEGEN_UNSUPPORTED")).toBe(true);
      }
      expect(featureCoverage(spec, "r")).toEqual([]);
    }
  });
});
