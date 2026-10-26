/**
 * The v3 POST handlers for the four modules wired through the generic
 * observation adapter (`genericModuleAdapter` in moduleAdapters.js), verified
 * end to end against the committed CSVs the same way the Projections and
 * Components of Change route tests are.
 *
 * These modules never went through the editor before the all-modules v3 pass,
 * so this file pins the behaviours that pass depended on: derived Building
 * Permits places answering with data, stratified modules rejecting a
 * comparison that pins nothing, and a snapshot module with no published
 * period list still resolving a period on its own.
 */

import { describe, expect, it } from "vitest";

import { POST as BUILDING_PERMITS_POST } from "@/app/api/building-permits/route";
import { POST as COMPONENTS_OF_CHANGE_POST } from "@/app/api/components-of-change/route";
import { POST as HOUSING_STRESS_POST } from "@/app/api/housing-stress/route";
import { POST as POPHOUSING_POST } from "@/app/api/pophousing/route";
import { POST as PROJECTIONS_POST } from "@/app/api/projections/route";
import { POST as RHNA_PROGRESS_POST } from "@/app/api/rhna-progress/route";
import { getDefaultQuestion } from "@/lib/visualization/defaultQuestions";
import { loadGeometry, loadRepresentativePoints } from "@/lib/data/geography";
import { adaptObservations } from "@/lib/visualization/adapters";
import { getChartCapabilities } from "@/lib/visualization/chartRegistry";
import { buildChartModel } from "@/lib/visualization/models";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";
import { validateResponse } from "@/lib/visualization/observationContract";
import { previewInput } from "@/lib/visualization/previewInput";

