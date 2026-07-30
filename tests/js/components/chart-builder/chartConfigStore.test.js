/**
 * Tests for components/chart-builder/chartConfigStore.js — spec-v2 config
 * construction and the new v2 reducer actions. `reduceChartConfig` and
 * `createChartConfig` are pure, so no React rendering is needed.
 */

import { describe, expect, it } from "vitest";

import {
  createChartConfig,
  reduceChartConfig,
} from "@/components/chart-builder/chartConfigStore";
import { SPEC_VERSION } from "@/lib/visualization/chartSpec";
import { BYOD_SCHEMA } from "@/lib/visualization/moduleRegistry";

const schema = {
  id: "testmodule",
  label: "Test Module",
  sources: null,
  subsets: { Counties: ["County"], Regions: ["Region"] },
  filterDimensions: [],
  fields: {
    Year: { kind: "temporal" },
    Location: { kind: "dimension" },
    Region: { kind: "dimension" },
    "Total Widgets": {
      kind: "measure",
      unit: "count",
      comparisonGroup: "widgets",
      transforms: ["actual", "indexed", "percentChange"],
      chartRoles: ["yMeasure", "xMeasure", "size", "color"],
      curated: true,
    },
    "Spare Widgets": {
      kind: "measure",
      unit: "count",
      comparisonGroup: "widgets",
      transforms: ["actual"],
      chartRoles: ["yMeasure"],
    },
  },
};

const dispatch = (config, action) => reduceChartConfig(config, action, schema);

describe("createChartConfig", () => {
  it("builds a spec-v2 config with the new containers", () => {
    const config = createChartConfig(schema);
    expect(config.version).toBe(SPEC_VERSION);
    expect(config.data).toEqual({ source: "module" });
    expect(config.format).toEqual({});
    expect(config.annotations).toEqual([]);
    expect(config).not.toHaveProperty("tier");
    expect(config.filters).toMatchObject({
      locations: [],
      tabColumn: null,
      tabValue: null,
      tabOrder: [],
    });
    expect(config.validation).toEqual([]);
  });

  it("accepts a legacy v1 wire shape (filters-smuggled keys)", () => {
    const config = createChartConfig(schema, {
      version: 1,
      preset: "trend-over-time",
      filters: { subset: "Regions", transform: "indexed", chartType: "line" },
    });
    expect(config.transform).toBe("indexed");
    expect(config.filters.subset).toBe("Regions");
    expect(config.filters.transform).toBeUndefined();
  });

  it("defaults to trend-over-time when the schema declares no defaultPreset", () => {
    const config = createChartConfig(schema);
    expect(config.preset).toBe("trend-over-time");
    expect(config.chartType).toBe("line");
  });

  it("honors a schema-declared defaultPreset (snapshot-only ranking module)", () => {
    const config = createChartConfig({ ...schema, defaultPreset: "compare-places" });
    expect(config.preset).toBe("compare-places");
    expect(config.chartType).toBe("bar");
    // An explicit initial preset still wins over the schema default.
    const explicit = createChartConfig(
      { ...schema, defaultPreset: "compare-places" },
      { preset: "trend-over-time" },
    );
    expect(explicit.preset).toBe("trend-over-time");
  });
});

/**
 * The module workbench's manual-encoding rule: the store chooses no field on the
 * reader's behalf, so a chart is only ever as configured as they made it.
 */
