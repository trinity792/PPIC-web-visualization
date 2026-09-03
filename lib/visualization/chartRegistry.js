/**
 * Chart-type registry: one descriptor per chart type.
 *
 * CLIENT-SAFE (no node:fs). Each descriptor encodes the per-type requirement
 * tables from `docs/PPIC Summer 2026/trinitys_notes/main.md` ("What each graph
 * type needs"): which encoding roles are required vs optional, which field kinds
 * each role accepts (`roleConstraints`), which sidebar sections the editor should
 * render (`sidebarSections`), sensible `defaults`, and the soft `limits` the
 * validator uses to recommend a better chart when complexity gets out of hand.
 *
 * This registry is descriptive only — it holds no rendering logic. Renderers in
 * `components/charts/*` and the validator in `validation.js` read from it.
 */

import { CHART_ROLES, FIELD_KINDS } from "./fieldTypes";

const { TEMPORAL, DIMENSION, MEASURE } = FIELD_KINDS;

/**
 * Maps an encoding/binding role to the catalog `chartRole` a measure must
 * support to fill it (see `field.chartRoles`). Used by the validator and the
 * encoding sidebar to filter which measures are offered for a given role.
 */
export const CATALOG_ROLE_FOR_BINDING = Object.freeze({
  x: CHART_ROLES.X_MEASURE,
  y: CHART_ROLES.Y_MEASURE,
  start: CHART_ROLES.Y_MEASURE,
  end: CHART_ROLES.Y_MEASURE,
  size: CHART_ROLES.SIZE,
  color: CHART_ROLES.COLOR,
});

/**
 * The shapes `PreviewPane.js`'s idle/unconfigured skeleton can draw (Workstream
 * C). Every descriptor below declares one via `skeletonShape`, so a chart type
 * that forgets to is caught by `chartRegistry.catalog.test.js` rather than
 * silently rendering as a bar.
 *
 * Each shape is a scaled-up Lucide icon, except `map` — the two map types draw
 * a greyed-out California county outline (`charts/CaliforniaCountiesOutline.js`)
 * so a map waits behind something recognizably this state rather than a generic
 * pin. The shape → icon binding lives in PreviewPane.js, not here: this registry
 * is descriptive only and must not import components.
 */
export const SKELETON_SHAPES = Object.freeze([
  "bars", // vertical columns (a bar at its vertical default)
  "barsHorizontal", // horizontal bars (a bar flipped by orientation)
  "line", // trend across an ordered sequence
  "gantt", // a span per category — the Range family's two endpoints
  "ganttNoAxes", // spans without axis chrome — the forest plot's intervals
  "scatter", // points on a two-measure plane (scatter, bubble, dot plot)
  "grid", // a cell matrix (heatmap)
  "map", // the California county outline, not an icon
  "pie", // a ring (pie/donut)
  "table", // a header bar over rows (data table)
]);

/**
 * How a chart type turns the active palette into colour. Every descriptor must
 * declare one, which is what lets `chartRegistry.catalog.test.js` enforce the
 * question exhaustively rather than a `scaleDriven?` boolean that a new chart
 * type could simply omit.
 *
 * `palettes.js`'s `paletteKindFor` reads this to decide which palettes the
 * picker offers and whether a ramp is in play at all; before it existed,
 * `AppearanceSection` answered from a hard-coded list of chart-type ids, so a
 * new scale-driven type would silently have been given categorical palettes.
 */
export const COLOR_ENCODINGS = Object.freeze([
  "none", // no marks to colour (data table)
  "categorical", // a cycled palette colour per series/slice/category
  "scale", // the colour IS the plotted value (choropleth, heatmap)
  "conditional-scale", // categorical until a config flag turns on a ramp (symbol map)
]);

/**
 * roleConstraints values are arrays of acceptable field kinds for that role.
 * `requiredRoles` must all be bound; `optionalRoles` may be bound.
 */
