/**
 * Integration test for app/api/zillow-affordability/route.js — the location
 * picker, the full-table view, subset validation, the error envelope, and the
 * default buy-vs-rent chart, verified against the committed
 * ZillowAffordability_Current.csv.
 */

import { describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/zillow-affordability/route";
import { getDefaultQuestion } from "@/lib/visualization/defaultQuestions";

async function get(query) {
  const res = await GET(new Request(`http://test/api/zillow-affordability?${query}`));
  return { status: res.status, body: await res.json() };
}

async function post(questionPatch = {}) {
  const spec = getDefaultQuestion("zillow-affordability");
  spec.question = { ...spec.question, ...questionPatch };
  const res = await POST(
    new Request("http://test/api/zillow-affordability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    }),
  );
  return { status: res.status, body: await res.json() };
}

describe("zillow-affordability API route", () => {
  it("lists the 26 California metros for the Metros subset", async () => {
    const { status, body } = await get("view=locations&subset=Metros");
    expect(status).toBe(200);
    expect(body.locations).toHaveLength(26);
    expect(body.locations).toContain("Madera");
    expect(body.locations).not.toContain("United States");
  });

  it("adds the national benchmark in the Metros and US subset", async () => {
    const { status, body } = await get("view=locations&subset=Metros+and+US");
    expect(status).toBe(200);
    expect(body.locations).toHaveLength(27);
    expect(body.locations).toContain("United States");
  });

  it("serves the full table with every contract column", async () => {
    const { status, body } = await get("view=table&full=1");
    expect(status).toBe(200);
    expect(body.rowCount).toBe(body.records.length);
    expect(Object.keys(body.records[0])).toEqual([
      "Release Date",
      "Geographic Level",
      "Location",
      "Date",
      "Housing Scenario",
      "Mortgage Payment",
      "Total Monthly Payment",
      "Income Needed",
      "Share of Income",
      "Affordable Home Price",
      "Years to Save",
    ]);
  });

  it("narrows the table by subset, location, and calendar year", async () => {
    const { status, body } = await get("view=table&subset=Metros&locations=Fresno&startYear=2020&endYear=2020");
    expect(status).toBe(200);
    // 3 buy scenarios + rent, 12 months each
    expect(body.rowCount).toBe(4 * 12);
    expect(new Set(body.records.map((row) => row.Location))).toEqual(new Set(["Fresno"]));
    expect(body.records.every((row) => row.Date.startsWith("2020-"))).toBe(true);
  });

  it("keeps the hand-blanked 2013 values blank, not zero", async () => {
    const { body } = await get("view=table&subset=Metros&locations=Santa+Rosa&startYear=2013&endYear=2013");
    const buy20 = body.records.filter((row) => row["Housing Scenario"] === "Buy (20% down)");
    expect(buy20).toHaveLength(12);
    expect(buy20.every((row) => row["Total Monthly Payment"] === null)).toBe(true);
    expect(buy20.every((row) => Number.isFinite(row["Mortgage Payment"]))).toBe(true);
  });

  it("rejects an unknown subset and view with the standard error envelope", async () => {
    const badSubset = await get("view=locations&subset=Counties");
    expect(badSubset.status).toBe(400);
    expect(badSubset.body.error).toMatch(/subset/);
    expect(badSubset.body.source).toMatch(/^zillow-affordability API/);

    const badView = await get("view=line&subset=Metros");
    expect(badView.status).toBe(400);
    expect(badView.body.error).toMatch(/view/);
  });

  it("answers the default view: total monthly payment with 10% down", async () => {
    const { status, body } = await post();
    expect(status).toBe(200);
    const available = body.observations.filter((row) => row.status === "available");
    expect(new Set(available.map((row) => row.comparisonId))).toEqual(new Set(["cmp_buy_10_down"]));
    expect(new Set(available.map((row) => row.geographyLabel))).toEqual(
      new Set(["San Francisco", "Los Angeles", "Sacramento", "United States"]),
    );
    // 2015-01 through 2026-10 = 142 months for each of the four places
    expect(available).toHaveLength(4 * 142);
    expect(available[0].unit).toBe("usd");
  });

  it("answers renter income needed when asked", async () => {
    const { status, body } = await post({
      outcomes: [{ role: "y", measureId: "Income Needed" }],
      comparisons: [{ id: "cmp_rent", dimensions: { "Housing Scenario": "Rent" }, customLabel: null, color: null }],
    });
    expect(status).toBe(200);
    const laRent = body.observations.find(
      (row) => row.geographyLabel === "Los Angeles" && row.period === "2026-10",
    );
    expect(laRent.value).toBeCloseTo(116523.3, 0);
  });
});
