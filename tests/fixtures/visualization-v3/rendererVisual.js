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
  if(scenario === "long-rows") fixture.observations = lineRows.slice(0,3).map(r => ({ ...r, categoryId: "long", categoryLabel: "San Francisco residents aged sixty five and older" }));
  if(scenario === "long-slice") fixture.observations = fixture.observations.map(r => ({ ...r, categoryLabel: r.categoryId === "0-4" ? "Residents aged zero through four years in San Francisco" : r.categoryLabel }));
  return fixture;
}
