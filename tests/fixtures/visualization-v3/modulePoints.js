/**
 * Workstream Q: a module's scatter/bubble response, one row per measure.
 * Population is the y measure (untagged), Households is x, Median Rent is
 * size. Marin's horizontal value is suppressed, so it can be drawn nowhere.
 * Values are typed by hand so tests state what they expect.
 */
const common = {
  comparisonId: "latina",
  comparisonLabel: "Latina Women",
  categoryId: null,
  categoryLabel: null,
  period: 2025,
  valueKind: "observed",
  calculation: { id: "actual", params: {} },
  includedPeriods: null,
  source: "ACS",
};

function row(county, measureId, measureLabel, unit, value, measureRole) {
  return {
    ...common,
    geographyId: county,
    geographyLabel: county,
    measureId,
    measureLabel,
    unit,
    value,
    status: value === null ? "suppressed" : "available",
    ...(measureRole ? { measureRole } : {}),
  };
}

export const moduleScatterRows = [
  row("San Francisco", "Population", "Population", "people", 40000),
  row("San Francisco", "Households", "Households", "number", 10, "x"),
  row("San Francisco", "MedianRent", "Median Rent", "dollars", 100, "size"),
  row("Los Angeles", "Population", "Population", "people", 50000),
  row("Los Angeles", "Households", "Households", "number", 20, "x"),
  row("Los Angeles", "MedianRent", "Median Rent", "dollars", 400, "size"),
  row("Marin", "Population", "Population", "people", 30000),
  row("Marin", "Households", "Households", "number", null, "x"),
  row("Marin", "MedianRent", "Median Rent", "dollars", 200, "size"),
];
