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
      const horizontal = appearance.orientation === "horizontal";
      return horizontal
        ? { x: bindings.y, y: bindings.category }
        : { x: bindings.category, y: bindings.y };
    }
    case "dumbbell":
      return { x: bindings.start, y: bindings.category };
    case "slope":
      return { x: null, y: bindings.start };
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

/** Labels the graph would auto-generate from the bound fields. */
export function deriveLabels(config, schema) {
  const { chartType, bindings = {}, appearance = {} } = config;
  const fieldLabel = (name) =>
    (name && schema?.fields?.[name]?.label) || name || "";
  const axis = axisBindingNames(chartType, bindings, appearance);
  return {
    xAxis: fieldLabel(axis.x),
    yAxis: fieldLabel(axis.y),
  };
}

// Keys that auto-fill from the bound fields when the user leaves them blank.
const AUTO_KEYS = ["xAxis", "yAxis"];

/** User labels win; blanks fall back to the auto-derived values. */
export function effectiveLabels(config, schema) {
  const derived = deriveLabels(config, schema);
  const merged = { ...config.labels };
  for (const key of AUTO_KEYS) {
    if (!merged[key]) merged[key] = derived[key];
  }
  return merged;
}
