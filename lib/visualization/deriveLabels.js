import { bindingColumns } from "@/lib/visualization/inlineMapping";
import { outcomeFor } from "@/lib/visualization/questionSpec";

/**
 * Auto-derived chart labels — what the chart shows when the user hasn't typed
 * their own. Powers the live placeholders in the Labels editor AND is merged
 * into the labels handed to the renderer, so the sidebar always reflects what the
 * graph actually outputs.
 *
 * CLIENT-SAFE (no node:fs).
 */

// Which binding feeds each axis, per chart family. `null` means that axis has
// no bound field (the slope x-axis is the two years; a choropleth has no axes).
// Diverging bars default to horizontal; both variants share the
// category/measure axis mapping, flipped by orientation.
// `appearance.diverging` is what distinguishes them since Workstream B
// retired the separate `divergingBar` id in favor of this flag.
function isHorizontalBar(appearance = {}) {
  return appearance.diverging
    ? appearance.orientation !== "vertical"
    : appearance.orientation === "horizontal";
}

function axisBindingNames(chartType, bindings, appearance) {
  switch (chartType) {
    case "bar": {
      return isHorizontalBar(appearance)
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

/**
 * A title line the import found above a pasted table. `meta.title` also holds
 * the dataset name the Import step records (a typed name or the file's name,
 * `titleFrom` "name" or "file"), which names the dataset but not the chart.
 */
function capturedTableTitle(question) {
  if (question.dataset?.kind !== "inline") return null;
  const meta = question.dataset.inline?.meta;
  if (!meta?.title) return null;
  if (meta.titleFrom) return meta.titleFrom === "table" ? meta.title : null;
  // Recorded by the Import step before titleFrom existed: a dataset name.
  return meta.importedAt ? null : meta.title;
}

// The value axis of several value columns that share a unit names the unit.
const UNIT_AXIS_WORDS = Object.freeze({ percent: "Percent", usd: "Dollars", number: "Number" });

/** "A", "A and B", "A, B, and C", then "A, B, C, and 3 more". */
function listNames(names) {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${names.slice(0, 3).join(", ")}, and ${names.length - 3} more`;
}

/**
 * Labels for a pasted table, built from the mapped column names (dataset-range
 * plan, workstream 7): no geography wording, axes named after their columns,
 * up to three value columns listed in the title, and several value columns'
 * shared unit on their axis (blank when the units differ). A title line found
 * above the table is the title.
 */
function deriveInlineLabels(config) {
  const chartType = config.presentation?.chartType;
  const question = config.question || {};
  const table = question.dataset?.inline || {};
  const bindings = question.dataset?.bindings || {};
  const columnOf = (name) => (table.columns || []).find((column) => column.name === name);
  const unitOf = (name) => columnOf(name)?.unit || "number";
  const one = (role) => bindingColumns(bindings[role])[0] || "";
  const list = (role) => bindingColumns(bindings[role]);
  const valueAxis = (columns) => {
    if (columns.length <= 1) return columns[0] || "";
    const units = new Set(columns.map(unitOf));
    return units.size === 1 ? UNIT_AXIS_WORDS[[...units][0]] || "" : "";
  };
  const by = (value, category) => (value && category ? `${value} by ${category}` : value);

  let labels;
  switch (chartType) {
    case "line": {
      const values = list("y");
      const x = bindings.valuesArePeriods ? "Period" : one("x");
      const overTime = bindings.valuesArePeriods || columnOf(one("x"))?.type === "date";
      const name = listNames(values);
      labels = { title: name && overTime ? `${name} over time` : by(name, x), xAxis: x, yAxis: valueAxis(values) };
      break;
    }
    case "bar": {
      const values = list("y");
      const category = one("category");
      const value = valueAxis(values);
      const horizontal = isHorizontalBar(config.presentation?.appearance);
      labels = {
        title: by(listNames(values), category),
        xAxis: horizontal ? value : category,
        yAxis: horizontal ? category : value,
      };
      break;
    }
    case "pie":
      labels = { title: by(one("y"), one("category")), xAxis: "", yAxis: "" };
      break;
    case "dumbbell":
      labels = { title: by(one("start"), one("category")), xAxis: one("start"), yAxis: one("category") };
      break;
    case "forest": {
      const estimate = one("point") || one("start");
      labels = { title: by(estimate, one("category")), xAxis: estimate, yAxis: one("category") };
      break;
    }
    case "heatmap":
      labels = { title: by(one("color"), one("y")), xAxis: one("x"), yAxis: one("y") };
      break;
    case "dotPlot": {
      const values = list("color");
      labels = { title: by(listNames(values), one("y")), xAxis: valueAxis(values), yAxis: one("y") };
      break;
    }
    case "scatter":
    case "bubble": {
      const y = one("y");
      const x = one("x");
      const title = one("unit") ? by(y, one("unit")) : y && x ? `${y} vs ${x}` : y || x;
      labels = { title, xAxis: x, yAxis: y };
      break;
    }
    default:
      labels = { title: one("y") || one("value") || one("color"), xAxis: "", yAxis: "" };
  }
  const captured = capturedTableTitle(question);
  return captured ? { ...labels, title: captured } : labels;
}

function deriveQuestionLabels(config, schema) {
  if (config.question?.dataset?.kind === "inline") return deriveInlineLabels(config);
  const chartType = config.presentation?.chartType || config.chartType;
  const question = config.question || {};
  const measureId = outcomeFor(question)?.measureId;
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
  if (chartType === "bar") {
    // X and Y name the horizontal and vertical axes, as the older editor's
    // labels do, so horizontal bars put the measure on X (renderer plan E).
    const appearance = config.presentation?.appearance || {};
    const category = appearance.categoryAxis === "period" ? temporal : "Location";
    return isHorizontalBar(appearance)
      ? { title, xAxis: measure, yAxis: category }
      : { title, xAxis: category, yAxis: measure };
  }
  // A range chart's values run along the horizontal axis and its rows name
  // themselves, so the measure goes on X and Y is left blank (renderer plan F).
  if (chartType === "dumbbell") return { title, xAxis: measure, yAxis: "" };
  // The dot plot and forest plot lay their rows out as the range chart does
  // (renderer plans G and H).
  if (["dotPlot", "forest"].includes(chartType)) return { title, xAxis: measure, yAxis: "" };
  // A pasted scatter or bubble plots its bound x column across and the outcome
  // down (renderer plan J); the title names both.
  if (["scatter", "bubble"].includes(chartType)) {
    const xId = outcomeFor(question, "x")?.measureId;
    const across = schema?.fields?.[xId]?.label || xId || (question.dataset?.kind === "inline" ? question.dataset.bindings?.x || "" : "");
    return { title: across ? `${measure} vs ${across}` : title, xAxis: across, yAxis: measure };
  }
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
