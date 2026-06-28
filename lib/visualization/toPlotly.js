import { BASE_PLOTLY_COLORS, COLORS } from "@/lib/constants";
import { applyTransform } from "./transformRegistry";

const DEFAULT_CONFIG = Object.freeze({
  displayModeBar: true,
  responsive: true,
});

function valueOf(record, binding, fallbacks) {
  for (const key of [...fallbacks, binding]) {
    if (key && record?.[key] !== undefined) return record[key];
  }
  return undefined;
}

function legendFor(position = "right") {
  if (position === "hidden") return { showlegend: false };
  if (position === "bottom") {
    return {
      showlegend: true,
      legend: { orientation: "h", x: 0, y: -0.2, xanchor: "left" },
    };
  }
  return {
    showlegend: true,
    legend: { orientation: "v", x: 1.02, y: 1 },
  };
}

function wrapTitle(title) {
  if (!title || title.length <= 30) return title;
  const midpoint = Math.floor(title.length / 2);
  const spaces = [...title.matchAll(/ /g)].map((match) => match.index);
  if (!spaces.length) return title;
  const splitAt = spaces.reduce(
    (closest, index) =>
      Math.abs(index - midpoint) < Math.abs(closest - midpoint)
        ? index
        : closest,
    spaces[0],
  );
  return `${title.slice(0, splitAt)}<br>${title.slice(splitAt + 1)}`;
}

function baseLayout(labels = {}, appearance = {}) {
  const legend = legendFor(appearance.legendPosition);
  const annotations = [];
  if (labels.subtitle) {
    annotations.push({
      text: labels.subtitle,
      x: 0,
      xref: "paper",
      xanchor: "left",
      y: 1.08,
      yref: "paper",
      yanchor: "bottom",
      showarrow: false,
      font: { size: 12, color: COLORS.gray5 },
    });
  }
  if (appearance.watermark) {
    annotations.push({
      text: "PPIC",
      x: 0.5,
      xref: "paper",
      xanchor: "center",
      y: 0.5,
      yref: "paper",
      yanchor: "middle",
      showarrow: false,
      font: { size: 64, color: COLORS.gray3 },
      opacity: 0.18,
    });
  }
  return {
    title: labels.title
      ? {
          text: wrapTitle(labels.title),
          font: { size: 18, color: COLORS.gray7 },
        }
      : undefined,
    xaxis: {
      title: labels.xAxis ? { text: labels.xAxis } : undefined,
      showgrid: true,
      gridcolor: COLORS.gray2,
      zeroline: false,
    },
    yaxis: {
      title: labels.yAxis ? { text: labels.yAxis } : undefined,
      showgrid: true,
      gridcolor: COLORS.gray2,
      zeroline: false,
    },
    plot_bgcolor: COLORS.white,
    paper_bgcolor: COLORS.white,
    font: { family: "Inter, sans-serif", color: COLORS.gray6 },
    margin: { l: 70, r: 40, t: labels.title ? 60 : 24, b: 60 },
    autosize: true,
    ...legend,
    ...(annotations.length ? { annotations } : {}),
  };
}

function transformSeries(series, transforms, field) {
  const settings =
    typeof transforms === "string"
      ? { id: transforms }
      : transforms || { id: "actual" };
  return applyTransform(settings.id || "actual", series, field, settings);
}

function withReferenceLines(layout, referenceLines = []) {
  if (!referenceLines.length) return layout;
  const shapes = [];
  const annotations = [...(layout.annotations || [])];

  for (const reference of referenceLines) {
    if (reference.type === "diagonal") {
      shapes.push({
        type: "line",
        x0: 0,
        y0: 0,
        x1: 1,
        y1: 1,
        xref: "paper",
        yref: "paper",
        line: { color: COLORS.gray4, dash: "dot", width: 1.5 },
      });
    } else if (reference.type === "vertical") {
      shapes.push({
        type: "line",
        x0: reference.value,
        x1: reference.value,
        y0: 0,
        y1: 1,
        yref: "paper",
        line: { color: COLORS.gray4, dash: "dash", width: 1.5 },
      });
    } else {
      shapes.push({
        type: "line",
        x0: 0,
        x1: 1,
        xref: "paper",
        y0: reference.value,
        y1: reference.value,
        line: { color: COLORS.gray4, dash: "dash", width: 1.5 },
      });
    }
    if (reference.label) {
      annotations.push({
        text: reference.label,
        x: reference.type === "vertical" ? reference.value : 1,
        xref: reference.type === "vertical" ? "x" : "paper",
        xanchor: "right",
        y: reference.type === "horizontal" ? reference.value : 1,
        yref: reference.type === "horizontal" ? "y" : "paper",
        yanchor: "bottom",
        showarrow: false,
        font: { size: 11, color: COLORS.gray5 },
      });
    }
  }
  return { ...layout, shapes, annotations };
}