export const CHART_TYPES = Object.freeze({
  line: {
    id: "line",
    colorEncoding: "categorical",
    label: "Line",
    purpose: "Change across an ordered sequence, usually years.",
    // Whether a change/indexed transform is meaningful for this chart type
    // (gates the Comparison section's Transform control — flagged issue 1).
    transformCapable: true,
    rankingCapable: true,
    lineAxes: ["horizontal", "vertical"],
    requiredRoles: ["x", "y"],
    // Workstream D: `benchmark` is deleted — nothing ever read it (the
    // standalone tool's benchmark comparison is a `type: "benchmark"` trace
    // layer, unrelated to this role). `series` stays, but is gated behind
    // Advanced Mode on a module (OutcomeSection.js) since it's inert there.
    optionalRoles: ["series", "color"],
    // Color is still an encoding binding; only its editor control lives with
    // the palette and other visual styling instead of in Outcome.
    colorBindingSection: "appearance",
    roleConstraints: {
      // Workstream D widened this to [TEMPORAL, DIMENSION] on the reasoning
      // that an ordered dimension (e.g. Age group) is a legitimate line x, the
      // way `heatmap` declares the same pair. Reverted, because nothing
      // downstream honours it and it cost a working diagnostic:
      //
      //   - Pasted data: `buildLineShape` (lib/tabular/toSeries.js) coerces the
      //     x column through `numberCell` into `Year`, so a text column yields
      //     all-null years and draws an empty chart. Widening also made
      //     `inlineRenderBlock` treat a mistyped year column as fillable, which
      //     suppressed the "retype it as Date" hint that actually fixes it.
      //   - Modules: every schema declares exactly one temporal field, so
      //     `impliedRoles.x` always resolves and this dropdown never renders;
      //     and `buildSearchParams` never sends `bindings.x` for the line view.
      //
      // The agreed rule for reintroducing it: a DIMENSION is acceptable here
      // only in module mode, and only for a dimension the schema marks as
      // intentionally ordered. The standalone tool stays temporal-only. That
      // needs three things first — an `ordered` marker on the field, an
      // `impliedRoles` path that yields a real dropdown, and a line view that
      // accepts a non-temporal x.
      x: [TEMPORAL],
      y: [MEASURE],
      series: [DIMENSION],
      color: [DIMENSION],
    },
    // A time series is always x = time by convention, so the Outcome section
    // infers x from the schema's temporal field rather than asking (Workstream A).
    impliedRoles: { x: "temporal" },
    skeletonShape: "line",
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: { transform: "actual", markerMode: "auto", legendPosition: "right", area: false },
    limits: { minPeriods: 2 },
  },

  bar: {
    id: "bar",
    // A diverging bar takes its above/below pair from the palette's first two
    // tokens; a plain one cycles by series.
    colorEncoding: "categorical",
    label: "Bar",
    purpose: "Compare values across discrete categories, places, or periods.",
    transformCapable: true,
    rankingCapable: true,
    lineAxes: ["horizontal", "vertical"],
    requiredRoles: ["category", "y"],
    optionalRoles: ["group", "color"],
    colorBindingSection: "appearance",
    roleConstraints: {
      // Workstream D: a bar per year (a temporal field) is an ordinary chart,
      // not just a bar per place/dimension.
      category: [DIMENSION, TEMPORAL],
      y: [MEASURE],
      group: [DIMENSION],
      color: [DIMENSION],
    },
    // A bar's category is always the geographic level already chosen above it,
    // so the Outcome section infers it rather than asking a second time
    // (Workstream A; this is what used to be the duplicate Category dropdown).
    impliedRoles: { category: "geography" },
    // Vertical bars by default; `skeletonShapeFor` in PreviewPane.js flips this
    // to "barsHorizontal" when `appearance.orientation === "horizontal"`.
    skeletonShape: "bars",
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: {
      stackMode: "none", // none | stacked | percent
      mirror: false, // true → population-pyramid-style diverging bars (per group)
      // true → draw from `appearance.center` instead of zero (Workstream B: Bar
      // absorbs Diverging Bar). A prop, not a chart type, matching how `pie`
      // already varies through `hole`. The retired `divergingBar` id maps
      // here through chartSpec.js's RETIRED_CHART_TYPES.
      diverging: false,
      // Workstream B: the reference line's own value, independent of
      // `center` (the bar anchor). `null` means "follow center" — an
      // existing saved view with no referenceValue renders identically.
      referenceValue: null,
      referenceLabel: "",
      orientation: "vertical",
      sort: "value",
      showValueLabels: false,
      groupGap: 0.75,
    },
    limits: { maxGroups: 5, recommendTopN: 20 },
  },

  choroplethMap: {
    id: "choroplethMap",
    // The colour IS the plotted value.
    colorEncoding: "scale",
    label: "Choropleth Map",
    purpose: "Geographic variation in one measure, at a point in time or as change.",
    transformCapable: true,
    requiredRoles: ["geography", "color"],
    optionalRoles: ["period"],
    roleConstraints: {
      geography: [DIMENSION],
      color: [MEASURE],
      period: [TEMPORAL],
    },
    skeletonShape: "map",
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: {
      colorScale: "sequential", // sequential | diverging
      classification: "quantile",
      bins: 5,
      showBoundaries: true,
      // Workstream C: reverses the resolved ramp (rampFor's invert option).
      // A hand-picked 3- or 5-shade diverging ramp; unset means the
      // selected palette's own stops. See palettes.js's rampFor.
      divergingStops: undefined,
      invertScale: false,
    },
    limits: { oneGeographicLevel: true },
    requiresGeometry: true, // blocked until GeoJSON/crosswalk exists (plan §7/§10)
  },

  heatmap: {
    id: "heatmap",
    // The colour IS the plotted value.
    colorEncoding: "scale",
    label: "Matrix Heatmap",
    purpose: "Patterns across many places and periods at once.",
    transformCapable: true,
    rankingCapable: true,
    lineAxes: ["horizontal", "vertical"],
    requiredRoles: ["x", "y", "color"],
    optionalRoles: [],
    roleConstraints: {
      x: [TEMPORAL, DIMENSION],
      y: [DIMENSION],
      color: [MEASURE],
    },
    skeletonShape: "grid",
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: {
      colorScale: "sequential",
      showCellValues: false,
      rowSort: "latest",
      // Workstream C: reverses the resolved ramp (rampFor's invert option).
      // A hand-picked 3- or 5-shade diverging ramp; unset means the
      // selected palette's own stops. See palettes.js's rampFor.
      divergingStops: undefined,
      invertScale: false,
    },
    limits: { maxRows: 50, recommendSearchOver: 50 },
  },

  dumbbell: {
    id: "dumbbell",
    colorEncoding: "categorical",
    // Renamed from "Dumbbell" — this is the base of the Range family (the dot
    // plot below is its sibling variant); the id stays "dumbbell" so saved
    // views and deep links keep working.
    label: "Range",
    purpose: "Compare exactly two values per category; emphasize the gap.",
    // Both endpoints are already raw values at two periods; a change/indexed
    // transform on top of that would be meaningless (flagged issue 1).
    transformCapable: false,
    rankingCapable: true,
    lineAxes: ["horizontal", "vertical"],
    requiredRoles: ["category", "start", "end"],
    // `point` is an optional center dot between the two ends — e.g. a point
    // estimate inside a low/high confidence interval (bring-your-own-data).
    // `size` stays accepted for saved-spec compatibility, but is hidden from
    // the editor and ignored by the renderer so every estimate marker is equal.
    // Workstream D: `benchmark` deleted — nothing read it.
    optionalRoles: ["point", "size", "group"],
    hiddenRoles: ["size"],
    roleConstraints: {
      category: [DIMENSION],
      start: [MEASURE],
      end: [MEASURE],
      point: [MEASURE],
      size: [MEASURE],
      group: [DIMENSION],
    },
    // A span per category is exactly what the Range family draws.
    skeletonShape: "gantt",
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    // showValueAxis: show the value (x) axis + gridlines; showPointLabels: print
    // each dot's number next to it (advanced). Shared with the dotPlot variant.
    defaults: {
      sort: "difference",
      showValueAxis: true,
      showPointLabels: false,
      pointLabelsFirstLineOnly: false,
      groupGap: 0.75,
    },
    limits: { exactlyTwoPeriods: true, minCategories: 6, maxCategories: 20 },
    sameMetricBothEnds: true, // start/end must be the same field across two periods
  },

  dotPlot: {
    id: "dotPlot",
    colorEncoding: "categorical",
    label: "Dot Plot",
    purpose:
      "Plot several series as coloured dots per category on a shared value axis, joined by a light range band.",
    transformCapable: false,
    rankingCapable: true,
    lineAxes: ["horizontal", "vertical"],
    // Two dimensions + one measure, like a heatmap: `y` is the category (rows),
    // `x` is the series that becomes the dots, `color` is the plotted value.
    // Shares the matrix data path; rendered as dots instead of a colour grid.
    requiredRoles: ["y", "x", "color"],
    optionalRoles: ["group"],
    roleConstraints: {
      y: [DIMENSION],
      x: [DIMENSION],
      color: [MEASURE],
      group: [DIMENSION],
    },
    // Dots per category on a shared value axis — the scatter shape, not bars.
    skeletonShape: "scatter",
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: { showValueAxis: true, showPointLabels: false, groupGap: 0.75 },
    limits: { maxGroups: 6, maxRows: 30 },
  },

  forest: {
    id: "forest",
    // Estimates always use the categorical palette. Dot/diamond interval ends
    // use the next palette entries; classic vertical caps stay neutral unless
    // explicitly overridden. The connecting interval line remains gray chrome.
    colorEncoding: "categorical",
    label: "Forest / Whisker Plot",
    purpose:
      "Show each study's estimate and confidence interval on a shared axis, against a line of no effect.",
    transformCapable: false,
    rankingCapable: true,
    lineAxes: ["horizontal", "vertical"],
    // A Range-family variant tuned for meta-analysis: `category` = study, `start`
    // / `end` = the CI's lower / upper bound and `point` = the study estimate.
    // Estimate markers are deliberately uniform in size. start/end are DISTINCT
    // columns (a CI), so endpoints are not mirrored the way a two-period dumbbell's
    // are.
    requiredRoles: ["category", "start", "end"],
    // `size` is the study weight a meta-analysis reports alongside each estimate.
    // It is bindable so the value travels with the chart config and exports, but
    // the renderer still draws every estimate marker at one size — weighting the
    // markers is a deliberate future change, not an accident of binding.
    // Workstream D: `benchmark` deleted — nothing read it.
    optionalRoles: ["point", "size", "group"],
    roleConstraints: {
      category: [DIMENSION],
      start: [MEASURE],
      end: [MEASURE],
      point: [MEASURE],
      size: [MEASURE],
      group: [DIMENSION],
    },
    // Confidence intervals as bare spans, no axis chrome.
    skeletonShape: "ganttNoAxes",
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    // endpointStyle: how the CI ends render (caps | dots | diamonds | none);
    // pointStyle: how the estimate marker renders (square | diamond | dot | none);
    // noEffectValue: x of the vertical "line of no effect" (0 for differences,
    // 1 for ratios) — null hides it; center symmetrically anchors the value axis.
    defaults: {
      showValueAxis: true,
      showPointLabels: false,
      endpointStyle: "caps",
      pointStyle: "square",
      noEffectValue: null,
      center: null,
      groupGap: 0.75,
    },
    limits: { minCategories: 2, maxCategories: 40 },
    sameMetricBothEnds: false,
  },

  scatter: {
    id: "scatter",
    colorEncoding: "categorical",
    label: "Scatter",
    purpose: "Relationship between two numeric measures.",
    // x and y are two different measures; a change transform doesn't apply
    // across unrelated axes (flagged issue 1).
    transformCapable: false,
    rankingCapable: true,
    lineAxes: ["horizontal", "vertical"],
    requiredRoles: ["x", "y", "unit"],
    optionalRoles: ["color"],
    colorBindingSection: "appearance",
    roleConstraints: {
      x: [MEASURE],
      y: [MEASURE],
      unit: [DIMENSION], // the observation unit, e.g. County
      color: [DIMENSION],
    },
    skeletonShape: "scatter",
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: { referenceLines: [], labelSelected: true, trendline: false },
    limits: {},
    allowsIncomparableAxes: true, // x and y need NOT share a comparison group
  },

  bubble: {
    id: "bubble",
    colorEncoding: "categorical",
    label: "Bubble",
    purpose: "Scatter plus a third numeric variable encoded as point area.",
    transformCapable: false,
    rankingCapable: true,
    lineAxes: ["horizontal", "vertical"],
    requiredRoles: ["x", "y", "size", "unit"],
    optionalRoles: ["color"],
    colorBindingSection: "appearance",
    roleConstraints: {
      x: [MEASURE],
      y: [MEASURE],
      size: [MEASURE],
      unit: [DIMENSION],
      color: [DIMENSION],
    },
    // A bubble is a scatter with a third variable on point area.
    skeletonShape: "scatter",
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: { sizeByArea: true, opacity: 0.8, labelSelected: true },
    limits: { sizeNonNegative: true },
    allowsIncomparableAxes: true,
  },

  pie: {
    id: "pie",
    // Each slice takes a cycled palette colour by its own category label.
    colorEncoding: "categorical",
    label: "Pie / Donut",
    purpose: "Parts of a whole at a single point in time.",
    // A pie shows composition, not change; a change/indexed transform has no
    // meaning on shares of a whole (flagged issue 1).
    transformCapable: false,
    rankingCapable: true,
    requiredRoles: ["category", "y"],
    // No `color` role: `pieSpec` colours each slice from the palette by its own
    // category label, so binding a second dimension here changed nothing. The
    // slices are already the categories - there is no second grouping to make.
    optionalRoles: [],
    roleConstraints: {
      category: [DIMENSION],
      y: [MEASURE],
    },
    skeletonShape: "pie",
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    // `hole` = 0 is a pie; > 0 is the donut variant (variants over new ids).
    defaults: { hole: 0, sort: "value", showValueLabels: true },
    limits: { maxSlices: 8, recommendGroupOthers: 8 },
  },

  symbolMap: {
    id: "symbolMap",
    // One palette colour per marker until `appearance.symbolGradient` turns
    // the measure into a ramp.
    colorEncoding: "conditional-scale",
    label: "Symbol Map",
    purpose: "Magnitude by place, sized proportionally at point locations.",
    transformCapable: false,
    requiredRoles: ["geography", "size"],
    // No `color` role: every marker takes one colour from the active palette
    // (`symbolMapSpec`), so a second measure bound here would have been a
    // dropdown that changed nothing on screen.
    optionalRoles: [],
    roleConstraints: {
      geography: [DIMENSION],
      size: [MEASURE],
    },
    skeletonShape: "map",
    sidebarSections: ["data", "encodings", "labels", "appearance"],
    defaults: {
      sizeByArea: true,
      opacity: 0.75,
      // Workstream C: a second, redundant colour encoding of the same measure
      // marker area already carries. Off keeps today's single-palette-colour
      // behaviour exactly.
      symbolGradient: false,
      invertScale: false,
    },
    limits: { sizeNonNegative: true },
    requiresGeometry: true, // needs point coordinates for each place
  },

  dataTable: {
    id: "dataTable",
    // No marks to colour.
    colorEncoding: "none",
    label: "Data Table",
    purpose: "The exact numbers behind a chart, searchable and sortable.",
    transformCapable: false,
    // A data table charts whatever is loaded; it binds no encoding roles.
    requiredRoles: [],
    optionalRoles: [],
    roleConstraints: {},
    skeletonShape: "table",
    sidebarSections: ["data", "labels", "appearance"],
    defaults: { search: true, sortable: true, pageSize: 25 },
    limits: {},
  },
});

