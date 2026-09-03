export const SETTINGS_COPY = Object.freeze({
  outcome: Object.freeze({
    purpose: "Select the measure that every comparison uses.",
  }),
  calculation: Object.freeze({
    purpose: "Select how the service expresses the outcome, such as an actual value or a change.",
  }),
  time: Object.freeze({
    purpose: "Select the reporting periods that answer the question.",
  }),
  comparisons: Object.freeze({
    purpose: "Define up to 10 populations that use the same outcome.",
  }),
  comparisonPresentation: Object.freeze({
    purpose: "Show loaded comparisons together or in tabs without changing the question.",
  }),
  ranking: Object.freeze({
    purpose: "Limit the display to the highest or lowest calculated values.",
  }),
  benchmarkDifference: Object.freeze({
    purpose: "Subtract an aligned benchmark value from each observation.",
  }),
  seriesBinding: Object.freeze({
    purpose: "Assign an imported dimension to a renderer's series role.",
  }),
  comparisonLegendLabel: Object.freeze({
    purpose: "Replace a comparison's derived legend label with approved display text.",
  }),
  comparisonColor: Object.freeze({
    purpose: "Keep an official PPIC color attached to one stable comparison id.",
  }),
  comparisonVisibility: Object.freeze({
    purpose: "Hide a comparison from the chart without removing its data.",
  }),
  customDivergingStops: Object.freeze({
    purpose: "Select approved shades for a diverging value scale.",
  }),
  hideXAxis: Object.freeze({
    purpose: "Hide the horizontal axis when its labels are not needed.",
  }),
  comparisonGeographyOverride: Object.freeze({
    purpose: "Use a different geography for one Advanced Mode comparison.",
  }),
  comparisonTimeOverride: Object.freeze({
    purpose: "Use different periods for one Advanced Mode comparison.",
  }),
});