describe("manual encoding (autoBind: false)", () => {
  const manual = { autoBind: false };
  const manualDispatch = (config, action) =>
    reduceChartConfig(config, action, schema, manual);

  it("opens with its implied roles resolved and nothing else", () => {
    // Default preset is trend-over-time (line): x is implied from the sole
    // temporal field, y is a real choice and stays unset.
    const config = createChartConfig(schema, {}, manual);
    expect(config.bindings).toEqual({ x: "Year" });
    // Unset roles are reported as findings — the surface decides how to show
    // them — but they are the "incomplete" kind, not a broken configuration.
    expect(config.validation.map((finding) => finding.code)).toContain(
      "MISSING_REQUIRED_ROLE",
    );
  });

  it("a workbench bar opens with its category resolved", () => {
    const config = createChartConfig(
      { ...schema, defaultPreset: "compare-places" },
      {},
      manual,
    );
    expect(config.chartType).toBe("bar");
    expect(config.bindings).toEqual({ category: "Location" });
  });

  it("still honors bindings a saved view or deep link supplies", () => {
    const config = createChartConfig(
      schema,
      { chartType: "line", bindings: { x: "Year", y: "Total Widgets" } },
      manual,
    );
    expect(config.bindings).toMatchObject({ x: "Year", y: "Total Widgets" });
    expect(
      config.validation.some((finding) => finding.code === "MISSING_REQUIRED_ROLE"),
    ).toBe(false);
  });

  it("a stored view overrides an implied role", () => {
    const config = createChartConfig(
      { ...schema, defaultPreset: "compare-places" },
      { bindings: { category: "Region" } },
      manual,
    );
    expect(config.bindings.category).toBe("Region");
  });

  it("SET_CHART_TYPE carries compatible choices and resolves the implied category", () => {
    const line = createChartConfig(
      schema,
      { chartType: "line", bindings: { x: "Year", y: "Total Widgets" } },
      manual,
    );
    const bar = manualDispatch(line, { type: "SET_CHART_TYPE", chartType: "bar" });

    // y is a measure on both, so the reader's own choice follows them across.
    expect(bar.bindings.y).toBe("Total Widgets");
    // A bar has no x role, so it falls away rather than following across.
    expect(bar.bindings.x).toBeUndefined();
    // Category is implied (geography), not carried or reader-chosen, so both
    // required roles are now answered and nothing is left MISSING_REQUIRED_ROLE.
    expect(bar.bindings.category).toBe("Location");
    expect(
      bar.validation.filter((finding) => finding.code === "MISSING_REQUIRED_ROLE"),
    ).toHaveLength(0);
  });

  it("a line-to-bar switch swaps implied roles", () => {
    const line = createChartConfig(schema, { chartType: "line" }, manual);
    expect(line.bindings).toEqual({ x: "Year" });
    const bar = manualDispatch(line, { type: "SET_CHART_TYPE", chartType: "bar" });
    expect(bar.bindings.category).toBe("Location");
    expect(bar.bindings.x).toBeUndefined();
  });

  it("leaves the auto-binding surfaces seeding defaults as before", () => {
    const line = createChartConfig(schema, { chartType: "line" });
    expect(line.bindings).toMatchObject({ x: "Year", y: "Total Widgets" });
    const bar = dispatch(line, { type: "SET_CHART_TYPE", chartType: "bar" });
    expect(bar.bindings).toMatchObject({ category: "Location", y: "Total Widgets" });
  });
});