function lineSpec(spec) {
  const {
    appearance = {},
    bindings = {},
    field,
    labels = {},
    layers = [],
    referenceLines = [],
    series = [],
    transforms,
  } = spec;
  const transformed = transformSeries(series, transforms, field);
  const markerMode = appearance.markerMode || "auto";
  const mode = markerMode === "off" ? "lines" : "lines+markers";
  const area = Boolean(appearance.area);
  const data = transformed.series.map((item, index) => ({
    x: item.years,
    y: item.values,
    type: "scatter",
    mode,
    name: item.location || item.label || `Series ${index + 1}`,
    line: {
      width: 2,
      color: BASE_PLOTLY_COLORS[index % BASE_PLOTLY_COLORS.length],
    },
    marker: { size: markerMode === "auto" ? 5 : 6 },
    connectgaps: false,
    // Stacked-area mode (e.g. regional composition on the landing tiles).
    ...(area ? { stackgroup: "one", fill: "tonexty" } : {}),
    hovertemplate:
      labels.tooltip ||
      `%{x}<br>%{y}<extra>${item.location || item.label || ""}</extra>`,
  }));

  for (const layer of layers.filter(
    (candidate) => candidate.type === "derivedComparison" && candidate.transform,
  )) {
    const derived = transformSeries(
      series,
      { ...(transforms || {}), id: layer.transform },
      field,
    );
    for (const item of derived.series) {
      const index = data.length;
      data.push({
        x: item.years,
        y: item.values,
        type: "scatter",
        mode: "lines",
        name: `${item.location} · ${layer.label}`,
        line: {
          width: 2,
          dash: "dot",
          color: BASE_PLOTLY_COLORS[index % BASE_PLOTLY_COLORS.length],
        },
        connectgaps: false,
      });
    }
  }

  const layerReferences = layers
    .filter((layer) => layer.type === "referenceValue")
    .map((layer) => ({
      type: "horizontal",
      value: layer.values?.[0],
      label: layer.label,
    }))
    .filter((reference) => Number.isFinite(reference.value));
  const layout = withReferenceLines(baseLayout(
    {
      ...labels,
      xAxis: labels.xAxis || bindings.x,
      yAxis: labels.yAxis || bindings.y,
    },
    appearance,
  ), [...referenceLines, ...layerReferences]);
  return { data, layout, config: DEFAULT_CONFIG };
}

function barSpec(spec) {
  const {
    appearance = {},
    bindings = {},
    labels = {},
    series = [],
  } = spec;
  const records = Array.isArray(series) ? series : series.records || [];
  const groups = new Map();
  for (const record of records) {
    const group = valueOf(record, bindings.group, ["group", "series"]) || "Value";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(record);
  }
  const horizontal = appearance.orientation === "horizontal";
  const data = [...groups.entries()].map(([group, rows], index) => {
    const categories = rows.map((row) =>
      valueOf(row, bindings.category, ["category", "location", "label"]),
    );
    const values = rows.map((row) =>
      valueOf(row, bindings.y, ["value", "y"]),
    );
    return {
      type: "bar",
      name: group,
      orientation: horizontal ? "h" : "v",
      x: horizontal ? values : categories,
      y: horizontal ? categories : values,
      marker: {
        color: BASE_PLOTLY_COLORS[index % BASE_PLOTLY_COLORS.length],
      },
      text: appearance.showValueLabels ? values : undefined,
      textposition: appearance.showValueLabels ? "auto" : undefined,
      hovertemplate: labels.tooltip || "%{x}, %{y}<extra></extra>",
    };
  });
  const layout = {
    ...baseLayout(labels, appearance),
    barmode:
      appearance.stackMode === "stacked"
        ? "stack"
        : appearance.stackMode === "percent"
          ? "relative"
          : "group",
    barnorm: appearance.stackMode === "percent" ? "percent" : undefined,
  };
  if (horizontal) layout.yaxis = { ...layout.yaxis, autorange: "reversed" };
  return { data, layout, config: DEFAULT_CONFIG };
}

