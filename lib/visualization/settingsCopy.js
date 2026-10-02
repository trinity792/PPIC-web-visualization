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
  showSource: Object.freeze({
    purpose: "Show or hide the gray box under the chart that cites the data source and any footnote.",
  }),
  dashedRange: Object.freeze({
    purpose: "Draw a line chart's lines dashed between two chosen periods, such as projected years.",
  }),
  showValueLabels: Object.freeze({
    purpose: "Write each bar's value on or just past the bar.",
  }),
  valueLabelSeries: Object.freeze({
    purpose: "Label every series, or only one, for example only the latest year.",
  }),
  valueLabelPosition: Object.freeze({
    purpose: "Put value labels inside or outside the bars; Automatic chooses, and moves a label that does not fit.",
  }),
  showStackTotals: Object.freeze({
    purpose: "Write each stacked bar's total just past the end of the stack.",
  }),
  barSort: Object.freeze({
    purpose: "Order bars as the data arrives, largest first, or smallest first. Dragging locations sets a custom order instead.",
  }),
  rangeStyle: Object.freeze({
    purpose: "Draw each range as two dots joined by a light bar, or as an arrow from the first period to the second.",
  }),
  valueAxisPosition: Object.freeze({
    purpose: "Put the range chart's value axis below the rows or above them.",
  }),
  pointLabelEnds: Object.freeze({
    purpose: "Write the values at both ends of each range, or only at the start or the end.",
  }),
  seriesOrder: Object.freeze({
    purpose: "Drag the series (such as years) into the order their bars take within each group, and up a stack.",
  }),
  categoryAxis: Object.freeze({
    purpose: "Draw one bar per location, or one bar per period along the axis.",
  }),
  barColorBy: Object.freeze({
    purpose: "With several comparisons and several periods, color bars by comparison or by period and group the other inside each location.",
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
