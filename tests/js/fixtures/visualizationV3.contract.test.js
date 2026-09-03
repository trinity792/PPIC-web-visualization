/**
 * Workstream F - the fixtures themselves are under test.
 *
 * Every v3 test - calculations, routes, adapters, tables, exports - reads its
 * inputs from `tests/fixtures/visualization-v3/`. That is what stops a route
 * test and a renderer test from disagreeing about what *missing*, *suppressed*,
 * *observed*, *projected*, or *aggregate* means. It also makes the fixtures
 * load-bearing: a duplicate row would silently double a sum in a dozen places,
 * and a dropped case would turn a whole class of assertions into a no-op that
 * still passes.
 *
 * The arithmetic below is done with plain JavaScript on purpose. It is a second
 * opinion on the hand-calculated `*_EXPECTED` values, and it must never call the
 * calculation registry - a test that checks the implementation against itself
 * proves only that it is self-consistent.
 */

import { describe, expect, it } from "vitest";

import {
  COMPONENTS_OF_CHANGE_EXPECTED,
  COMPONENTS_OF_CHANGE_MEASURES,
  COMPONENTS_OF_CHANGE_ROWS,
  COMPONENTS_OF_CHANGE_TIME,
} from "@/tests/fixtures/visualization-v3/componentsOfChange";
import {
  PROJECTIONS_DIMENSION_ROLES,
  PROJECTIONS_EXPECTED,
  PROJECTIONS_ROWS,
  PROJECTIONS_TIME,
} from "@/tests/fixtures/visualization-v3/projections";

const PROJECTIONS_GRAIN = [
  "Year",
  "Location",
  "Age Group",
  "Sex",
  "Race/Ethnicity",
  "Source",
];
const COMPONENTS_GRAIN = ["Year", "Location", "measureId", "Source"];

const keyOf = (row, grain) => grain.map((column) => String(row[column])).join(" | ");

const find = (rows, match) =>
  rows.find((row) => Object.entries(match).every(([key, value]) => row[key] === value));

describe("fixture grain", () => {
  it("keeps fixture keys unique at their declared grain", () => {
    for (const [name, rows, grain] of [
      ["projections", PROJECTIONS_ROWS, PROJECTIONS_GRAIN],
      ["components of change", COMPONENTS_OF_CHANGE_ROWS, COMPONENTS_GRAIN],
    ]) {
      const keys = rows.map((row) => keyOf(row, grain));
      const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
      // A duplicate row does not fail loudly anywhere: it just makes one number
      // twice as large as it should be, in every test that sums.
      expect(duplicates, name).toEqual([]);
    }
  });

  it("declares every column its grain names on every row", () => {
    for (const row of PROJECTIONS_ROWS) {
      for (const column of PROJECTIONS_GRAIN) {
        expect(row[column], keyOf(row, PROJECTIONS_GRAIN)).not.toBeUndefined();
      }
    }
    for (const row of COMPONENTS_OF_CHANGE_ROWS) {
      for (const column of COMPONENTS_GRAIN) {
        expect(row[column], keyOf(row, COMPONENTS_GRAIN)).not.toBeUndefined();
      }
    }
  });

  it("stays small enough for a person to check by eye", () => {
    // These are hand-readable fixtures, not data extracts. If this fails, the
    // fix is a sharper case, not a bigger file.
    expect(PROJECTIONS_ROWS.length).toBeLessThan(80);
    expect(COMPONENTS_OF_CHANGE_ROWS.length).toBeLessThan(80);
  });
});

