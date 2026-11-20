/**
 * Measures published for only some comparison values (`availableFor`), and the
 * self-formatting units (dollars, 0-1 shares, years).
 *
 * Regression for the first Zillow preview (2026-11-18): Buy (5%/10% down)
 * comparisons drew no line for Income needed, and switching the outcome to
 * Years to save left a Rent comparison that emptied the chart.
 */

import { describe, expect, it } from "vitest";

import { reduceChartConfig } from "@/components/chart-builder/chartConfigStore";
import { loadZillowAffordabilityData } from "@/lib/data/zillow_affordability";
import {
  availableDimensionValues,
  reconcileComparisonsWithOutcomes,
} from "@/lib/visualization/comparisons";
import { getDefaultQuestion } from "@/lib/visualization/defaultQuestions";
import { formatNumber, formatterFor } from "@/lib/visualization/formatters";
import { numberFormatFor } from "@/lib/visualization/models/sharedSettings";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";

const zillow = getModuleSchema("zillow-affordability");
const SCENARIOS = zillow.comparisonDimensions[0].values;
const cmp = (id, scenario) => ({ id, dimensions: { "Housing Scenario": scenario } });

describe("availableDimensionValues", () => {
  it("keeps only the scenarios that carry the measure, in display order", () => {
    expect(availableDimensionValues(zillow, "Housing Scenario", SCENARIOS, ["Income Needed"])).toEqual([
      "Buy (20% down)",
      "Rent",
    ]);
    expect(availableDimensionValues(zillow, "Housing Scenario", SCENARIOS, ["Mortgage Payment"])).toEqual([
      "Buy (5% down)",
      "Buy (10% down)",
      "Buy (20% down)",
    ]);
  });

  it("intersects across several outcomes", () => {
    expect(
      availableDimensionValues(zillow, "Housing Scenario", SCENARIOS, ["Income Needed", "Years to Save"]),
    ).toEqual(["Buy (20% down)"]);
  });

  it("leaves modules without availableFor untouched", () => {
    const stress = getModuleSchema("housing-stress");
    const tenure = stress.comparisonDimensions.find((dimension) => dimension.id === "Tenure").values;
    expect(availableDimensionValues(stress, "Tenure", tenure, ["Share Over 30%"])).toEqual(tenure);
  });
});

describe("reconcileComparisonsWithOutcomes", () => {
  it("moves a stranded comparison to the first free scenario, keeping its id", () => {
    const next = reconcileComparisonsWithOutcomes(
      zillow,
      [cmp("a", "Buy (20% down)"), cmp("b", "Rent")],
      ["Mortgage Payment"],
    );
    expect(next).toEqual([cmp("a", "Buy (20% down)"), cmp("b", "Buy (5% down)")]);
  });

  it("drops a comparison that has nowhere left to go", () => {
    const next = reconcileComparisonsWithOutcomes(
      zillow,
      [cmp("a", "Buy (20% down)"), cmp("b", "Rent")],
      ["Years to Save"],
    );
    expect(next).toEqual([cmp("a", "Buy (20% down)")]);
  });

  it("never leaves the chart with no comparisons", () => {
    const next = reconcileComparisonsWithOutcomes(zillow, [cmp("b", "Rent")], ["Years to Save"]);
    expect(next).toEqual([cmp("b", "Buy (20% down)")]);
  });

  it("returns the same array when every comparison already has data", () => {
    const comparisons = [cmp("a", "Buy (20% down)"), cmp("b", "Rent")];
    expect(reconcileComparisonsWithOutcomes(zillow, comparisons, ["Income Needed"])).toBe(comparisons);
  });

  it("returns the same array for modules without availableFor", () => {
    const stress = getModuleSchema("housing-stress");
    const comparisons = getDefaultQuestion("housing-stress").question.comparisons;
    expect(reconcileComparisonsWithOutcomes(stress, comparisons, ["Share Over 50%"])).toBe(comparisons);
  });
});

