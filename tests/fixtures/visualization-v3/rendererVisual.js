/** Test-only scenarios for the future renderer-aware visual fixture route.
 * Query contract: ?chart=<type>&renderer=<library>&scenario=<name>&width=<px>.
 * The route must pass this input to the requested renderer, size ChartFrame to
 * width, and expose data-scenario on visual-fixture-plot. No baseline is approved.
 */
import { input, observations, lineRows, comparisons } from "./renderer";
export function rendererVisualScenario(chartType, scenario = "default") {
  const fixture = input(chartType);
  if(scenario === "two-lines") return input("line");
  if(scenario === "five-lines") return input("line", { observations: observations.filter(r => !(r.comparisonId === "black" && r.geographyId === "06037")), comparisons });
  if(scenario === "dashed") fixture.appearance.dashedRange = { from: 2025, to: 2030, label: "Projected" };
  if(scenario === "frame") fixture.labels.eyebrow = "Figure 2";
  if(scenario === "horizontal") fixture.appearance.orientation = "horizontal";
  if(scenario === "stacked") fixture.appearance.stackMode = "stacked";
  if(scenario === "diverging") Object.assign(fixture.appearance, { diverging: true, center: 60000, referenceValue: 60000, referenceLabel: "Benchmark", trackRail: true });
  if(scenario === "eight-comparisons") {
    fixture.comparisons = ["Group A", "Group B", "Group C", "Group D", "Group E", "Group F", "Group G", "Group H"].map((label,i) => ({ id: `comparison-${i}`, label }));
    fixture.observations = fixture.comparisons.map((c,i) => ({ ...lineRows[i % 6], period: 2025, comparisonId: c.id, comparisonLabel: c.label }));
  }
  // Bar layouts from the PPIC references (renderer plan E, 2026-09-30).
  const twoPeriods = () => observations.filter(r => r.comparisonId !== "black" && [2020, 2025].includes(r.period));
  if(scenario === "values-inside-outside") fixture.appearance.showValueLabels = true;
  if(scenario === "percent-nested") {
    fixture.observations = twoPeriods();
    Object.assign(fixture.appearance, { orientation: "horizontal", stackMode: "percent", barColorBy: "comparison", showValueLabels: true });
  }
  if(scenario === "fifty-categories") {
    fixture.comparisons = [comparisons[0]];
    fixture.observations = Array.from({ length: 50 }, (_, i) => ({ ...fixture.observations[0], geographyId: `state-${i}`, geographyLabel: `S${String(i).padStart(2, "0")}`, value: 1000 + ((i * 37) % 50) * 400 }));
    fixture.appearance.sort = "descending";
  }
  if(scenario === "negative-nested") {
    fixture.observations = twoPeriods().map(r => ({ ...r, value: r.comparisonId === "white" ? -r.value / 40 : r.value / 40 }));
    Object.assign(fixture.appearance, { barColorBy: "period", showValueLabels: true, valueLabelSeries: { "2020": false, "2025": true } });
  }
  if(scenario === "nine-regions") {
    const regions = ["Bay Area", "Central Coast", "Far North", "Inland Empire", "Los Angeles (Regional)", "North San Joaquin Valley", "Sacramento (Regional)", "San Diego (Regional)", "South San Joaquin Valley"];
    const totals = [7700000, 1500000, 1250000, 4700000, 13900000, 1650000, 2450000, 3500000, 2950000];
    fixture.comparisons = [comparisons[0]];
    fixture.observations = regions.map((name, i) => ({ ...fixture.observations[0], geographyId: `region-${i}`, geographyLabel: name, value: totals[i] }));
  }
  if(scenario === "stacked-direct") Object.assign(fixture.appearance, { stackMode: "stacked", legendPosition: "automatic", showStackTotals: true });
  // Range layouts (renderer plan F, 2026-10-01).
  if(scenario === "grouped-rows") Object.assign(fixture, { observations: observations.filter(r => r.comparisonId !== "black"), periods: [2020, 2030] });
  if(scenario === "point-values") Object.assign(fixture, { observations: observations.filter(r => r.comparisonId === "latina" || (r.comparisonId === "white" && r.geographyId === "06037")), comparisons, periods: [2020, 2030], appearance: { showPointLabels: true } });
  if(scenario === "arrows") Object.assign(fixture, { observations: observations.filter(r => r.comparisonId !== "black"), periods: [2020, 2030], appearance: { rangeStyle: "arrow", showPointLabels: true, pointLabelEnds: "end", valueAxisPosition: "top" } });
  if(scenario === "long-rows") fixture.observations = lineRows.slice(0,3).map(r => ({ ...r, categoryId: "long", categoryLabel: "San Francisco residents aged sixty five and older" }));
  if(scenario === "long-slice") fixture.observations = fixture.observations.map(r => ({ ...r, categoryLabel: r.categoryId === "0-4" ? "Residents aged zero through four years in San Francisco" : r.categoryLabel }));
  return fixture;
}