describe("required cases", () => {
  it("contains every required availability and value kind", () => {
    const statuses = (rows) => new Set(rows.map((row) => row.status));
    const kinds = (rows) => new Set(rows.map((row) => row.valueKind));

    for (const [name, rows] of [
      ["projections", PROJECTIONS_ROWS],
      ["components of change", COMPONENTS_OF_CHANGE_ROWS],
    ]) {
      expect([...statuses(rows)].sort(), name).toEqual([
        "available",
        "missing",
        "suppressed",
      ]);
    }

    // Projections is the module that spans observed estimates and forecasts.
    expect([...kinds(PROJECTIONS_ROWS)].sort()).toEqual(["observed", "projected"]);
    expect([...kinds(COMPONENTS_OF_CHANGE_ROWS)]).toEqual(["observed"]);

    // "derived" is never stored. It is what a calculation returns, and a
    // fixture that shipped one would be asserting the answer into existence.
    for (const rows of [PROJECTIONS_ROWS, COMPONENTS_OF_CHANGE_ROWS]) {
      expect(rows.some((row) => row.valueKind === "derived")).toBe(false);
    }
  });

  it("carries null, never zero, on every unavailable row", () => {
    for (const row of [...PROJECTIONS_ROWS, ...COMPONENTS_OF_CHANGE_ROWS]) {
      const value = "Population" in row ? row.Population : row.value;
      if (row.status === "available") {
        expect(Number.isFinite(value), keyOf(row, PROJECTIONS_GRAIN)).toBe(true);
      } else {
        expect(value, keyOf(row, PROJECTIONS_GRAIN)).toBeNull();
      }
    }
  });

  it("contains a real zero in each fixture", () => {
    // The counterpart to the rule above: zero has to appear as data somewhere,
    // or "unavailable is not zero" is untested in the direction that matters.
    expect(PROJECTIONS_ROWS.some((row) => row.Population === 0)).toBe(true);
    expect(COMPONENTS_OF_CHANGE_ROWS.some((row) => row.value === 0)).toBe(true);
  });

  it("contains aggregate rows beside their components", () => {
    const roles = PROJECTIONS_DIMENSION_ROLES["Age Group"];
    const ages = new Set(PROJECTIONS_ROWS.map((row) => row["Age Group"]));
    expect([...ages].some((age) => roles[age] === "aggregate")).toBe(true);
    expect([...ages].filter((age) => roles[age] === "component").length).toBeGreaterThan(1);
  });

  it("contains two sources in each fixture", () => {
    expect(new Set(PROJECTIONS_ROWS.map((row) => row.Source)).size).toBe(2);
    expect(new Set(COMPONENTS_OF_CHANGE_ROWS.map((row) => row.Source)).size).toBe(2);
  });

  it("contains the three unit families Components of Change needs", () => {
    const units = new Set(
      Object.values(COMPONENTS_OF_CHANGE_MEASURES).map((measure) => measure.unit),
    );
    expect([...units].sort()).toEqual(["count", "people", "ratePerThousand"]);
  });

  it("contains a ranking tie and a zero base", () => {
    const births2025 = COMPONENTS_OF_CHANGE_ROWS.filter(
      (row) => row.measureId === "Births" && row.Year === 2025 && row.status === "available",
    ).map((row) => row.value);
    expect(new Set(births2025).size).toBeLessThan(births2025.length);

    const zeroBase = find(COMPONENTS_OF_CHANGE_ROWS, {
      measureId: "Total Population",
      Year: 2020,
      Location: "Alpine",
    });
    expect(zeroBase.value).toBe(0);
  });

  it("declares a reporting period that is not the last available one", () => {
    for (const [name, time] of [
      ["projections", PROJECTIONS_TIME],
      ["components of change", COMPONENTS_OF_CHANGE_TIME],
    ]) {
      expect(time.availablePeriods, name).toContain(time.defaultReportingPeriod);
    }
    // The whole point of the Projections default: the horizon is a forecast,
    // not a starting point.
    expect(PROJECTIONS_TIME.defaultReportingPeriod).toBe(2025);
    expect(Math.max(...PROJECTIONS_TIME.availablePeriods)).toBe(2030);
    expect(PROJECTIONS_TIME.defaultReportingPeriod).not.toBe(
      Math.max(...PROJECTIONS_TIME.availablePeriods),
    );
  });
});