describe("SET_OUTCOME on Zillow", () => {
  // Buy (20% down) vs Rent on Income needed, the view from the first preview.
  const buyVsRent = () => {
    const spec = getDefaultQuestion("zillow-affordability");
    spec.question.outcomes = [{ role: "y", measureId: "Income Needed" }];
    spec.question.comparisons = [cmp("cmp_buy_20_down", "Buy (20% down)"), cmp("cmp_rent", "Rent")];
    return spec;
  };

  it("switching to Years to save keeps a drawable comparison instead of an empty chart", () => {
    const next = reduceChartConfig(buyVsRent(), { type: "SET_OUTCOME", outcome: { measureId: "Years to Save" } }, zillow);

    expect(next.question.outcomes).toEqual([{ role: "y", measureId: "Years to Save" }]);
    expect(next.question.comparisons.map((entry) => entry.dimensions["Housing Scenario"])).toEqual([
      "Buy (20% down)",
    ]);
  });

  it("switching to a payment moves Rent onto a buy scenario", () => {
    const next = reduceChartConfig(buyVsRent(), { type: "SET_OUTCOME", outcome: { measureId: "Total Monthly Payment" } }, zillow);

    expect(next.question.comparisons.map((entry) => entry.dimensions["Housing Scenario"])).toEqual([
      "Buy (20% down)",
      "Buy (5% down)",
    ]);
  });

  it("switching the default view to Income needed moves Buy (10% down) onto a scenario that has it", () => {
    const next = reduceChartConfig(
      getDefaultQuestion("zillow-affordability"),
      { type: "SET_OUTCOME", outcome: { measureId: "Income Needed" } },
      zillow,
    );

    expect(next.question.comparisons.map((entry) => entry.dimensions["Housing Scenario"])).toEqual([
      "Buy (20% down)",
    ]);
  });
});

describe("availableFor matches the published data", () => {
  it("each measure has values in exactly the scenarios it declares", async () => {
    const rows = await loadZillowAffordabilityData();
    for (const measureId of zillow.numericColumns) {
      const withValues = new Set(
        rows.filter((row) => Number.isFinite(row[measureId])).map((row) => row["Housing Scenario"]),
      );
      expect([...withValues].sort(), measureId).toEqual(
        [...zillow.fields[measureId].availableFor["Housing Scenario"]].sort(),
      );
    }
  });
});

describe("self-formatting units", () => {
  const rows = (unit, values, calculation = "actual") =>
    values.map((value) => ({ unit, value, calculation: { id: calculation, params: {} } }));

  it("formats dollars, shares, and years on the axis when no number type is chosen", () => {
    const usd = numberFormatFor(rows("usd", [2820.4]));
    expect(usd).toEqual({ type: "usd", decimalPlaces: 0 });
    expect(formatNumber(2820.4, usd)).toBe("$2,820");

    const share = numberFormatFor(rows("share", [0.442]));
    expect(share).toEqual({ type: "share", decimalPlaces: 1 });
    expect(formatNumber(0.442, share)).toBe("44.2%");

    const years = numberFormatFor(rows("years", [10.64]));
    expect(formatNumber(10.64, years)).toBe("10.6");
  });

  it("leaves calculated values, mixed units, and other topics' units alone", () => {
    expect(numberFormatFor(rows("usd", [5], "numericChange"))).toBeNull();
    expect(numberFormatFor([...rows("usd", [1]), ...rows("share", [0.5])])).toBeNull();
    expect(numberFormatFor(rows("percent", [38]))).toBeNull();
    expect(numberFormatFor(rows("count", [38]))).toBeNull();
  });

  it("lets the reader's explicit number type and decimals win", () => {
    expect(numberFormatFor(rows("usd", [1]), { verticalNumberType: "number" })).toMatchObject({ type: "number" });
    expect(numberFormatFor(rows("share", [0.4]), { decimalPlaces: 0 })).toEqual({ type: "share", decimalPlaces: 0 });
  });

  it("gives field formatters for the new units", () => {
    expect(formatterFor({ unit: "usd" })(116523.3)).toBe("$116,523");
    expect(formatterFor({ unit: "share" })(0.26)).toBe("26.0%");
    expect(formatterFor({ unit: "years" })(8.13)).toBe("8.1");
  });
});
