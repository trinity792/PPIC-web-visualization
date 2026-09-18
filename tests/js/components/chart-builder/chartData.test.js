/**
 * Tests for components/chart-builder/chartData.js — the v3 request boundary:
 * one POST per question, validated against the observation contract, plus the
 * map geometry fetched beside it. (The chart-shaped GET loader's tests moved
 * with it to `.trash/visualization-backend/` at the 2026-09-14 cutover.)
 */

import { afterEach, describe, expect, it, vi } from "vitest";

describe("loadObservationGeometry — v3 Symbol Map layers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads both representative points and polygon context", async () => {
    vi.resetModules();
    const { loadObservationGeometry } = await import(
      "@/components/chart-builder/chartData"
    );
    const points = { "06001": [-121.9, 37.65] };
    const geojson = { type: "FeatureCollection", features: [] };
    const fetchMock = vi.fn(async (url) => {
      const parsed = new URL(url, "https://example.test");
      return {
        ok: true,
        json: async () =>
          parsed.searchParams.get("type") === "points" ? points : geojson,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loadObservationGeometry("symbolMap", "Counties", undefined),
    ).resolves.toEqual({ points, geojson });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.map(([url]) =>
        new URL(url, "https://example.test").searchParams.get("type") || "polygons",
      ),
    ).toEqual(["points", "polygons"]);
  });
});

const chartDataModule = () => import("@/components/chart-builder/chartData");

function v3Question(overrides = {}) {
  return {
    version: 3,
    question: {
      dataset: { kind: "module", moduleId: "projections" },
      source: "DoF P-3",
      outcome: { measureId: "Population" },
      geography: { subset: "Counties", locations: ["San Francisco"] },
      time: { contract: "range", startYear: 2020, endYear: 2030 },
      calculation: { id: "actual", params: {} },
      comparisons: [
        {
          id: "cmp_latina",
          dimensions: { "Race/Ethnicity": "Hispanic", Sex: "Female", "Age Group": "All Ages" },
        },
        {
          id: "cmp_white_women",
          dimensions: { "Race/Ethnicity": "White", Sex: "Female", "Age Group": "All Ages" },
        },
      ],
      ...overrides,
    },
    presentation: { chartType: "line", comparisonPresentation: "combined" },
  };
}

const observation = (comparisonId, period, value, overrides = {}) => ({
  comparisonId,
  comparisonLabel: comparisonId,
  measureId: "Population",
  measureLabel: "Population",
  unit: "people",
  period,
  geographyId: "06075",
  geographyLabel: "San Francisco",
  categoryId: null,
  categoryLabel: null,
  value,
  status: value === null ? "missing" : "available",
  valueKind: "observed",
  calculation: { id: "actual", params: {} },
  includedPeriods: null,
  source: "DoF P-3",
  ...overrides,
});

function stubResponse(body, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Workstream C v3 loader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends one POST body for all comparisons", async () => {
    const fetchMock = stubResponse({
      status: "ok",
      observations: [
        observation("cmp_latina", 2020, 40000),
        observation("cmp_white_women", 2020, 60000),
      ],
      comparisons: [
        { id: "cmp_latina", label: "San Francisco Latina Women", status: "ok" },
        { id: "cmp_white_women", label: "San Francisco White Women", status: "ok" },
      ],
      periods: [2020],
      issues: [],
    });

    const { loadObservations } = await chartDataModule();
    await loadObservations(v3Question(), { apiPath: "/api/projections" });

    // One request, not one per comparison and not one per chart-shaped view.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/projections");
    expect(init.method).toBe("POST");

    const sent = JSON.parse(init.body);
    expect(sent.question.comparisons.map((entry) => entry.id)).toEqual([
      "cmp_latina",
      "cmp_white_women",
    ]);
    // The old path put ten comparisons' worth of selection into a query string.
    expect(url).not.toContain("?");
  });

  it("does not include chart id in the data question", async () => {
    const fetchMock = stubResponse({
      status: "ok",
      observations: [observation("cmp_latina", 2020, 40000)],
      comparisons: [{ id: "cmp_latina", label: "Latina women", status: "ok" }],
      periods: [2020],
      issues: [],
    });

    const { loadObservations } = await chartDataModule();
    await loadObservations(v3Question(), { apiPath: "/api/projections" });
    const asLine = JSON.parse(fetchMock.mock.calls[0][1].body);

    fetchMock.mockClear();
    await loadObservations(
      { ...v3Question(), presentation: { chartType: "bar", comparisonPresentation: "tabs" } },
      { apiPath: "/api/projections" },
    );
    const asBar = JSON.parse(fetchMock.mock.calls[0][1].body);

    // Same question, different renderer: byte-identical request. Changing the
    // presentation must not be able to change what the data means.
    expect(asBar).toEqual(asLine);
    expect(JSON.stringify(asLine)).not.toContain("chartType");
    expect(JSON.stringify(asLine)).not.toContain("view=");
  });

  it("surfaces partial issues without discarding valid observations", async () => {
    stubResponse({
      status: "ok",
      observations: [observation("cmp_latina", 2020, 40000)],
      comparisons: [
        { id: "cmp_latina", label: "San Francisco Latina Women", status: "ok" },
        { id: "cmp_white_women", label: "San Francisco White Women", status: "invalid" },
      ],
      periods: [2020],
      issues: [
        {
          code: "zeroBaseValue",
          level: "comparison",
          comparisonId: "cmp_white_women",
          message: "Percent change needs a start value that is not zero.",
        },
      ],
    });

    const { loadObservations } = await chartDataModule();
    const result = await loadObservations(v3Question(), { apiPath: "/api/projections" });

    // The preview draws what it can and explains what it cannot. Neither half
    // is allowed to suppress the other.
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].comparisonId).toBe("cmp_latina");
    expect(result.issues).toEqual([
      expect.objectContaining({ comparisonId: "cmp_white_women", level: "comparison" }),
    ]);
    expect(result.blocked).toBe(false);
  });

  it("reports a blocking response without inventing observations", async () => {
    stubResponse(
      {
        status: "blocked",
        observations: [],
        comparisons: [],
        periods: [],
        issues: [
          {
            code: "unknownOutcome",
            level: "blocking",
            comparisonId: null,
            message: "Select an outcome to show this chart.",
          },
        ],
      },
      400,
    );

    const { loadObservations } = await chartDataModule();
    const result = await loadObservations(v3Question(), { apiPath: "/api/projections" });

    expect(result.blocked).toBe(true);
    expect(result.observations).toEqual([]);
    expect(result.issues[0].level).toBe("blocking");
  });

  it("rejects a response that does not satisfy the observation contract", async () => {
    // A suppressed row carrying a number is exactly how a hole becomes a
    // plotted zero, so the client refuses it rather than drawing it.
    stubResponse({
      status: "ok",
      observations: [observation("cmp_latina", 2020, 0, { status: "suppressed" })],
      comparisons: [{ id: "cmp_latina", label: "Latina women", status: "ok" }],
      periods: [2020],
      issues: [],
    });

    const { loadObservations } = await chartDataModule();
    const result = await loadObservations(v3Question(), { apiPath: "/api/projections" });

    expect(result.blocked).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "invalidResponse", level: "blocking" }),
    ]);
  });
});
