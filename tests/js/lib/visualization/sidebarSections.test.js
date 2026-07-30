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

describe("visibleSectionsFor", () => {
  it("gates keyed sections with the chart descriptor's sidebarSections", () => {
    const line = visibleSectionsFor(config("line"), schema).map((item) => item.value);
    const table = visibleSectionsFor(config("dataTable"), schema).map(
      (item) => item.value,
    );

    expect(line).toEqual(
      expect.arrayContaining(["axis", "transform", "labels", "appearance"]),
    );
    expect(table).not.toContain("axis");
    expect(table).not.toContain("transform");
    expect(table).toEqual(expect.arrayContaining(["labels", "appearance"]));
  });

  it("drops the Transform header for a chart that declares comparison but cannot transform", () => {
    // The Range chart lists "comparison" in its sidebarSections, so the `key`
    // gate alone would keep the header and render an empty block beneath it.
    const range = visibleSectionsFor(config("dumbbell"), schema).map(
      (item) => item.value,
    );
    expect(range).not.toContain("transform");
    // Not a blanket removal: the keyed sections it can express still show.
    expect(range).toEqual(expect.arrayContaining(["axis", "labels", "appearance"]));
  });

  it("drops the Transform header when the bound measure allows a single transform", () => {
    // A choropleth takes no benchmark, so a lone "Actual Value" radio is all
    // that would be left — a heading over one dead control.
    const single = visibleSectionsFor(
      { ...config("choroplethMap"), bindings: { color: "Value" } },
      schema,
    ).map((item) => item.value);
    expect(single).not.toContain("transform");

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
    expect(many).toContain("transform");
  });

  it("keeps Transform for a stratified module even on a chart with no comparison", () => {
    // The pins are a statement about rows, so they outlive the chart type. A
    // data table declares no "comparison" at all and still needs them.
    const stratified = {
      ...schema,
      filterDimensions: [
        { column: "Tenure", label: "Tenure", values: ["Owner", "Renter"], default: "Total" },
      ],
    };
    expect(
      visibleSectionsFor(config("dataTable"), stratified).map((item) => item.value),
    ).toContain("transform");
  });

  it("shows Transform on the wizard's Edit step for a multi-period imported table", () => {
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
    ).toContain("transform");
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

  it("applies only and exclude without changing registry order", () => {
    const registryOrder = SIDEBAR_SECTIONS.map((item) => item.value);
    const requested = ["appearance", "datasets", "axis", "chart-type"];
    const only = visibleSectionsFor(config(), schema, { only: requested }).map(
      (item) => item.value,
    );
    const excluded = visibleSectionsFor(config(), schema, {
      exclude: ["chart-type", "datasets"],
    }).map((item) => item.value);

    expect(only).toEqual(registryOrder.filter((value) => requested.includes(value)));
    expect(excluded).toEqual(
      registryOrder.filter((value) => !["chart-type", "datasets"].includes(value)),
    );
  });
});