/** Look up a chart descriptor by id; returns undefined for unknown types. */
export function getChartType(chartTypeId) {
  return CHART_TYPES[chartTypeId];
}

/** All chart-type ids. */
export const CHART_TYPE_IDS = Object.freeze(Object.keys(CHART_TYPES));

/** Field kinds accepted by a given role on a chart type ([] if role unknown). */
export function acceptedKindsForRole(chartTypeId, role) {
  const chart = CHART_TYPES[chartTypeId];
  return (chart && chart.roleConstraints[role]) || [];
}

const CHANGE_CALCULATIONS = ["numericChange", "percentChange", "percentagePointChange"];
const ALL_TIME_CONTRACTS = [
  "range",
  "orderedSequence",
  "snapshot",
  "selectedSnapshots",
  "twoPeriods",
  "none",
];
const ALL_CALCULATIONS = [
  "actual",
  "sum",
  "weightedMean",
  "averageSelectedYears",
  ...CHANGE_CALCULATIONS,
  "indexed",
  "benchmarkDifference",
  "ranking",
];

const CAPABILITIES = Object.freeze({
  line: {
    time: ["range", "orderedSequence"],
    comparison: ["combined", "tabs"],
    defaultPresentation: "combined",
    calculations: ["actual", "indexed", ...CHANGE_CALCULATIONS, "benchmarkDifference"],
  },
  bar: {
    // A Bar can compare several selected years side by side. Keep that as its
    // primary contract so switching from a Line does not silently collapse the
    // question to one arbitrary snapshot.
    time: ["selectedSnapshots", "snapshot", "twoPeriods"],
    comparison: ["combined", "tabs"],
    defaultPresentation: "combined",
    calculations: ["actual", ...CHANGE_CALCULATIONS, "benchmarkDifference", "ranking"],
  },
  choroplethMap: {
    time: ["snapshot", "selectedSnapshots", "twoPeriods"],
    comparison: ["tabs"],
    defaultPresentation: "tabs",
    calculations: ["actual", ...CHANGE_CALCULATIONS, "benchmarkDifference", "ranking"],
  },
  heatmap: {
    time: ["range", "selectedSnapshots"],
    comparison: ["tabs"],
    defaultPresentation: "tabs",
    calculations: ["actual", ...CHANGE_CALCULATIONS, "ranking"],
  },
  dumbbell: {
    time: ["twoPeriods"],
    comparison: ["rows"],
    defaultPresentation: "rows",
    calculations: ["actual"],
    intervalEndpoints: "period",
  },
  dotPlot: {
    time: ["range", "snapshot", "none"],
    comparison: ["combined", "tabs"],
    defaultPresentation: "combined",
    calculations: ["actual", "ranking"],
  },
  forest: {
    time: ["snapshot", "none"],
    comparison: ["rows"],
    defaultPresentation: "rows",
    calculations: ["actual"],
    intervalEndpoints: "measure",
    measureRoles: ["estimate", "lowerBound", "upperBound"],
  },
  scatter: {
    time: ["snapshot", "none"],
    comparison: ["combined", "tabs"],
    defaultPresentation: "combined",
    calculations: ["actual", "ranking"],
  },
  bubble: {
    time: ["snapshot", "none"],
    comparison: ["combined", "tabs"],
    defaultPresentation: "combined",
    calculations: ["actual", "ranking"],
  },
  pie: {
    time: ["snapshot", "selectedSnapshots"],
    comparison: ["slices", "tabs"],
    defaultPresentation: "slices",
    calculations: ["actual", "averageSelectedYears"],
  },
  symbolMap: {
    time: ["snapshot", "selectedSnapshots"],
    comparison: ["tabs"],
    defaultPresentation: "tabs",
    calculations: ["actual", "ranking"],
  },
  dataTable: {
    time: ALL_TIME_CONTRACTS,
    comparison: ["rows"],
    defaultPresentation: "rows",
    calculations: ALL_CALCULATIONS,
  },
});

