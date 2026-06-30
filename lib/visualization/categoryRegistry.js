/**
 * Landing-page categories and built-in deep-link views.
 * These are declarative chart configs, never rendered Plotly figures.
 */

export const BUILT_IN_VIEWS = Object.freeze({
  "population-trend": {
    version: 1,
    module: "pophousing",
    preset: "trend-over-time",
    chartType: "line",
    bindings: {
      x: "Year",
      y: "Total Population",
      series: "Location",
    },
    filters: { subset: "Regions" },
    period: {},
    labels: {
      title: "California population trends",
      subtitle: "Population estimates by region",
      xAxis: "Year",
      yAxis: "Residents",
    },
    transform: "actual",
    appearance: { markerMode: "auto", legendPosition: "bottom" },
    referenceLines: [],
    layers: [],
  },
  "housing-trend": {
    version: 1,
    module: "pophousing",
    preset: "trend-over-time",
    chartType: "line",
    bindings: {
      x: "Year",
      y: "Total Housing Units",
      series: "Location",
    },
    filters: { subset: "Regions" },
    period: { baseYear: 2000 },
    labels: {
      title: "Housing growth by region",
      subtitle: "Indexed comparison of total housing units",
      xAxis: "Year",
      yAxis: "Index (base year = 100)",
    },
    transform: "indexed",
    appearance: { markerMode: "off", legendPosition: "bottom" },
    referenceLines: [],
    layers: [],
  },
  "county-population-ranking": {
    version: 1,
    module: "pophousing",
    preset: "compare-places",
    chartType: "bar",
    bindings: { category: "Location", y: "Total Population" },
    filters: { subset: "Counties", topN: 15 },
    period: {},
    labels: {
      title: "Largest California counties",
      subtitle: "Latest available population estimate",
      xAxis: "Residents",
      yAxis: "County",
    },
    transform: "actual",
    appearance: {
      orientation: "horizontal",
      sort: "value",
      showValueLabels: true,
      legendPosition: "hidden",
    },
    referenceLines: [],
    layers: [],
  },
  "county-population-map": {
    version: 1,
    module: "pophousing",
    preset: "geographic-pattern",
    chartType: "choroplethMap",
    bindings: {
      geography: "Location",
      color: "Total Population",
    },
    filters: { subset: "Counties" },
    period: {},
    labels: {
      title: "Population across California counties",
      subtitle: "Latest available estimate",
    },
    transform: "actual",
    appearance: {
      colorScale: "sequential",
      showBoundaries: true,
      legendPosition: "right",
    },
    referenceLines: [],
    layers: [],
  },
  "migration-trend": {
    version: 1,
    module: "components-of-change",
    preset: "trend-over-time",
    chartType: "line",
    bindings: {
      x: "Year",
      y: "Net Domestic Migration",
      series: "Location",
    },
    filters: { subset: "Regions", source: "DoF" },
    period: {},
    labels: {
      title: "Net domestic migration",
      subtitle: "California regions, Department of Finance estimates",
      xAxis: "Year",
      yAxis: "People",
    },
    transform: "actual",
    appearance: { markerMode: "auto", legendPosition: "bottom" },
    referenceLines: [{ type: "horizontal", value: 0, label: "No net migration" }],
    layers: [],
  },
  "population-area": {
    version: 1,
    module: "pophousing",
    preset: "trend-over-time",
    chartType: "line",
    bindings: { x: "Year", y: "Total Population", series: "Location" },
    filters: { subset: "Regions" },
    period: {},
    labels: {
      title: "Population by region",
      subtitle: "Stacked regional population over time",
      xAxis: "Year",
      yAxis: "Residents",
    },
    transform: "actual",
    appearance: { area: true, markerMode: "off", legendPosition: "bottom" },
    referenceLines: [],
    layers: [],
  },
  "persons-per-household-map": {
    version: 1,
    module: "pophousing",
    preset: "geographic-pattern",
    chartType: "choroplethMap",
    bindings: { geography: "Location", color: "Persons Per Household" },
    filters: { subset: "Counties" },
    period: {},
    labels: {
      title: "Persons per household by county",
      subtitle: "Latest available estimate",
    },
    transform: "actual",
    appearance: {
      colorScale: "sequential",
      showBoundaries: true,
      legendPosition: "right",
    },
    referenceLines: [],
    layers: [],
  },
});

export const CATEGORIES = Object.freeze([
  {
    id: "population-housing",
    title: "California Population & Housing Trends",
    description:
      "Explore population, housing supply, vacancy, migration, births, and deaths across California.",
    modulePath: "/pophousing",
    status: "live",
    // Landing layout: two chart tiles (area + map), a stat-card row, then a
    // chart tile + the region table (see app/page.js).
    previews: [
      { id: "population-area", modulePath: "/pophousing" },
      { id: "persons-per-household-map", modulePath: "/pophousing" },
      { id: "migration-trend", modulePath: "/components-of-change" },
    ],
  },
  {
    id: "economics",
    title: "California Economy",
    description: "Economic indicators and regional labor-market trends.",
    status: "coming-soon",
    previews: [],
  },
  {
    id: "state-law",
    title: "California State Law",
    description: "Legislative and policy data modules.",
    status: "coming-soon",
    previews: [],
  },
  {
    id: "climate",
    title: "Climate Change",
    description: "Climate exposure and environmental indicators.",
    status: "coming-soon",
    previews: [],
  },
]);

export function getBuiltInView(viewId) {
  return BUILT_IN_VIEWS[viewId];
}