describe("hand-calculated expectations", () => {
  const sfLatina = (year) =>
    find(PROJECTIONS_ROWS, {
      Year: year,
      Location: "San Francisco",
      "Race/Ethnicity": "Hispanic",
      Sex: "Female",
      "Age Group": "All Ages",
      Source: "DoF P-3",
    }).Population;

  it("contains known hand-calculated expected results", () => {
    const expected = PROJECTIONS_EXPECTED.sfLatinaWomen;

    expect([2020, 2025, 2030].map(sfLatina)).toEqual([
      expected.actual[2020],
      expected.actual[2025],
      expected.actual[2030],
    ]);
    expect(sfLatina(2025) - sfLatina(2020)).toBe(expected.numericChange2020to2025);
    expect(((sfLatina(2025) - sfLatina(2020)) / sfLatina(2020)) * 100).toBe(
      expected.percentChange2020to2025,
    );
    for (const year of [2020, 2025, 2030]) {
      expect((sfLatina(year) / sfLatina(2020)) * 100, String(year)).toBe(
        expected.indexedToBase2020[year],
      );
    }
    expect((sfLatina(2020) + sfLatina(2025) + sfLatina(2030)) / 3).toBe(
      expected.averageOfAllThreeYears,
    );
  });

  it("keeps the age-component sums honest", () => {
    const component = (age, race = "Hispanic", sex = "Female") =>
      find(PROJECTIONS_ROWS, {
        Year: 2025,
        Location: "San Francisco",
        "Race/Ethnicity": race,
        Sex: sex,
        "Age Group": age,
        Source: "DoF P-3",
      }).Population;

    expect(component("0-4") + component("5-9")).toBe(
      PROJECTIONS_EXPECTED.sfLatinaWomenAgeComponentSum2025,
    );
    // The stored aggregate is not the sum of the two bins, which is what makes
    // "do not add All Ages to age components" a real test.
    expect(PROJECTIONS_EXPECTED.sfLatinaWomenAgeComponentSum2025).not.toBe(sfLatina(2025));

    expect(component("0-4", "AIAN", "Male") + component("5-9", "AIAN", "Male")).toBe(
      PROJECTIONS_EXPECTED.sfAianMenAgeComponentSum2025,
    );
  });

  it("keeps the Components of Change expectations honest", () => {
    const value = (measureId, location, year, source = "DoF") =>
      find(COMPONENTS_OF_CHANGE_ROWS, { measureId, Location: location, Year: year, Source: source })
        .value;

    const fresno = COMPONENTS_OF_CHANGE_EXPECTED.fresnoTotalPopulation;
    expect(value("Total Population", "Fresno", 2025) - value("Total Population", "Fresno", 2020)).toBe(
      fresno.numericChange2020to2025,
    );
    expect(
      value("Crude Birth Rate", "Fresno", 2025) - value("Crude Birth Rate", "Fresno", 2020),
    ).toBe(COMPONENTS_OF_CHANGE_EXPECTED.fresnoCrudeBirthRate.percentagePointChange2020to2025);

    const weighted =
      (value("Crude Birth Rate", "Fresno", 2025) * value("Total Population", "Fresno", 2025) +
        value("Crude Birth Rate", "Kern", 2025) * value("Total Population", "Kern", 2025)) /
      (value("Total Population", "Fresno", 2025) + value("Total Population", "Kern", 2025));
    expect(weighted).toBe(COMPONENTS_OF_CHANGE_EXPECTED.fresnoKernWeightedCrudeBirthRate2025);
    // The unweighted mean is a different number, which is the reason a rate
    // never gets a plain average.
    expect(weighted).not.toBe(
      (value("Crude Birth Rate", "Fresno", 2025) + value("Crude Birth Rate", "Kern", 2025)) / 2,
    );

    expect(value("Births", "Fresno", 2025) + value("Births", "Kern", 2025)).toBe(
      COMPONENTS_OF_CHANGE_EXPECTED.fresnoKernBirths2025,
    );
  });

  it("orders the ranking expectations the way a stable tie-break would", () => {
    const available = COMPONENTS_OF_CHANGE_ROWS.filter(
      (row) => row.measureId === "Births" && row.Year === 2025 && row.status === "available",
    );
    const ordered = [...available]
      .sort((a, b) => b.value - a.value || a.Location.localeCompare(b.Location))
      .map((row) => row.Location);

    expect(ordered).toEqual([...COMPONENTS_OF_CHANGE_EXPECTED.rankedOrderBirths2025]);
    expect(ordered.slice(0, 2)).toEqual([...COMPONENTS_OF_CHANGE_EXPECTED.topTwoBirths2025]);
    expect(
      available.map((row) => row.Location),
    ).not.toContain(COMPONENTS_OF_CHANGE_EXPECTED.unrankedBirths2025[0]);
  });
});