function twoPeriodSpec(spec, slope = false) {
  const {
    appearance = {},
    bindings = {},
    labels = {},
    period = {},
    series = [],
  } = spec;
  const records = Array.isArray(series) ? series : series.records || [];
  const categories = records.map((row) =>
    valueOf(row, bindings.category, ["category", "location", "label"]),
  );
  const starts = records.map((row) =>
    valueOf(row, bindings.start, ["start", "startValue"]),
  );
  const ends = records.map((row) =>
    valueOf(row, bindings.end, ["end", "endValue"]),
  );

  if (slope) {
    const left = String(period.startYear ?? "Start");
    const right = String(period.endYear ?? "End");
    const data = records.map((row, index) => ({
      type: "scatter",
      mode: appearance.showEndpointLabels === false ? "lines+markers" : "lines+markers+text",
      x: [left, right],
      y: [starts[index], ends[index]],
      name: categories[index],
      text:
        appearance.showEndpointLabels === false
          ? undefined
          : [categories[index], categories[index]],
      textposition: ["middle left", "middle right"],
      line: {
        color: BASE_PLOTLY_COLORS[index % BASE_PLOTLY_COLORS.length],
      },
      hovertemplate: labels.tooltip || "%{x}: %{y}<extra>%{fullData.name}</extra>",
    }));
    return {
      data,
      layout: baseLayout(labels, appearance),
      config: DEFAULT_CONFIG,
    };
  }

  const connectors = records.map((row, index) => ({
    type: "scatter",
    mode: "lines",
    x: [starts[index], ends[index]],
    y: [categories[index], categories[index]],
    line: { color: COLORS.gray3, width: 2 },
    showlegend: false,
    hoverinfo: "skip",
  }));
  const data = [
    ...connectors,
    {
      type: "scatter",
      mode: "markers",
      name: String(period.startYear ?? "Start"),
      x: starts,
      y: categories,
      marker: { color: BASE_PLOTLY_COLORS[0], size: 9 },
    },
    {
      type: "scatter",
      mode: "markers",
      name: String(period.endYear ?? "End"),
      x: ends,
      y: categories,
      marker: { color: BASE_PLOTLY_COLORS[1], size: 9 },
    },
  ];
  return {
    data,
    layout: baseLayout(labels, appearance),
    config: DEFAULT_CONFIG,
  };
}

function scatterSpec(spec) {
  const {
    appearance = {},
    bindings = {},
    chartType,
    labels = {},
    referenceLines = [],
    series = [],
  } = spec;
  const records = Array.isArray(series) ? series : series.records || [];
  const groups = new Map();
  for (const record of records) {
    const group = valueOf(record, bindings.color, ["group", "color"]) || "Observations";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(record);
  }
  const isBubble = chartType === "bubble";
  const allSizes = records
    .map((row) => Number(valueOf(row, bindings.size, ["size"])))
    .filter(Number.isFinite);
  const maxSize = Math.max(...allSizes, 1);
  const sizeRef = (2 * maxSize) / 36 ** 2;

  const data = [...groups.entries()].map(([group, rows], index) => ({
    type: "scatter",
    mode: "markers",
    name: group,
    x: rows.map((row) => valueOf(row, bindings.x, ["x"])),
    y: rows.map((row) => valueOf(row, bindings.y, ["y"])),
    text: rows.map((row) =>
      valueOf(row, bindings.unit, ["label", "location", "unit"]),
    ),
    marker: {
      color: BASE_PLOTLY_COLORS[index % BASE_PLOTLY_COLORS.length],
      opacity: appearance.opacity ?? 0.8,
      size: isBubble
        ? rows.map((row) => valueOf(row, bindings.size, ["size"]))
        : 9,
      sizemode: isBubble ? "area" : undefined,
      sizeref: isBubble ? sizeRef : undefined,
      sizemin: isBubble ? 4 : undefined,
    },
    hovertemplate:
      labels.tooltip ||
      "%{text}<br>x: %{x}<br>y: %{y}<extra>%{fullData.name}</extra>",
  }));
  return {
    data,
    layout: withReferenceLines(baseLayout(
      {
        ...labels,
        xAxis: labels.xAxis || bindings.x,
        yAxis: labels.yAxis || bindings.y,
      },
      appearance,
    ), referenceLines),
    config: DEFAULT_CONFIG,
  };
}