describe("reduceChartConfig — v2 actions", () => {
  const base = createChartConfig(schema);

  it("SET_DATA_SOURCE switches to inline and back, clearing the table", () => {
    const inline = { columns: [{ name: "a", type: "number" }], rows: [[1]] };
    const withInline = dispatch(base, { type: "SET_DATA_SOURCE", source: "inline", inline });
    expect(withInline.data).toEqual({ source: "inline", inline });
    const backToModule = dispatch(withInline, { type: "SET_DATA_SOURCE", source: "module" });
    expect(backToModule.data).toEqual({ source: "module" });
  });

  describe("imported-data index-to-100", () => {
    // A line chart's x role accepts only a temporal column, so the year column is
    // typed as Date — what inlineRenderBlock's "set its column type to Date"
    // suggestion produces for a pasted trend table.
    const trend = {
      columns: [
        { name: "County", type: "text" },
        { name: "Year", type: "date" },
        { name: "Population", type: "number" },
      ],
      rows: [
        ["Fresno", "2020", "100"],
        ["Fresno", "2021", "110"],
        ["Kern", "2020", "90"],
        ["Kern", "2021", "95"],
      ],
    };
    const byodDispatch = (config, action) => reduceChartConfig(config, action, BYOD_SCHEMA);
    const imported = () =>
      byodDispatch(createChartConfig(BYOD_SCHEMA), {
        type: "SET_DATA_SOURCE",
        source: "inline",
        inline: trend,
        defaultChart: true,
      });

    it("keeps the transform and raises no base-period warning on a time-axis chart", () => {
      const indexed = byodDispatch(imported(), { type: "SET_TRANSFORM", transform: "indexed" });
      expect(indexed.chartType).toBe("line");
      expect(indexed.bindings).toMatchObject({ x: "Year", y: "Population" });
      expect(indexed.transform).toBe("indexed");
      const withBase = byodDispatch(indexed, {
        type: "SET_PERIOD",
        key: "baseYear",
        value: 2021,
      });
      expect(withBase.transform).toBe("indexed");
      // The year slider's window is a module concept; an inline chart plots every
      // row it was given, so 2021 is not "outside" anything.
      expect(withBase.validation.some((f) => f.code === "BASE_YEAR_OUT_OF_RANGE")).toBe(false);
    });

    it("drops the transform when the new chart type cannot express it", () => {
      const indexed = byodDispatch(imported(), { type: "SET_TRANSFORM", transform: "indexed" });
      const bar = byodDispatch(indexed, { type: "SET_CHART_TYPE", chartType: "bar" });
      // Bar has no time axis inline, so an indexed bar would silently draw raw
      // values — the config must not claim a view the renderer ignores.
      expect(bar.transform).toBe("actual");
    });

    it("drops the transform when a re-import leaves a single period", () => {
      const indexed = byodDispatch(imported(), { type: "SET_TRANSFORM", transform: "indexed" });
      const reimported = byodDispatch(indexed, {
        type: "SET_DATA_SOURCE",
        source: "inline",
        inline: { ...trend, rows: [["Fresno", "2020", "100"], ["Kern", "2020", "90"]] },
      });
      expect(reimported.transform).toBe("actual");
    });

    it("leaves a module's stranded transform alone, notice and all", () => {
      // Modules surface TRANSFORM_NOT_ALLOWED instead; rewriting the config would
      // hide the notice that explains the field catalog.
      const line = createChartConfig(schema, { chartType: "line", transform: "percentChange" });
      const spare = dispatch(line, {
        type: "SET_BINDING",
        role: "y",
        field: "Spare Widgets",
      });
      expect(spare.transform).toBe("actual");
      const stranded = dispatch(
        { ...line, bindings: { ...line.bindings, y: "Spare Widgets" } },
        { type: "SET_TRANSFORM", transform: "percentChange" },
      );
      expect(stranded.transform).toBe("percentChange");
      expect(stranded.validation.some((f) => f.code === "TRANSFORM_NOT_ALLOWED")).toBe(true);
    });
  });

  it("keeps required Dot plot mappings valid across pay-gap chart switches", () => {
    const payGap = {
      columns: [
        { name: "Label", type: "text" },
        { name: "Group", type: "text" },
        { name: "Total", type: "number" },
        { name: "Men", type: "number" },
        { name: "Women", type: "number" },
      ],
      rows: [
        ["Graduate degree", "Education", "87", "102", "75"],
        ["Dentists", "Occupation", "152", "170", "140"],
      ],
    };
    const byodDispatch = (config, action) =>
      reduceChartConfig(config, action, BYOD_SCHEMA);
    const imported = byodDispatch(createChartConfig(BYOD_SCHEMA), {
      type: "SET_DATA_SOURCE",
      source: "inline",
      inline: payGap,
      defaultChart: true,
    });
    expect(imported.chartType).toBe("dumbbell");
    expect(imported.bindings).toMatchObject({
      category: "Label",
      group: "Group",
      start: "Women",
      end: "Men",
      point: "Total",
    });

    const dot = byodDispatch(imported, {
      type: "SET_CHART_TYPE",
      chartType: "dotPlot",
    });
    expect(dot.bindings).toMatchObject({ y: "Label", x: "Group", color: "Total" });
    expect(dot.bindings.group).toBeUndefined();
    expect(dot.validation.some((finding) => finding.code === "MISSING_REQUIRED_ROLE"))
      .toBe(false);

    const range = byodDispatch(dot, {
      type: "SET_CHART_TYPE",
      chartType: "dumbbell",
    });
    const dotAgain = byodDispatch(range, {
      type: "SET_CHART_TYPE",
      chartType: "dotPlot",
    });
    expect(dotAgain.bindings).toMatchObject({
      y: "Label",
      x: "Group",
      color: "Total",
    });
    expect(dotAgain.validation.some((finding) => finding.code === "MISSING_REQUIRED_ROLE"))
      .toBe(false);
  });

  it("resets the active GraphTab on column and data changes", () => {
    const inline = {
      columns: [
        { name: "Region", type: "text" },
        { name: "Value", type: "number" },
      ],
      rows: [
        ["North", "1"],
        ["South", "2"],
      ],
    };
    const withInline = dispatch(base, {
      type: "SET_DATA_SOURCE",
      source: "inline",
      inline,
    });
    const tabbed = dispatch(withInline, {
      type: "SET_FILTER",
      key: "tabColumn",
      value: "Region",
    });
    expect(tabbed.filters).toMatchObject({
      tabColumn: "Region",
      tabValue: "North",
      tabOrder: ["North", "South"],
    });

    const south = dispatch(tabbed, {
      type: "SET_FILTER",
      key: "tabValue",
      value: "South",
    });
    const changed = dispatch(south, {
      type: "SET_DATA_SOURCE",
      source: "inline",
      inline: { ...inline, rows: [["North", "1"]] },
    });
    expect(changed.filters.tabValue).toBe("North");

    const removedColumn = dispatch(changed, {
      type: "SET_DATA_SOURCE",
      source: "inline",
      inline: {
        columns: [{ name: "Value", type: "number" }],
        rows: [["1"]],
      },
    });
    expect(removedColumn.filters).toMatchObject({
      tabColumn: null,
      tabValue: null,
      tabOrder: [],
    });
  });

  it("preserves module tabs and seeds their values from the field catalog", () => {
    const moduleSchema = {
      ...schema,
      fields: {
        ...schema.fields,
        Region: {
          kind: "dimension",
          label: "Region",
          values: ["Bay Area", "Central Valley"],
        },
      },
    };
    const moduleDispatch = (config, action) =>
      reduceChartConfig(config, action, moduleSchema);
    const baseModule = createChartConfig(moduleSchema);
    const tabbed = moduleDispatch(baseModule, {
      type: "SET_FILTER",
      key: "tabColumn",
      value: "Region",
    });

    expect(tabbed.data.source).toBe("module");
    expect(tabbed.filters).toMatchObject({
      tabColumn: "Region",
      tabValue: "Bay Area",
      tabOrder: ["Bay Area", "Central Valley"],
    });

    const restored = createChartConfig(moduleSchema, tabbed);
    expect(restored.filters.tabColumn).toBe("Region");
    expect(restored.filters.tabValue).toBe("Bay Area");
  });

  it("persists an advanced custom tab order", () => {
    const inline = {
      columns: [{ name: "Region", type: "text" }],
      rows: [["North"], ["South"], ["Central"]],
    };
    const withInline = dispatch(base, {
      type: "SET_DATA_SOURCE",
      source: "inline",
      inline,
    });
    const tabbed = dispatch(withInline, {
      type: "SET_FILTER",
      key: "tabColumn",
      value: "Region",
    });
    const reordered = dispatch(tabbed, {
      type: "SET_FILTER",
      key: "tabOrder",
      value: ["South", "Central", "North"],
    });
    expect(reordered.filters.tabOrder).toEqual(["South", "Central", "North"]);
  });

  it("SET_FORMAT sets and clears one field's override", () => {
    const withFormat = dispatch(base, {
      type: "SET_FORMAT",
      field: "Total Widgets",
      format: { decimals: 1, suffix: " widgets" },
    });
    expect(withFormat.format["Total Widgets"]).toEqual({ decimals: 1, suffix: " widgets" });
    const cleared = dispatch(withFormat, { type: "SET_FORMAT", field: "Total Widgets", format: null });
    expect(cleared.format["Total Widgets"]).toBeUndefined();
  });

  it("SET_PALETTE and SET_SERIES_COLOR write appearance color state", () => {
    const withPalette = dispatch(base, { type: "SET_PALETTE", palette: "ui-kit-blue" });
    expect(withPalette.appearance.palette).toBe("ui-kit-blue");
    const withOverride = dispatch(withPalette, {
      type: "SET_SERIES_COLOR",
      seriesName: "California",
      token: "orange3",
    });
    expect(withOverride.appearance.seriesColors).toEqual({ California: "orange3" });
    const cleared = dispatch(withOverride, {
      type: "SET_SERIES_COLOR",
      seriesName: "California",
      token: null,
    });
    expect(cleared.appearance.seriesColors).toEqual({});
  });

  it("SET_SERIES_VISIBILITY toggles hiddenSeries membership", () => {
    const hidden = dispatch(base, {
      type: "SET_SERIES_VISIBILITY",
      seriesName: "California",
      hidden: true,
    });
    expect(hidden.appearance.hiddenSeries).toEqual(["California"]);
    const shown = dispatch(hidden, {
      type: "SET_SERIES_VISIBILITY",
      seriesName: "California",
      hidden: false,
    });
    expect(shown.appearance.hiddenSeries).toEqual([]);
  });

  it("ADD_ANNOTATION / REMOVE_ANNOTATION manage the annotations array", () => {
    const note = { id: "a1", type: "text", text: "Recession", x: 2008 };
    const withNote = dispatch(base, { type: "ADD_ANNOTATION", annotation: note });
    expect(withNote.annotations).toEqual([note]);
    const removed = dispatch(withNote, { type: "REMOVE_ANNOTATION", id: "a1" });
    expect(removed.annotations).toEqual([]);
  });

  it("ignores legacy SET_TIER actions", () => {
    const unchanged = dispatch(base, { type: "SET_TIER", tier: "advanced" });
    expect(unchanged).toBe(base);
    expect(unchanged).not.toHaveProperty("tier");
  });

  it("SET_RANKING applies Top/Bottom N and resets stale category customization", () => {
    const defaultBar = dispatch(base, { type: "SET_CHART_TYPE", chartType: "bar" });
    const bar = {
      ...defaultBar,
      appearance: {
        ...defaultBar.appearance,
        categoryOrder: ["Old value"],
        hiddenCategories: ["Old value"],
      },
    };
    const ranked = dispatch(bar, {
      type: "SET_RANKING",
      topN: 5,
      sort: "ascending",
    });
    expect(ranked.filters.topN).toBe(5);
    expect(ranked.appearance.sort).toBe("ascending");
    expect(ranked.appearance.categoryOrder).toEqual([]);
    expect(ranked.appearance.hiddenCategories).toEqual([]);
  });

  it("LOAD_SPEC applies a parsed spec as-is, keeping loaded metadata, and revalidates", () => {
    const withCount = dispatch(base, {
      type: "SET_SERIES_COUNT",
      count: 4,
      categoryNames: ["Alameda", "Butte"],
    });
    const draft = { ...withCount, labels: { ...withCount.labels, title: "From code" } };
    const applied = dispatch(withCount, { type: "LOAD_SPEC", spec: draft });
    expect(applied.labels.title).toBe("From code");
    expect(applied.seriesCount).toBe(4);
    expect(applied.categoryNames).toEqual(["Alameda", "Butte"]);
    expect(applied.validation).toEqual([]);
  });

  it("LOAD_SPEC does not re-seed bindings from the preset (the code is the truth)", () => {
    const draft = {
      ...base,
      bindings: { ...base.bindings, y: "Spare Widgets" },
    };
    const applied = dispatch(base, { type: "LOAD_SPEC", spec: draft });
    expect(applied.bindings.y).toBe("Spare Widgets");
  });

  it("SET_SERIES_COUNT stores loaded metadata alongside the count", () => {
    const withData = dispatch(base, {
      type: "SET_SERIES_COUNT",
      count: 2,
      geoUnmatched: ["Alpine"],
      seriesNames: ["Alameda", "Butte"],
      categoryNames: ["Fresno", "Kern"],
    });
    expect(withData.seriesCount).toBe(2);
    expect(withData.geoUnmatched).toEqual(["Alpine"]);
    expect(withData.seriesNames).toEqual(["Alameda", "Butte"]);
    expect(withData.categoryNames).toEqual(["Fresno", "Kern"]);
  });

  it("SET_SERIES_COUNT synchronizes dynamically loaded module tab values", () => {
    const tabbed = dispatch(base, {
      type: "SET_FILTER",
      key: "tabColumn",
      value: "Location",
    });
    const withTabs = dispatch(tabbed, {
      type: "SET_SERIES_COUNT",
      count: 2,
      tabOptions: ["North", "South"],
      tabValue: "South",
    });

    expect(withTabs.tabOptions).toEqual(["North", "South"]);
    expect(withTabs.filters).toMatchObject({
      tabValue: "South",
      tabOrder: ["North", "South"],
    });
  });

  it("SET_SERIES_COUNT revalidation surfaces a GEO_JOIN_UNMATCHED warning", () => {
    const withData = dispatch(base, {
      type: "SET_SERIES_COUNT",
      count: 2,
      geoUnmatched: ["Alpine"],
    });
    expect(withData.validation.some((f) => f.code === "GEO_JOIN_UNMATCHED")).toBe(true);
  });

  it("SET_SERIES_COUNT no-ops only when both count and geoUnmatched are unchanged", () => {
    const withData = dispatch(base, {
      type: "SET_SERIES_COUNT",
      count: 2,
      geoUnmatched: ["Alpine"],
    });
    const sameAgain = dispatch(withData, {
      type: "SET_SERIES_COUNT",
      count: 2,
      geoUnmatched: ["Alpine"],
    });
    expect(sameAgain).toBe(withData);

    const changedGeo = dispatch(withData, {
      type: "SET_SERIES_COUNT",
      count: 2,
      geoUnmatched: ["Alpine", "Sierra"],
    });
    expect(changedGeo).not.toBe(withData);
    expect(changedGeo.geoUnmatched).toEqual(["Alpine", "Sierra"]);
  });
});
