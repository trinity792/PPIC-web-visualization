/**
 * Tests for components/chart-builder/chartData.js — the pure, fetch-free
 * pieces: change-transform record shaping and derived series names. (The
 * fetch-driven loaders are exercised indirectly through ModuleEditor and are
 * not re-tested here per the setup.js network safety net.)
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  categoryNamesOf,
  changeRecords,
  isChangeTransform,
  loadChartData,
  rankChartRecords,
  rankLineSeries,
  rankMatrixRows,
  seriesNamesOf,
} from "@/components/chart-builder/chartData";

describe("isChangeTransform", () => {
  it("is true for the three change-family transforms", () => {
    expect(isChangeTransform("numericChange")).toBe(true);
    expect(isChangeTransform("percentChange")).toBe(true);
    expect(isChangeTransform("percentagePointChange")).toBe(true);
  });

  it("is false for actual/indexed and anything else", () => {
    expect(isChangeTransform("actual")).toBe(false);
    expect(isChangeTransform("indexed")).toBe(false);
    expect(isChangeTransform(undefined)).toBe(false);
  });
});

describe("changeRecords", () => {
  const records = [
    { location: "Alameda", category: "Alameda", start: 100, end: 130 },
    { location: "Butte", category: "Butte", start: 50, end: 25 },
    { location: "Colusa", category: "Colusa", start: 0, end: 10 },
    { location: "Del Norte", category: "Del Norte", start: null, end: 5 },
  ];

  it("computes a plain difference for numericChange", () => {
    const out = changeRecords(records, "numericChange");
    expect(out.map((r) => r.value)).toEqual([30, -25, 10, null]);
  });

  it("computes percent change, with null on a zero or missing start", () => {
    const out = changeRecords(records, "percentChange");
    expect(out.map((r) => r.value)).toEqual([30, -50, null, null]);
  });

  it("computes a plain difference for percentagePointChange", () => {
    const out = changeRecords(records, "percentagePointChange");
    expect(out.map((r) => r.value)).toEqual([30, -25, 10, null]);
  });

  it("drops start/end and keeps every other field", () => {
    const out = changeRecords(records, "numericChange");
    expect(out[0]).toEqual({ location: "Alameda", category: "Alameda", value: 30 });
    expect(out[0].start).toBeUndefined();
    expect(out[0].end).toBeUndefined();
  });
});

describe("rankLineSeries", () => {
  const series = [
    { location: "Alpha", values: [10, 30] },
    { location: "Bravo", values: [20, 10] },
    { location: "Charlie", values: [5, null, 20] },
  ];

  it("returns the Top N series by latest visible value", () => {
    expect(
      rankLineSeries(series, { topN: 2, sort: "value" }).map(
        (item) => item.location,
      ),
    ).toEqual(["Alpha", "Charlie"]);
  });

  it("returns the Bottom N series by latest visible value", () => {
    expect(
      rankLineSeries(series, { topN: 2, sort: "ascending" }).map(
        (item) => item.location,
      ),
    ).toEqual(["Bravo", "Charlie"]);
  });
});

describe("ranking across applicable chart shapes", () => {
  it("ranks range and forest records by their displayed endpoint/estimate", () => {
    const records = [
      { category: "Alpha", end: 20, point: 5 },
      { category: "Bravo", end: 10, point: 30 },
      { category: "Charlie", end: 40, point: 15 },
    ];

    expect(
      rankChartRecords("dumbbell", records, { topN: 2 }).map((row) => row.category),
    ).toEqual(["Charlie", "Alpha"]);
    expect(
      rankChartRecords("forest", records, { topN: 2 }).map((row) => row.category),
    ).toEqual(["Bravo", "Charlie"]);

    const intervalsOnly = [
      { category: "Wide high", start: 0, end: 100 },
      { category: "Narrow high", start: 40, end: 50 },
    ];
    expect(rankChartRecords("forest", intervalsOnly, { topN: 1 })[0].category).toBe(
      "Wide high",
    );
  });

  it("ranks scatter/bubble records by y and supports Bottom N", () => {
    const records = [
      { location: "Alpha", y: 20 },
      { location: "Bravo", y: 5 },
      { location: "Charlie", y: 10 },
    ];
    expect(
      rankChartRecords("scatter", records, { topN: 2, sort: "ascending" }).map(
        (row) => row.location,
      ),
    ).toEqual(["Bravo", "Charlie"]);
  });

  it("ranks matrix rows by their latest non-missing value", () => {
    const matrix = {
      x: [2024, 2025],
      y: ["Alpha", "Bravo", "Charlie"],
      z: [[10, 30], [20, 5], [15, null]],
    };
    expect(rankMatrixRows(matrix, { topN: 2 })).toEqual({
      x: [2024, 2025],
      y: ["Alpha", "Charlie"],
      z: [[10, 30], [15, null]],
    });
  });

  it("keeps first-seen group blocks while sorting values inside each block", () => {
    const records = [
      { category: "Education low", group: "Education", value: 10 },
      { category: "Education high", group: "Education", value: 30 },
      { category: "Occupation low", group: "Occupation", value: 20 },
      { category: "Occupation high", group: "Occupation", value: 40 },
    ];
    expect(
      rankChartRecords("bar", records, { topN: null }).map((row) => row.category),
    ).toEqual([
      "Education high",
      "Education low",
      "Occupation high",
      "Occupation low",
    ]);

    const matrix = {
      x: [2025],
      y: records.map((row) => row.category),
      z: records.map((row) => [row.value]),
      groups: records.map((row) => row.group),
    };
    expect(rankMatrixRows(matrix, { topN: null })).toMatchObject({
      y: [
        "Education high",
        "Education low",
        "Occupation high",
        "Occupation low",
      ],
      groups: ["Education", "Education", "Occupation", "Occupation"],
    });
  });
});

describe("loadChartData — inline ('your data') source", () => {
  it("shapes via toSeries.buildShapes with no fetch, in the standard envelope", async () => {
    const config = {
      chartType: "bar",
      bindings: { category: "County", y: "Population" },
      filters: {},
      appearance: {},
      data: {
        source: "inline",
        inline: {
          columns: [
            { name: "County", type: "text" },
            { name: "Population", type: "number" },
          ],
          rows: [
            ["Fresno", "100"],
            ["Kern", "90"],
          ],
          issues: [],
        },
      },
    };

    // No schema/signal needed for the inline path, and setup.js's fetch stub
    // throws on any real network call — this only passes if nothing fetches.
    const result = await loadChartData(config, {});
    expect(result.geometry).toBeNull();
    expect(result.unmatched).toEqual([]);
    expect(result.series).toHaveLength(2);
    expect(result.series[0]).toMatchObject({ location: "Fresno", value: 100 });
  });
});

describe("loadChartData — module grouping and tabs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const schema = {
    id: "module-test",
    apiPath: "/api/module-test",
    subsets: { Counties: ["County"] },
    filterDimensions: [],
    fields: {
      Location: { kind: "dimension", label: "Location", cardinality: "high" },
      Region: { kind: "dimension", label: "Region" },
      Status: {
        kind: "dimension",
        label: "Status",
        values: ["On Track", "Behind"],
      },
      Metric: { kind: "measure", label: "Metric" },
    },
  };

  const config = {
    chartType: "bar",
    data: { source: "module" },
    bindings: { category: "Location", y: "Metric", group: "Region" },
    period: { year: 2025 },
    filters: {
      subset: "Counties",
      tabColumn: "Status",
      tabValue: "On Track",
      tabOrder: ["On Track", "Behind"],
      topN: 20,
    },
    layers: [],
    appearance: { sort: "value" },
    transform: "actual",
  };

  it("filters a module request to the active tab and attaches group metadata", async () => {
    const fetchMock = vi.fn(async (url) => {
      const params = new URL(url, "https://example.test").searchParams;
      if (params.get("view") === "table") {
        return {
          ok: true,
          json: async () => ({
            records: [
              { Location: "Alpha", Region: "North", Status: "On Track" },
              { Location: "Bravo", Region: "North", Status: "Behind" },
              { Location: "Charlie", Region: "South", Status: "On Track" },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          records: [
            { location: "Charlie", category: "Charlie", value: 30 },
            { location: "Alpha", category: "Alpha", value: 10 },
          ],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadChartData(config, schema);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const chartUrl = new URL(fetchMock.mock.calls[1][0], "https://example.test");
    expect(chartUrl.searchParams.get("locations")).toBe("Alpha,Charlie");
    expect(result.tabOptions).toEqual(["On Track", "Behind"]);
    expect(result.tabValue).toBe("On Track");
    expect(result.series).toEqual([
      { location: "Alpha", category: "Alpha", value: 10, group: "North" },
      { location: "Charlie", category: "Charlie", value: 30, group: "South" },
    ]);
  });

  it("uses a module filter dimension directly for a stratification tab", async () => {
    const stratifiedSchema = {
      ...schema,
      filterDimensions: [
        {
          column: "Status",
          param: "status",
          values: ["On Track", "Behind"],
          default: "On Track",
        },
      ],
    };
    const fetchMock = vi.fn(async (url) => {
      const params = new URL(url, "https://example.test").searchParams;
      return {
        ok: true,
        json: async () =>
          params.get("view") === "table"
            ? { records: [{ Location: "Bravo", Status: "Behind" }] }
            : { records: [{ location: "Bravo", category: "Bravo", value: 20 }] },
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadChartData(
      {
        ...config,
        bindings: { category: "Location", y: "Metric" },
        filters: { ...config.filters, tabValue: "Behind" },
      },
      stratifiedSchema,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const [url] of fetchMock.mock.calls) {
      const params = new URL(url, "https://example.test").searchParams;
      expect(params.get("status")).toBe("Behind");
      expect(params.has("locations")).toBe(false);
    }
    expect(result.series[0].location).toBe("Bravo");
  });

  it("loads each module stratum when a filter dimension is used for grouping", async () => {
    const stratifiedSchema = {
      ...schema,
      filterDimensions: [
        {
          column: "Status",
          param: "status",
          values: ["On Track", "Behind"],
          default: "On Track",
        },
      ],
    };
    const fetchMock = vi.fn(async (url) => {
      const params = new URL(url, "https://example.test").searchParams;
      const status = params.get("status");
      return {
        ok: true,
        json: async () =>
          params.get("view") === "table"
            ? { records: [{ Location: "Alpha", Status: status }] }
            : {
                records: [
                  {
                    location: "Alpha",
                    category: "Alpha",
                    value: status === "On Track" ? 30 : 10,
                  },
                ],
              },
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadChartData(
      {
        ...config,
        bindings: { category: "Location", y: "Metric", group: "Status" },
        filters: {
          ...config.filters,
          Status: "On Track",
          tabColumn: null,
          tabValue: null,
          tabOrder: [],
        },
      },
      stratifiedSchema,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const chartStatuses = fetchMock.mock.calls
      .map(([url]) => new URL(url, "https://example.test").searchParams)
      .filter((params) => params.get("view") === "category")
      .map((params) => params.get("status"));
    expect(chartStatuses).toEqual(["On Track", "Behind"]);
    expect(result.series).toEqual([
      { location: "Alpha", category: "Alpha", value: 30, group: "On Track" },
      { location: "Alpha", category: "Alpha", value: 10, group: "Behind" },
    ]);
  });
});

describe("seriesNamesOf", () => {
  it("returns each location for a line result", () => {
    const result = { series: [{ location: "Alameda" }, { location: "Butte" }] };
    expect(seriesNamesOf("line", result)).toEqual(["Alameda", "Butte"]);
  });

  it("returns the row labels (y) for a heatmap result", () => {
    const result = { series: { x: [2020, 2021], y: ["Alameda", "Butte"], z: [[1, 2], [3, 4]] } };
    expect(seriesNamesOf("heatmap", result)).toEqual(["Alameda", "Butte"]);
  });

  it("returns [] for a missing result", () => {
    expect(seriesNamesOf("line", null)).toEqual([]);
  });

  it("de-duplicates repeated color-series names for a bar result", () => {
    const result = {
      series: [
        { category: "Alameda", color: "Owner" },
        { category: "Butte", color: "Owner" },
        { category: "Alameda", color: "Renter" },
      ],
    };
    expect(seriesNamesOf("bar", result)).toEqual(["Owner", "Renter"]);
  });
});

describe("categoryNamesOf", () => {
  it("returns de-duplicated loaded labels for ranked bar charts", () => {
    const result = {
      series: [
        { category: "Alameda", group: "Owner" },
        { category: "Butte", group: "Owner" },
        { category: "Alameda", group: "Renter" },
      ],
    };
    expect(categoryNamesOf("bar", result)).toEqual(["Alameda", "Butte"]);
    expect(categoryNamesOf("divergingBar", result)).toEqual(["Alameda", "Butte"]);
  });

  it("returns no category options for unrelated chart types", () => {
    expect(categoryNamesOf("scatter", { series: [{ location: "Alameda" }] })).toEqual([]);
  });

  it("returns loaded location names for line charts", () => {
    const result = { series: [{ location: "Alameda" }, { location: "Butte" }] };
    expect(categoryNamesOf("line", result)).toEqual(["Alameda", "Butte"]);
  });
});
