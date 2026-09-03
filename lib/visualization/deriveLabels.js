/**
 * Auto-derived chart labels — what the chart shows when the user hasn't typed
 * their own. Powers the live placeholders in the Labels editor AND is merged
 * into the labels handed to toPlotly, so the sidebar always reflects what the
 * graph actually outputs.
 *
 * CLIENT-SAFE (no node:fs).
 */

// Which binding feeds each axis, per chart family. `null` means that axis has
// no bound field (the slope x-axis is the two years; a choropleth has no axes).
function axisBindingNames(chartType, bindings, appearance) {
  switch (chartType) {
    case "bar": {
      // Diverging bars default to horizontal; both variants share the
      // category/measure axis mapping, flipped by orientation.
      // `appearance.diverging` is what distinguishes them since Workstream B
      // retired the separate `divergingBar` id in favor of this flag.
      const diverging = Boolean(appearance.diverging);
      const horizontal = diverging
        ? appearance.orientation !== "vertical"
        : appearance.orientation === "horizontal";
      return horizontal
        ? { x: bindings.y, y: bindings.category }
        : { x: bindings.category, y: bindings.y };
    }
    case "dumbbell":
      return { x: bindings.start, y: bindings.category };
    case "forest":
      // Estimate/CI on the value (x) axis; studies as rows on the y-axis.
      return { x: bindings.point || bindings.start, y: bindings.category };
    case "dotPlot":
      // Value (color measure) on the x-axis; category rows on the y-axis.
      return { x: bindings.color, y: bindings.y };
    case "heatmap":
    case "scatter":
    case "bubble":
      return { x: bindings.x, y: bindings.y };
    case "choroplethMap":
      return { x: null, y: null };
    case "line":
    default:
      return { x: bindings.x, y: bindings.y };
  }
}

// A human-readable chart title built from the bound variables, so the title
// tracks the user's field choices instead of a static preset name. Returns ""
// when the driving field isn't bound yet (the title then simply stays blank).
function deriveTitle(config, schema, fieldLabel) {
  const { chartType, bindings = {} } = config;
  const isTemporal = (name) =>
    Boolean(name) && schema?.fields?.[name]?.kind === "temporal";
  const y = fieldLabel(bindings.y);
  const x = fieldLabel(bindings.x);
  const category = fieldLabel(bindings.category);
  const color = fieldLabel(bindings.color);
  const size = fieldLabel(bindings.size);
  const start = fieldLabel(bindings.start);

  switch (chartType) {
    case "line":
      if (!y) return "";
      if (isTemporal(bindings.x)) return `${y} over time`;
      return x ? `${y} by ${x}` : y;
    case "bar":
    case "pie":
      if (!y) return "";
      return category ? `${y} by ${category}` : y;
    case "dumbbell":
      if (!start) return "";
      return category ? `${start} by ${category}` : start;
    case "forest": {
      const estimate = fieldLabel(bindings.point) || start;
      if (!estimate) return "";
      return category ? `${estimate} by ${category}` : estimate;
    }
    case "dotPlot":
      if (!color) return "";
      return y ? `${color} by ${y}` : color;
    case "scatter":
    case "bubble":
      if (y && x) return `${y} vs ${x}`;
      return y || x || "";
    case "heatmap":
      if (y && x) return `${y} by ${x}`;
      return color || "";
    case "choroplethMap":
      return color ? `${color} by geography` : "";
    case "symbolMap":
      return size ? `${size} by geography` : color ? `${color} by geography` : "";
    default:
      return y || "";
  }
}

function joinPlaces(locations) {
  if (locations.length < 2) return locations[0] || "";
  if (locations.length === 2) return `${locations[0]} and ${locations[1]}`;
  return `${locations.slice(0, -1).join(", ")}, and ${locations.at(-1)}`;
}

function geographyScope(subset) {
  const scopes = {
    Counties: "county",
    Regions: "region",
    California: "California",
    States: "state",
    "US States": "state",
  };
  return scopes[subset] || String(subset || "geography").replace(/s$/i, "").toLowerCase();
}

function deriveQuestionLabels(config, schema) {
  const chartType = config.presentation?.chartType || config.chartType;
  const question = config.question || {};
  const measureId = question.outcome?.measureId;
  const measure = schema?.fields?.[measureId]?.label || measureId || "Outcome";
  const sharedGeography = question.geography || {};
  const geographies = question.comparisons?.length
    ? question.comparisons.map((comparison) => comparison.geography || sharedGeography)
    : [sharedGeography];
  const locations = [...new Set(geographies.flatMap((geography) => geography?.locations || []))];
  // A short list is useful context. Enumerating a whole geographic level in a
  // title produces an unreadable, clipped sentence; at that point the level is
  // clearer, and every place remains visible on the axis or in the legend.
  const places = locations.length <= 3 ? joinPlaces(locations) : "";
  const subsets = [...new Set(geographies.map((geography) => geography?.subset).filter(Boolean))];
  const scope = subsets.length === 1 ? geographyScope(subsets[0]) : "geography";
  const temporal = Object.values(schema?.fields || {}).find(
    (field) => field.kind === "temporal",
  )?.label || "Time";

  let title;
  if (chartType === "line") {
    title = places ? `${measure} over time in ${places}` : `${measure} over time by ${scope}`;
  } else if (["choroplethMap", "symbolMap"].includes(chartType)) {
    title = `${measure} by ${scope}`;
  } else {
    title = places ? `${measure} in ${places}` : `${measure} by ${scope}`;
  }

  if (chartType === "line") return { title, xAxis: temporal, yAxis: measure };
  if (chartType === "bar") return { title, xAxis: "Location", yAxis: measure };
  if (["choroplethMap", "symbolMap", "pie", "dataTable"].includes(chartType)) {
    return { title, xAxis: "", yAxis: "" };
  }
  return { title, xAxis: "", yAxis: measure };
}

/** Labels the graph would auto-generate from the bound fields. */
export function deriveLabels(config, schema) {
  if (config.version === 3) return deriveQuestionLabels(config, schema);
  const { chartType, bindings = {}, appearance = {} } = config;
  const fieldLabel = (name) =>
    (name && schema?.fields?.[name]?.label) || name || "";
  const axis = axisBindingNames(chartType, bindings, appearance);
  return {
    title: deriveTitle(config, schema, fieldLabel),
    xAxis: fieldLabel(axis.x),
    yAxis: fieldLabel(axis.y),
  };
}

// Keys that auto-fill from the bound fields when the user leaves them blank.
const AUTO_KEYS = ["title", "xAxis", "yAxis"];

/** User labels win; blanks fall back to the auto-derived values. */
export function effectiveLabels(config, schema) {
  const derived = deriveLabels(config, schema);
  const merged = {
    ...(config.version === 3 ? config.presentation?.labels : config.labels),
  };
  for (const key of AUTO_KEYS) {
    if (!merged[key]) merged[key] = derived[key];
  }
  return merged;
}
