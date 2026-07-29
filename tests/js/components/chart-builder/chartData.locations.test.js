/** Phase 6 request precedence for filters.locations and legacy layers. */

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadChartData } from "@/components/chart-builder/chartData";
import { CHART_TYPE_IDS } from "@/lib/visualization/chartRegistry";

const schema = {
  id: "widgets",
  apiPath: "/api/widgets",
  subsets: { Counties: ["County"] },
  filterDimensions: [],
  fields: {
    Year: { kind: "temporal" },
    Location: { kind: "dimension", cardinality: "high" },
    Value: { kind: "measure" },
  },
};
const base = {
  chartType: "line",
  data: { source: "module" },
  bindings: { x: "Year", y: "Value", series: "Location" },
  period: { startYear: 2020, endYear: 2025 },
  filters: { subset: "Counties", locations: [] },
  appearance: {},
  transform: "actual",
  layers: [{ id: "selectedPlaces", type: "selectedPlaces", values: ["Legacy"] }],
};

function fetchEnvelope() {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ series: [] }),
  }));
}

describe("selected locations request behavior", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("prefers first-class filters.locations over selectedPlaces layer values", async () => {
    const fetchMock = fetchEnvelope();
    vi.stubGlobal("fetch", fetchMock);
    await loadChartData(
      { ...base, filters: { ...base.filters, locations: ["Alameda", "Butte"] } },
      schema,
    );
    const url = new URL(fetchMock.mock.calls[0][0], "http://test");
    expect(url.searchParams.get("locations")).toBe("Alameda,Butte");
  });

  it("keeps the selectedPlaces layer fallback when locations is empty", async () => {
    const fetchMock = fetchEnvelope();
    vi.stubGlobal("fetch", fetchMock);
    await loadChartData(base, schema);
    const url = new URL(fetchMock.mock.calls[0][0], "http://test");
    expect(url.searchParams.get("locations")).toBe("Legacy");
  });

  it("omits the locations parameter when neither path selects places", async () => {
    const fetchMock = fetchEnvelope();
    vi.stubGlobal("fetch", fetchMock);
    await loadChartData({ ...base, layers: [] }, schema);
    const url = new URL(fetchMock.mock.calls[0][0], "http://test");
    expect(url.searchParams.has("locations")).toBe(false);
  });
});

describe("registered chart query shapes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds a named API view for every remaining registered chart type", async () => {
    const moduleRequests = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const parsed = new URL(url, "http://test");
        if (parsed.pathname === schema.apiPath) moduleRequests.push(parsed);
        if (parsed.pathname === "/api/geography") {
          return {
            ok: true,
            json: async () => ({ type: "FeatureCollection", features: [] }),
          };
        }
        const view = parsed.searchParams.get("view");
        return {
          ok: true,
          json: async () =>
            view === "matrix"
              ? { matrix: { x: [], y: [], z: [] } }
              : view === "line"
                ? { series: [] }
                : view === "table"
                  ? { columns: [], rows: [] }
                  : { records: [] },
        };
      }),
    );

    for (const chartType of CHART_TYPE_IDS) {
      await loadChartData(
        {
          ...base,
          chartType,
          bindings: {
            x: "Value",
            y: "Value",
            size: "Value",
            color: "Value",
            start: "Value",
          },
          layers: [],
        },
        schema,
      );
    }

    expect(moduleRequests).toHaveLength(CHART_TYPE_IDS.length);
    for (const request of moduleRequests) {
      expect(request.searchParams.get("view")).toMatch(/^[A-Za-z]+$/);
      expect(request.searchParams.get("view")).not.toBe("undefined");
    }
  });
});
