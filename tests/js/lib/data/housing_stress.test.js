import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/housing-stress/route";
import { queryLineSeries } from "@/lib/data/housing_stress";
import { getDefaultQuestion } from "@/lib/visualization/defaultQuestions";

describe("ACS Housing Stress legacy overlap", () => {
  it("fills unpublished 2022 race iterations so 2023 can be calculated", async () => {
    const result = await queryLineSeries({
      subset: "Regions",
      locations: ["Bay Area"],
      startYear: 2022,
      endYear: 2023,
      raceEthnicity: "Black",
      tenure: "Total",
      parameter: "Number Over 30%",
    });

    expect(result.series).toEqual([
      {
        location: "Bay Area",
        years: [2022, 2023],
        values: [88564, 71210],
      },
    ]);
  });

  it("returns the 2023 year-over-year percentage for the repaired series", async () => {
    const spec = getDefaultQuestion("housing-stress");
    spec.question.outcome = { measureId: "Number Over 30%" };
    spec.question.geography = { subset: "Regions", locations: ["Bay Area"] };
    spec.question.time = { contract: "range", startYear: 2022, endYear: 2023 };
    spec.question.calculation = { id: "percentChange", params: {} };
    spec.question.comparisons = [
      {
        id: "cmp_black",
        dimensions: { "Race/Ethnicity": "Black", Tenure: "Total" },
      },
    ];

    const response = await POST(
      new Request("http://test/api/housing-stress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(spec),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.observations).toHaveLength(1);
    expect(body.observations[0]).toMatchObject({
      comparisonId: "cmp_black",
      period: 2023,
      status: "available",
      unit: "percent",
      includedPeriods: [2022, 2023],
    });
    expect(body.observations[0].value).toBeCloseTo(((71210 - 88564) / 88564) * 100);
  });
});
