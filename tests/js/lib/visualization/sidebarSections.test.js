/**
 * Acceptance contract for the workbench section registry (overhaul phase 0).
 *
 * These imports intentionally point at the post-overhaul module. Until phase 0
 * lands this suite is expected to be red.
 */

import { describe, expect, it } from "vitest";

import {
  SIDEBAR_SECTIONS,
  visibleSectionsFor,
} from "@/lib/visualization/sidebarSections";

const schema = {
  id: "widgets",
  sources: ["DoF", "Census"],
  subsets: { Counties: ["County"] },
  yearRange: [2000, 2025],
  fields: {
    Year: { kind: "temporal" },
    Location: { kind: "dimension" },
    Value: { kind: "measure" },
  },
};

function config(chartType = "line") {
  return { chartType, filters: { subset: "Counties", locations: [] } };
}

/**
 * Every section a line chart shows on the fixture schema above, hand-written in
 * registry order. Transform is not a section value: its controls are composed
 * inside Outcome when the current measure offers them.
 */
const LINE_SECTIONS = [
  "datasets",
  "chart-type",
  "axis",
  "date-range",
  "geography",
  "labels",
  "appearance",
  "typography",
];

describe("visibleSectionsFor", () => {
  it("gates keyed sections with the chart descriptor's sidebarSections", () => {
    const line = visibleSectionsFor(config("line"), schema).map((item) => item.value);
    const table = visibleSectionsFor(config("dataTable"), schema).map(
      (item) => item.value,
    );

    expect(line).toEqual(expect.arrayContaining(["axis", "labels", "appearance"]));
    expect(table).not.toContain("axis");
    expect(table).toEqual(expect.arrayContaining(["labels", "appearance"]));
  });

  it("has no standalone Transform section for a chart that cannot transform", () => {
    const range = visibleSectionsFor(config("dumbbell"), schema).map(
      (item) => item.value,
    );
    expect(range).not.toContain("transform");
    // Not a blanket removal: the keyed sections it can express still show.
    expect(range).toEqual(expect.arrayContaining(["axis", "labels", "appearance"]));
  });

  it("keeps transform choices inside Outcome rather than adding a section", () => {
    const single = visibleSectionsFor(
      { ...config("choroplethMap"), bindings: { color: "Value" } },
      schema,
    ).map((item) => item.value);
    expect(single).not.toContain("transform");

    const line = visibleSectionsFor(
      { ...config("line"), bindings: { x: "Year", y: "Value" } },
      schema,
    ).map((item) => item.value);
    expect(line).not.toContain("transform");

    const many = visibleSectionsFor(
      { ...config("choroplethMap"), bindings: { color: "Value" } },
      {
        ...schema,
        fields: {
          ...schema.fields,
          Value: {
            kind: "measure",
            transforms: ["actual", "indexed", "percentChange"],
          },
        },
      },
    ).map((item) => item.value);
    expect(many).toContain("axis");
    expect(many).not.toContain("transform");
  });

  it("keeps Outcome for inherited stratification controls on a data table", () => {
    // The pins are a statement about rows, so they outlive the chart type. A
    // data table declares no encodings and still needs them inside Outcome.
    const stratified = {
      ...schema,
      filterDimensions: [
        { column: "Tenure", label: "Tenure", values: ["Owner", "Renter"], default: "Total" },
      ],
    };
    expect(
      visibleSectionsFor(config("dataTable"), stratified).map((item) => item.value),
    ).toContain("axis");
    expect(
      visibleSectionsFor(config("dataTable"), stratified).map((item) => item.value),
    ).not.toContain("transform");
  });

  it("inherits imported-data transforms into Outcome on the wizard's Edit step", () => {
    // The Edit step's own filter, so this is the list the standalone tool renders.
    const editStep = { exclude: ["chart-type"] };
    const byod = { id: "byod", inlineOnly: true, fields: {}, yearRange: [1990, 2026] };
    const inline = {
      columns: [
        { name: "County", type: "text" },
        { name: "Year", type: "date" },
        { name: "Population", type: "number" },
      ],
      rows: [
        ["Fresno", "2020", "100"],
        ["Fresno", "2021", "110"],
      ],
    };
    const imported = (overrides = {}) => ({
      chartType: "line",
      bindings: { x: "Year", y: "Population", series: "County" },
      data: { source: "inline", inline },
      filters: {},
      ...overrides,
    });

    expect(
      visibleSectionsFor(imported(), byod, editStep).map((item) => item.value),
    ).toContain("axis");
    expect(
      visibleSectionsFor(imported(), byod, editStep).map((item) => item.value),
    ).not.toContain("transform");
    // A bar tags every inline row with one implied period: nothing to index against.
    expect(
      visibleSectionsFor(
        imported({ chartType: "bar", bindings: { category: "County", y: "Population" } }),
        byod,
        editStep,
      ).map((item) => item.value),
    ).not.toContain("transform");
  });

  it("shows Date Range only when the schema has temporal data", () => {
    expect(
      visibleSectionsFor(config(), schema).map((item) => item.value),
    ).toContain("date-range");

    const atemporal = {
      ...schema,
      yearRange: undefined,
      fields: { Location: { kind: "dimension" }, Value: { kind: "measure" } },
    };
    expect(
      visibleSectionsFor(config(), atemporal).map((item) => item.value),
    ).not.toContain("date-range");
  });

  it("shows v3 Comparisons only for modules with comparison dimensions", () => {
    const v3 = {
      version: 3,
      presentation: { chartType: "line" },
      question: { comparisons: [] },
    };
    const demographic = {
      ...schema,
      comparisonDimensions: [{ id: "Race/Ethnicity" }],
    };
    const locationSeries = { ...schema, comparisonDimensions: [] };

    expect(
      visibleSectionsFor(v3, demographic).map((item) => item.value),
    ).toContain("comparisons");
    expect(
      visibleSectionsFor(v3, locationSeries).map((item) => item.value),
    ).not.toContain("comparisons");
  });

  it("applies only and exclude without changing registry order", () => {
    // The registry's declared order, asserted against the hand-written list so a
    // reordering of either shows up here rather than cancelling out.
    const registryOrder = SIDEBAR_SECTIONS.map((item) => item.value);
    expect(registryOrder.filter((value) => LINE_SECTIONS.includes(value))).toEqual(
      LINE_SECTIONS,
    );

    const requested = ["appearance", "datasets", "axis", "chart-type"];
    const only = visibleSectionsFor(config(), schema, { only: requested }).map(
      (item) => item.value,
    );
    const excluded = visibleSectionsFor(config(), schema, {
      exclude: ["chart-type", "datasets"],
    }).map((item) => item.value);

    // Requested out of order on purpose: the result is registry order regardless.
    expect(only).toEqual(LINE_SECTIONS.filter((value) => requested.includes(value)));
    expect(excluded).toEqual(
      LINE_SECTIONS.filter((value) => !["chart-type", "datasets"].includes(value)),
    );
  });
});
