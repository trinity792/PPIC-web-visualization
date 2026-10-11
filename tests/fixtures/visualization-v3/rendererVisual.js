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
  // Scatter layouts (renderer plan J, 2026-10-05): the owner's reference
  // scatter, values read off the published image, one pasted row per region.
  if(["reference-regions", "reference-regions-fit", "reference-bubbles"].includes(scenario)) {
    const regions = [["Central Valley and Sierra", 0.735, 122.2, 2.9], ["Bay Area", 1.245, 105.0, 4.1], ["Inland Empire", 0.813, 100.5, 1.8], ["Central Coast", 0.831, 96.3, 0.7], ["Northern", 0.784, 92.7, 0.5], ["Sacramento Area", 1.096, 85.8, 1.1], ["Orange County", 1.142, 85.1, 1.7], ["Los Angeles County", 0.975, 83.8, 4.6], ["San Diego County", 1.019, 80.3, 1.5]];
    Object.assign(fixture, {
      comparisons: [comparisons[0]],
      observations: regions.flatMap(([name, lq, hhi, jobs], i) => [
        ["y", "HHI", hhi], ["x", "LQ_Q5", lq], ["size", "Jobs", jobs],
      ].map(([role, measureId, value]) => ({ ...lineRows[0], period: 2024, geographyId: `region-${i}`, geographyLabel: name, categoryId: name, categoryLabel: name, measureId, measureLabel: measureId, value, ...(role === "y" ? {} : { measureRole: role }) }))),
      labels: { title: "Relating HHI to LQ of most exposed quintile, 2024", xAxis: "LQ_Q5", yAxis: "HHI", footnote: "" },
      appearance: { horizontalNumberType: "number", decimalPlaces: 2, fitAxes: scenario !== "reference-regions" },
    });
    if(scenario === "reference-bubbles") fixture.chartType = "bubble";
  }
  // Dot plot layouts (renderer plan G, 2026-10-05): five dots per row, as the
  // business-regulations references draw them, and dots per period.
  if(scenario === "five-dots") {
    const regions = ["Bay Area", "Central Coast", "Far North", "Inland Empire", "Los Angeles (Regional)", "Sacramento (Regional)"];
    const stats = [["min", "Minimum", "Navy"], ["q1", "First quartile", "Blue"], ["median", "Median", "Orange"], ["q3", "Third quartile", "Lime"], ["max", "Maximum", "Violet"]];
    fixture.comparisons = stats.map(([id, label, color]) => ({ id, label, color }));
    fixture.observations = regions.flatMap((name, i) => stats.map(([id, label], j) => ({ ...lineRows[0], period: 2025, geographyId: `region-${i}`, geographyLabel: name, comparisonId: id, comparisonLabel: label, value: 20 + i * 3 + j * (8 + i) })));
  }
  if(scenario === "dots-by-period") Object.assign(fixture, { comparisons: [comparisons[0]], observations: observations.filter(r => r.comparisonId === "latina"), appearance: { showPointLabels: true } });
  if(["studies", "studies-dots", "studies-centered"].includes(scenario)) {
    // Five studies of an odds ratio, against a line of no effect at 1.
    const studies = [["Smith 2019", 1.32, 1.05, 1.66], ["Garcia 2020", 0.91, 0.70, 1.18], ["Nguyen 2021", 1.12, 0.98, 1.28], ["Okafor 2022", 1.48, 1.10, 1.99], ["Lee 2023", 0.84, 0.62, 1.14]];
    const parts = [["estimate", 1], ["lowerBound", 2], ["upperBound", 3]];
    fixture.comparisons = [comparisons[0]];
    fixture.observations = studies.flatMap((study, i) => parts.map(([measureRole, at]) => ({ ...lineRows[0], period: 2025, categoryId: `study-${i}`, categoryLabel: study[0], measureRole, value: study[at] })));
    fixture.appearance = { noEffectValue: 1, decimalPlaces: 2,
      ...(scenario === "studies-dots" ? { endpointStyle: "dots", pointStyle: "diamond", showPointLabels: true } : {}),
      ...(scenario === "studies-centered" ? { center: 1, endpointStyle: "diamonds", pointStyle: "dot" } : {}) };
  }
  return fixture;
}
