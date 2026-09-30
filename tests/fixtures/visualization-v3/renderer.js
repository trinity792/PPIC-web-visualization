/** Renderer-plan inputs, derived from the shared observations, not live APIs.
 * New-module tests deliberately specify a proposed API: named build*Model
 * functions take adaptObservations inputs; models expose drawing instructions,
 * not a copy of appearance. Components take { model, width, height }.
 * data-mark/data-axis hooks identify SVG marks without depending on visx internals.
 */
import { PROJECTIONS_ROWS } from "./projections";
export const VISX_TYPES = ["line", "bar", "dumbbell", "dotPlot", "forest", "heatmap", "scatter", "bubble", "pie"];
export const MAP_TYPES = ["choroplethMap", "symbolMap"];
export const comparisons = [
  { id: "latina", label: "Latina Women", color: "Orange" },
  { id: "white", label: "White Women", color: "Navy" },
  { id: "black", label: "Black Women", color: "Violet" },
];
const races = { Hispanic: comparisons[0], White: comparisons[1], Black: comparisons[2] };
export const observations = PROJECTIONS_ROWS.filter(r => r.Source === "DoF P-3" && r.Sex === "Female" && r["Age Group"] === "All Ages" && r.Location !== "California").map(r => ({
  comparisonId: races[r["Race/Ethnicity"]].id,
  comparisonLabel: races[r["Race/Ethnicity"]].label,
  measureId: "Population", measureLabel: "Population", unit: "people",
  geographyId: r.Location === "San Francisco" ? "06075" : "06037",
  geographyLabel: r.Location, categoryId: null, categoryLabel: null,
  period: r.Year, value: r.Population, status: r.status, valueKind: r.valueKind,
  calculation: { id: "actual", params: {} }, includedPeriods: null, source: r.Source,
}));
export const lineRows = observations.filter(r => r.geographyId === "06075" && r.comparisonId !== "black");
export const gapRows = observations.filter(r => r.comparisonId === "black");
export const categoryRows = PROJECTIONS_ROWS.filter(r => r.Source === "DoF P-3" && r.Location === "San Francisco" && r.Sex === "Female" && r["Race/Ethnicity"] === "Hispanic" && r["Age Group"] !== "All Ages").map(r => ({
  ...lineRows[0], period: r.Year, categoryId: r["Age Group"], categoryLabel: r["Age Group"],
  value: r.Population, status: r.status, valueKind: r.valueKind,
}));
export const forestRows = lineRows.slice(0, 3).map((r, i) => ({
  ...r, period: 2025, categoryId: "estimate", categoryLabel: "Latina Women",
  measureRole: ["lowerBound", "estimate", "upperBound"][i],
}));
export const pointRows = [
  { ...lineRows[0], xValue: 10, yValue: 40000, sizeValue: 100 },
  { ...lineRows[1], xValue: 20, yValue: 50000, sizeValue: 400 },
];
export const geometry = { type: "FeatureCollection", features: [
  { type: "Feature", properties: { GEOID: "06075" }, geometry: { type: "Polygon", coordinates: [[[-123,37],[-122,37],[-122,38],[-123,37]]] } },
  { type: "Feature", properties: { GEOID: "06037" }, geometry: { type: "Polygon", coordinates: [[[-119,34],[-118,34],[-118,35],[-119,34]]] } },
] };
export function input(chartType = "line", overrides = {}) {
  let rows = lineRows;
  if (["bar", "dotPlot", "choroplethMap", "symbolMap"].includes(chartType)) rows = observations.filter(r => r.period === 2025 && r.comparisonId !== "black");
  if (["heatmap", "pie"].includes(chartType)) rows = categoryRows;
  if (chartType === "forest") rows = forestRows;
  if (["scatter", "bubble"].includes(chartType)) rows = pointRows;
  return {
    chartType, observations: rows, comparisons: comparisons.slice(0, 2), periods: [2020, 2025, 2030],
    labels: { title: "Population", subtitle: "Selected counties", xAxis: "Year", yAxis: "People", footnote: "Estimates may be revised." },
    appearance: {}, format: {},
    presentation: { comparisonPresentation: ["heatmap", "choroplethMap", "symbolMap"].includes(chartType) ? "tabs" : "combined", activeTab: "latina", activePeriod: 2025 },
    geometry: chartType === "symbolMap" ? { geojson: geometry, points: { "06075": [-122.44,37.76], "06037": [-118.24,34.05] } } : geometry,
    ...overrides,
  };
}
export const schema = {
  id: "demographicProjections", label: "Projections", sources: ["DoF P-3"],
  subsets: { Counties: ["County"] }, comparisonDimensions: [],
  fields: { Year: { kind: "temporal", label: "Year" }, Population: { kind: "measure", label: "Population", unit: "people" }, Location: { kind: "dimension", label: "Location" } },
};
export function config(chartType = "line", appearance = {}) {
  return {
    version: 3,
    question: {
      dataset: { kind: "module", moduleId: "demographicProjections" }, source: "DoF P-3",
      outcome: { measureId: "Population" }, geography: { subset: "Counties", locations: ["San Francisco", "Los Angeles"] },
      time: { contract: "range", startYear: 2020, endYear: 2030 }, calculation: { id: "actual", params: {} },
      comparisons: [{ id: "latina", dimensions: {}, customLabel: "Latina Women", color: "Orange" }],
    },
    presentation: { chartType, labels: input().labels, appearance, bindings: { x: "Year", y: "Population" } },
    seriesNames: ["Latina Women", "White Women"], categoryNames: ["0-4", "5-9", "10-14"],
    availablePeriods: [2020, 2025, 2030], observations: lineRows,
  };
}
