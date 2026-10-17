/**
 * Tests for lib/visualization/deriveLabels.js's axis-binding default, focused
 * on Workstream B: a diverging bar defaults to horizontal, a plain bar to
 * vertical, and after the `divergingBar` id retired to a `bar` variant flag
 * (`appearance.diverging`) the default must still follow the same rule.
 */

import { describe, expect, it } from "vitest";

import { deriveLabels, effectiveLabels } from "@/lib/visualization/deriveLabels";

const schema = {
  fields: {
    Location: { kind: "dimension", label: "Location" },
    Score: { kind: "measure", label: "On-track score" },
  },
};

function config(overrides = {}) {
  return {
    chartType: "bar",
    bindings: { category: "Location", y: "Score" },
    appearance: {},
    ...overrides,
  };
}

describe("deriveLabels axis default for bar vs. diverging bar", () => {
  it("plain bar defaults vertical: category on x, measure on y", () => {
    const labels = deriveLabels(config(), schema);
    expect(labels.xAxis).toBe("Location");
    expect(labels.yAxis).toBe("On-track score");
  });

  it("appearance.diverging defaults horizontal: measure on x, category on y", () => {
    const labels = deriveLabels(
      config({ appearance: { diverging: true } }),
      schema,
    );
    expect(labels.xAxis).toBe("On-track score");
    expect(labels.yAxis).toBe("Location");
  });

  it("an explicit orientation still overrides either default", () => {
    const labels = deriveLabels(
      config({ appearance: { diverging: true, orientation: "vertical" } }),
      schema,
    );
    expect(labels.xAxis).toBe("Location");
    expect(labels.yAxis).toBe("On-track score");
  });
});

describe("v3 geography-aware labels", () => {
  const v3Schema = {
    fields: {
      Year: { kind: "temporal", label: "Year" },
      Population: { kind: "measure", label: "Population" },
    },
  };
  const v3 = (geography, labels = {}) => ({
    version: 3,
    question: {
      outcome: { measureId: "Population" },
      geography,
    },
    presentation: { chartType: "line", labels },
  });

  it("tracks the selected place and geographic level", () => {
    expect(
      deriveLabels(v3({ subset: "Counties", locations: ["San Francisco"] }), v3Schema)
        .title,
    ).toBe("Population over time in San Francisco");
    expect(
      deriveLabels(v3({ subset: "Regions", locations: [] }), v3Schema).title,
    ).toBe("Population over time by region");
  });

  it("keeps a typed title while blank labels continue following geography", () => {
    expect(
      effectiveLabels(
        v3({ subset: "Regions", locations: ["Bay Area"] }, { title: "My title" }),
        v3Schema,
      ),
    ).toMatchObject({ title: "My title", xAxis: "Year", yAxis: "Population" });
  });

  it("includes both shared and per-comparison jurisdictions in the title", () => {
    const spec = v3({ subset: "Counties", locations: ["Alameda"] });
    spec.question.comparisons = [
      { id: "cmp_region", geography: { subset: "Regions", locations: ["Bay Area"] } },
      { id: "cmp_county" },
    ];

    expect(deriveLabels(spec, v3Schema).title).toBe(
      "Population over time in Bay Area and Alameda",
    );
  });

  it("uses the geographic level instead of clipping a title with many places", () => {
    const spec = v3({
      subset: "Regions",
      locations: ["Bay Area", "Central Coast", "Far North", "Inland Empire"],
    });

    expect(deriveLabels(spec, v3Schema).title).toBe(
      "Population over time by region",
    );
    spec.presentation.chartType = "bar";
    expect(deriveLabels(spec, v3Schema)).toMatchObject({
      title: "Population by region",
      xAxis: "Location",
      yAxis: "Population",
    });
  });

  // Renderer plan E: the X-Axis and Y-Axis labels name the horizontal and
  // vertical axes, so a horizontal bar puts the measure on X.
  it("puts the measure on the horizontal axis for horizontal bars", () => {
    const spec = v3({ subset: "Regions", locations: ["Bay Area", "Central Coast", "Far North", "Inland Empire"] });
    spec.presentation.chartType = "bar";
    spec.presentation.appearance = { orientation: "horizontal" };
    expect(deriveLabels(spec, v3Schema)).toMatchObject({ xAxis: "Population", yAxis: "Location" });
    spec.presentation.appearance = { diverging: true };
    expect(deriveLabels(spec, v3Schema)).toMatchObject({ xAxis: "Population", yAxis: "Location" });
  });

  // Renderer plan F: a range chart's values run along the horizontal axis.
  it("puts the measure on the horizontal axis for range charts", () => {
    const spec = v3({ subset: "Regions", locations: ["Bay Area", "Central Coast", "Far North", "Inland Empire"] });
    spec.presentation.chartType = "dumbbell";
    expect(deriveLabels(spec, v3Schema)).toMatchObject({ xAxis: "Population", yAxis: "" });
  });

  // Renderer plan G: the dot plot lays out its rows as the range chart does.
  it("puts the measure on the horizontal axis for dot plots", () => {
    const spec = v3({ subset: "Regions", locations: ["Bay Area", "Central Coast", "Far North", "Inland Empire"] });
    spec.presentation.chartType = "dotPlot";
    expect(deriveLabels(spec, v3Schema)).toMatchObject({ xAxis: "Population", yAxis: "" });
  });

  // Renderer plan H (owner review, 2026-10-10): the forest's measure was drawn
  // as a title above its study names, and the value axis had none.
  it("puts the measure on the horizontal axis for forest plots", () => {
    const spec = v3({ subset: "Regions", locations: ["Bay Area"] });
    spec.presentation.chartType = "forest";
    expect(deriveLabels(spec, v3Schema)).toMatchObject({ xAxis: "Population", yAxis: "" });
  });

  // Renderer plan J: a pasted scatter plots its bound x column across.
  it("names a pasted scatter's two measures on their axes", () => {
    const spec = v3({ subset: "Regions", locations: ["Bay Area"] });
    spec.presentation.chartType = "scatter";
    spec.question.outcome = { measureId: "HHI" };
    spec.question.dataset = { kind: "inline", bindings: { x: "LQ_Q5", y: "HHI", unit: "Region" } };
    // Dataset-range plan, workstream 7 (byod-shapes corpus): a pasted scatter
    // with a unit column is titled by that column; the axes name both measures.
    expect(deriveLabels(spec, v3Schema)).toMatchObject({ title: "HHI by Region", xAxis: "LQ_Q5", yAxis: "HHI" });
  });

  // Workstream Q: a module scatter names its horizontal and vertical measures.
  it("names a module scatter's two measures on their axes", () => {
    const schema = {
      fields: {
        ...v3Schema.fields,
        Households: { kind: "measure", label: "Households" },
      },
    };
    const spec = v3({ subset: "Counties", locations: ["Alameda", "Fresno", "Marin", "Napa"] });
    spec.presentation.chartType = "scatter";
    delete spec.question.outcome;
    spec.question.outcomes = [
      { role: "y", measureId: "Population" },
      { role: "x", measureId: "Households" },
    ];
    expect(deriveLabels(spec, schema)).toMatchObject({
      title: "Population vs Households",
      xAxis: "Households",
      yAxis: "Population",
    });
  });

  it("names the time field when bars run along periods", () => {
    const spec = v3({ subset: "Regions", locations: ["Bay Area", "Central Coast", "Far North", "Inland Empire"] });
    spec.presentation.chartType = "bar";
    spec.presentation.appearance = { categoryAxis: "period" };
    expect(deriveLabels(spec, v3Schema).xAxis).not.toBe("Location");
    expect(deriveLabels(spec, v3Schema).yAxis).toBe("Population");
  });
});