/** Return the explicit v3 question/presentation boundary for a chart family. */
export function getChartCapabilities(chartTypeId) {
  const chart = getChartType(chartTypeId);
  const capability = CAPABILITIES[chartTypeId];
  if (!chart || !capability) return undefined;
  const tabsRequired = capability.comparison.length === 1 && capability.comparison[0] === "tabs";
  return Object.freeze({
    time: Object.freeze({ contracts: Object.freeze([...capability.time]) }),
    comparison: Object.freeze({
      presentations: Object.freeze([...capability.comparison]),
      default: capability.defaultPresentation,
      tabsRequired,
      geographyOverride: true,
      timeOverride: true,
    }),
    calculations: Object.freeze([...capability.calculations]),
    geography: Object.freeze({
      requiresStableIds: Boolean(chart.requiresGeometry),
    }),
    appearance: Object.freeze({
      colorEncoding: chart.colorEncoding,
      divergingStops: chart.colorEncoding === "scale",
      hideXAxis: Boolean(chart.lineAxes?.includes("horizontal")),
    }),
    ...(capability.intervalEndpoints
      ? { intervalEndpoints: capability.intervalEndpoints }
      : {}),
    ...(capability.measureRoles ? { measureRoles: Object.freeze(capability.measureRoles) } : {}),
  });
}