async function post(handler, moduleId, questionPatch, comparisons) {
  const spec = getDefaultQuestion(moduleId);
  spec.question = { ...spec.question, ...questionPatch };
  if (comparisons) spec.question.comparisons = comparisons;
  const res = await handler(
    new Request(`http://test/api/${moduleId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    }),
  );
  return { status: res.status, body: await res.json() };
}

const available = (body) =>
  body.observations.filter((row) => row.status === "available");

describe("preloaded topic defaults", () => {
  it.each([
    ["pophousing", POPHOUSING_POST],
    ["components-of-change", COMPONENTS_OF_CHANGE_POST],
    ["demographic-projections", PROJECTIONS_POST],
    ["housing-stress", HOUSING_STRESS_POST],
    ["building-permits", BUILDING_PERMITS_POST],
    ["rhna-progress", RHNA_PROGRESS_POST],
  ])("%s returns data for its default comparisons and locations", async (moduleId, handler) => {
    const spec = getDefaultQuestion(moduleId);
    const { status, body } = await post(handler, moduleId);
    expect(status).toBe(200);
    expect(validateResponse(body).valid).toBe(true);
    for (const comparison of spec.question.comparisons) {
      const locations = new Set(available(body)
        .filter((row) => row.comparisonId === comparison.id)
        .map((row) => row.geographyLabel));
      expect([...locations].sort(), comparison.id).toEqual([...spec.question.geography.locations].sort());
    }
  });
});

describe("building-permits v3 POST", () => {
  it("answers the derived region and Rest of US places the location list offers", async () => {
    // Regions and "Rest of US" exist only as on-demand aggregates in the data
    // layer; the adapter must read the same derived rows `?view=locations`
    // advertises, or a reader who picks them gets an all-missing chart.
    const region = await post(BUILDING_PERMITS_POST, "building-permits", {
      geography: { subset: "Regions", locations: ["Bay Area"] },
      time: { contract: "range", startYear: "2024-01", endYear: "2024-12" },
    });
    expect(region.status).toBe(200);
    expect(validateResponse(region.body).valid).toBe(true);
    expect(available(region.body)).toHaveLength(12);
    expect(region.body.observations[0]).toMatchObject({
      geographyLabel: "Bay Area",
      period: "2024-01",
    });

    const restOfUs = await post(BUILDING_PERMITS_POST, "building-permits", {
      geography: { subset: "States", locations: ["Rest of US"] },
      time: { contract: "range", startYear: "2024-01", endYear: "2024-12" },
    });
    expect(restOfUs.status).toBe(200);
    expect(available(restOfUs.body)).toHaveLength(12);

    // A native metro still answers at its stored grain.
    const metro = await post(BUILDING_PERMITS_POST, "building-permits", {
      geography: { subset: "Metros", locations: ["San Francisco"] },
      time: { contract: "range", startYear: "2024-01", endYear: "2024-12" },
    });
    expect(available(metro.body)).toHaveLength(12);
  });
});

describe("housing-stress v3 POST", () => {
  const counties = { geography: { subset: "Counties", locations: ["Alameda"] } };

  it("returns the pinned race and tenure stratum", async () => {
    const res = await post(HOUSING_STRESS_POST, "housing-stress", counties, [
      { id: "cmp_all", dimensions: { "Race/Ethnicity": "All", Tenure: "Total" } },
    ]);
    expect(res.status).toBe(200);
    expect(validateResponse(res.body).valid).toBe(true);
    // 2012-2024 with no 2020 ACS 1-year release.
    expect(res.body.periods).toEqual([
      2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024,
    ]);
    expect(available(res.body)).toHaveLength(12);
    expect(res.body.comparisons).toEqual([{ id: "cmp_all", label: "Alameda", status: "ok" }]);
  });

  it("rejects a comparison that pins no stratum instead of returning an arbitrary row", async () => {
    // Without this the row filter lets every race x tenure row through and the
    // first one in the CSV wins - a wrong number with no notice.
    const res = await post(HOUSING_STRESS_POST, "housing-stress", counties, [
      { id: "cmp_blank", dimensions: {} },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.issues).toContainEqual(
      expect.objectContaining({
        code: "incompleteComparison",
        comparisonId: "cmp_blank",
        message: "Select Race/ethnicity, Tenure for this comparison.",
      }),
    );
  });
});

describe("pophousing v3 POST", () => {
  it("answers a county without bleeding in the same-named city", async () => {
    const res = await post(POPHOUSING_POST, "pophousing", {
      geography: { subset: "Counties", locations: ["Alameda"] },
      time: { contract: "range", startYear: 2020, endYear: 2024 },
    });
    expect(res.status).toBe(200);
    expect(validateResponse(res.body).valid).toBe(true);
    expect(available(res.body)).toHaveLength(5);
    // Alameda County is ~1.6M people; the City of Alameda is ~75k.
    expect(res.body.observations[0].value).toBeGreaterThan(1_000_000);
  });
});

describe("rhna-progress v3 POST", () => {
  it("joins every default county to both map types while retaining HCD labels", async () => {
    const spec = getDefaultQuestion("rhna-progress");
    const { status, body } = await post(RHNA_PROGRESS_POST, "rhna-progress");
    expect(status).toBe(200);
    const geojson = await loadGeometry("counties");
    const points = await loadRepresentativePoints("counties");
    const featureIds = new Set(geojson.features.map((feature) => feature.properties.GEOID));
    for (const row of available(body)) {
      expect(featureIds.has(row.geographyId), row.geographyLabel).toBe(true);
      expect(row.geographyLabel).toMatch(/ County$/);
    }
    const schema = getModuleSchema("rhna-progress");
    const map = adaptObservations(previewInput(spec, schema, { ...body, geometry: geojson }));
    expect(map.data[0].locations).toHaveLength(spec.question.geography.locations.length);
    expect(map.layout.geo.projection.type).toBe("mercator");
    const symbols = adaptObservations(previewInput(spec, schema, {
      ...body, geometry: { points, geojson },
    }, "symbolMap"));
    expect(symbols.data.find((trace) => trace.mode === "markers").lon)
      .toHaveLength(spec.question.geography.locations.length);
  });

  it.each([
    ["bar", "bars"], ["dotPlot", "points"], ["scatter", "points"],
    ["bubble", "points"], ["pie", "slices"], ["dataTable", "table"],
  ])("draws RHNA's restored %s option from snapshot observations", async (chartType, marks) => {
    const spec = getDefaultQuestion("rhna-progress");
    const outcomes = [{ role: "y", measureId: "Units" }];
    if (["scatter", "bubble"].includes(chartType)) outcomes.push({ role: "x", measureId: "RHNA" });
    if (chartType === "bubble") outcomes.push({ role: "size", measureId: "Projected Units" });
    const { status, body } = await post(RHNA_PROGRESS_POST, "rhna-progress", { outcomes });
    expect(status).toBe(200);
    spec.question.outcomes = outcomes;
    spec.presentation = {
      ...spec.presentation,
      chartType,
      comparisonPresentation: getChartCapabilities(chartType).comparison.default,
    };
    const input = previewInput(spec, getModuleSchema("rhna-progress"), body);
    const model = chartType === "dataTable" ? adaptObservations(input) : buildChartModel(input);
    expect(chartType === "dataTable" ? model.table.rows.length : model[marks].length).toBeGreaterThan(0);
  });

  it("resolves a bare snapshot to the latest row when no period list is published", async () => {
    const res = await post(
      RHNA_PROGRESS_POST,
      "rhna-progress",
      { geography: { subset: "Counties", locations: ["Alameda County"] } },
      [{ id: "cmp_total", dimensions: { "Income Level": "Total" } }],
    );
    expect(res.status).toBe(200);
    expect(validateResponse(res.body).valid).toBe(true);
    expect(res.body.periods).toHaveLength(1);
    expect(available(res.body)).toHaveLength(1);
    expect(res.body.observations[0]).toMatchObject({
      geographyLabel: "Alameda County",
      period: res.body.periods[0],
    });
  });

  it("rejects a comparison with no income level", async () => {
    const res = await post(
      RHNA_PROGRESS_POST,
      "rhna-progress",
      { geography: { subset: "Counties", locations: ["Alameda County"] } },
      [{ id: "cmp_blank", dimensions: {} }],
    );
    expect(res.status).toBe(400);
    expect(res.body.issues).toContainEqual(
      expect.objectContaining({ code: "incompleteComparison", comparisonId: "cmp_blank" }),
    );
  });
});