import { boundInline as datasetSpec } from "@/tests/fixtures/byod-shapes/helpers";
import { BYOD_SCHEMA as datasetSchema } from "@/lib/visualization/moduleRegistry";
const datasetLabelsTable = {
  columns: [{ name: "Month", type: "date" }, { name: "Nation", type: "text" },
    ...["Chrome", "IE", "Firefox", "Safari", "Edge", "Other"].map(name => ({ name, type: "number", unit: "percent" }))],
  rows: [["2020-01", "Britain", "40", "20", "15", "10", "10", "5"]],
};
describe("dataset range: labels", () => {
  it("titles a pasted line chart from its value and date columns, with no geography wording", () => {
    const labels = deriveLabels(datasetSpec(datasetLabelsTable, "line", { x: "Month", y: "Chrome" }), datasetSchema);
    expect(labels).toMatchObject({ title: "Chrome over time", xAxis: "Month", yAxis: "Chrome" });
    expect(labels.title).not.toMatch(/geography|Britain/);
  });
  it("lists up to three value columns and counts the rest", () => {
    const labels = deriveLabels(datasetSpec(datasetLabelsTable, "line", { x: "Month", y: ["Chrome", "IE", "Firefox", "Safari", "Edge", "Other"] }), datasetSchema);
    expect(labels).toMatchObject({ title: "Chrome, IE, Firefox, and 3 more over time", yAxis: "Percent" });
  });
  it.each([["vertical", "Nation", "Chrome"], ["horizontal", "Chrome", "Nation"]])("names the axes after the mapped columns in either bar orientation: %s", (orientation, xAxis, yAxis) => {
    expect(deriveLabels(datasetSpec(datasetLabelsTable, "bar", { category: "Nation", y: "Chrome" }, { orientation }), datasetSchema)).toMatchObject({ title: "Chrome by Nation", xAxis, yAxis });
  });
  it("uses the table's own title when one was captured", () => {
    const table = { ...datasetLabelsTable, meta: { title: "Browser adoption" } };
    expect(deriveLabels(datasetSpec(table, "line", { x: "Month", y: "Chrome" }), datasetSchema).title).toBe("Browser adoption");
  });
  it("keeps typed labels ahead of captured and derived labels", () => {
    const config = datasetSpec({ ...datasetLabelsTable, meta: { title: "Captured title" } }, "line", { x: "Month", y: "Chrome" });
    config.presentation.labels = { title: "My title", xAxis: "My dates", yAxis: "My values" };
    expect(effectiveLabels(config, datasetSchema)).toMatchObject({ title: "My title", xAxis: "My dates", yAxis: "My values" });
  });
  it("leaves the value-axis label blank for mixed units", () => {
    const table = { ...datasetLabelsTable, columns: datasetLabelsTable.columns.map(c => c.name === "IE" ? { ...c, unit: "usd" } : c) };
    expect(deriveLabels(datasetSpec(table, "line", { x: "Month", y: ["Chrome", "IE"] }), datasetSchema).yAxis).toBe("");
  });
  it("leaves topic labels unchanged", () => {
    const config = { version: 3, question: { dataset: { kind: "module", moduleId: "population" }, outcomes: [{ role: "y", measureId: "Population" }], geography: { subset: "Counties", locations: ["Alameda"] }, comparisons: [] }, presentation: { chartType: "line" } };
    expect(deriveLabels(config, { fields: { Population: { label: "Population" }, Year: { kind: "temporal", label: "Year" } } })).toEqual({ title: "Population over time in Alameda", xAxis: "Year", yAxis: "Population" });
  });
});