function heatmapSpec(spec) {
  const {
    appearance = {},
    bindings = {},
    labels = {},
    series = [],
  } = spec;
  let matrix;
  if (!Array.isArray(series) && series.x && series.y && series.z) {
    matrix = series;
  } else {
    const rows = Array.isArray(series) ? series : series.records || [];
    const x = [...new Set(rows.map((row) => valueOf(row, bindings.x, ["x", "year"])))];
    const y = [...new Set(rows.map((row) => valueOf(row, bindings.y, ["y", "location"])))];
    const lookup = new Map(
      rows.map((row) => [
        `${valueOf(row, bindings.y, ["y", "location"])}|${valueOf(row, bindings.x, ["x", "year"])}`,
        valueOf(row, bindings.color, ["value", "color", "z"]),
      ]),
    );
    matrix = {
      x,
      y,
      z: y.map((row) => x.map((column) => lookup.get(`${row}|${column}`) ?? null)),
    };
  }
  return {
    data: [
      {
        type: "heatmap",
        x: matrix.x,
        y: matrix.y,
        z: matrix.z,
        colorscale: appearance.colorScale === "diverging" ? "RdBu" : "Blues",
        colorbar: {
          thickness: 12,
          len: 0.72,
          x: 0.99,
          xanchor: "right",
        },
        reversescale: appearance.colorScale === "diverging",
        texttemplate: appearance.showCellValues ? "%{z}" : undefined,
        hovertemplate: labels.tooltip || "%{y}<br>%{x}: %{z}<extra></extra>",
        hoverongaps: false,
      },
    ],
    layout: baseLayout(labels, appearance),
    config: DEFAULT_CONFIG,
  };
}

function choroplethSpec(spec) {
  const {
    appearance = {},
    bindings = {},
    featureidkey = "properties.GEOID",
    geometry,
    labels = {},
    series = [],
  } = spec;
  const records = Array.isArray(series) ? series : series.records || [];
  const locations = records.map((row) =>
    valueOf(row, bindings.geography, ["geoid", "id", "location"]),
  );
  const values = records.map((row) =>
    valueOf(row, bindings.color, ["value", "color", "z"]),
  );
  return {
    data: [
      {
        type: "choropleth",
        geojson: geometry,
        featureidkey,
        locations,
        z: values,
        text: records.map((row) => row.label || row.location),
        colorscale: appearance.colorScale === "diverging" ? "RdBu" : "Blues",
        marker: {
          line: {
            color: COLORS.white,
            width: appearance.showBoundaries === false ? 0 : 0.6,
          },
        },
        hovertemplate: labels.tooltip || "%{text}<br>%{z}<extra></extra>",
      },
    ],
    layout: {
      ...baseLayout(labels, appearance),
      geo: { fitbounds: "locations", visible: false },
    },
    config: DEFAULT_CONFIG,
  };
}

/**
 * Convert a declarative chart config plus query result into one normalized
 * Plotly contract: `{ data, layout, config }`.
 */
export function toPlotly(spec) {
  switch (spec.chartType) {
    case "line":
      return lineSpec(spec);
    case "bar":
      return barSpec(spec);
    case "dumbbell":
      return twoPeriodSpec(spec, false);
    case "slope":
      return twoPeriodSpec(spec, true);
    case "scatter":
    case "bubble":
      return scatterSpec(spec);
    case "heatmap":
      return heatmapSpec(spec);
    case "choroplethMap":
      return choroplethSpec(spec);
    default:
      throw new Error(`No Plotly adapter exists for chart type "${spec.chartType}".`);
  }
}

export default toPlotly;
