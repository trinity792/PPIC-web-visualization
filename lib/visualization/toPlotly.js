import { COLORS } from "@/lib/constants";
import { paletteForScale, seriesColor } from "./palettes";
import { applyTransform } from "./transformRegistry";
import {
  DEFAULT_PLOTLY_CONFIG as DEFAULT_CONFIG,
  PLOTLY_FONT,
  PLOTLY_GRID_COLOR,
  PLOTLY_SURFACE,
  legendFor,
  wrapTitle,
} from "./plotlyDefaults";

function valueOf(record, binding, fallbacks) {
  for (const key of [...fallbacks, binding]) {
    if (key && record?.[key] !== undefined) return record[key];
  }
  return undefined;
}

function appearanceNumber(appearance, key, fallback) {
  const value = Number(appearance?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function chartFontFamily(appearance = {}) {
  if (appearance.fontFamily === "arial") return "Arial, sans-serif";
  return "Source Sans 3, Arial, sans-serif";
}

function escapeLegendText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapLegendLabel(value, appearance = {}) {
  const text = escapeLegendText(value);
  if (appearance.legendWrap === false) return text;

  const maxChars =
    Number(appearance.legendWrapChars) ||
    (appearance.legendPosition === "bottom" ? 24 : 18);
  if (text.length <= maxChars) return text;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return text;

  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.join("<br>");
}

function baseLayout(labels = {}, appearance = {}) {
  const titleFontSize = appearanceNumber(appearance, "titleFontSize", 20);
  const subtitleFontSize = appearanceNumber(appearance, "subtitleFontSize", 18);
  const axisFontSize = appearanceNumber(appearance, "axisFontSize", 14);
  const legendFontSize = appearanceNumber(appearance, "legendFontSize", 14);
  const sourceFontSize = appearanceNumber(appearance, "sourceFontSize", 11);
  const fontFamily = chartFontFamily(appearance);
  const legend = legendFor(appearance.legendPosition);
  if (legend.legend) {
    legend.legend = {
      ...legend.legend,
      font: { family: fontFamily, size: legendFontSize, color: COLORS.gray6 },
      title: labels.legend
        ? {
            text: labels.legend,
            font: {
              family: fontFamily,
              size: Math.max(legendFontSize, 16),
              color: COLORS.gray7,
            },
          }
        : undefined,
      itemsizing: "constant",
      itemwidth: appearanceNumber(appearance, "legendIndicatorWidth", 24),
      tracegroupgap: 3,
      ...(appearance.legendPosition === "bottom"
        ? { entrywidth: 140, entrywidthmode: "pixels" }
        : {}),
    };
  }
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
      font: { family: fontFamily, size: subtitleFontSize, color: COLORS.gray5 },
    });
  }
  if (labels.footnote) {
    annotations.push({
      text: labels.footnote,
      x: 0,
      xref: "paper",
      xanchor: "left",
      y: -0.18,
      yref: "paper",
      yanchor: "top",
      showarrow: false,
      font: { family: "Arial, sans-serif", size: sourceFontSize, color: COLORS.gray6 },
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
          font: { family: fontFamily, size: titleFontSize, color: COLORS.gray7 },
        }
      : undefined,
    xaxis: {
      // `automargin` grows the margin to fit tick labels AND the axis title, and
      // `standoff` gaps the title off the tick labels, so the two never overlap
      // (matches the dashboard/UI-kit charts' axis handling).
      title: labels.xAxis
        ? {
            text: labels.xAxis,
            standoff: 12,
            font: { family: "Arial, sans-serif", size: axisFontSize, color: COLORS.gray5 },
          }
        : undefined,
      automargin: true,
      showgrid: false,
      gridcolor: PLOTLY_GRID_COLOR,
      showline: true,
      linecolor: COLORS.gray4,
      linewidth: 1,
      tickfont: { family: "Arial, sans-serif", size: axisFontSize, color: COLORS.gray4 },
      zeroline: false,
    },
    yaxis: {
      title: labels.yAxis
        ? {
            text: labels.yAxis,
            standoff: 12,
            font: { family: "Arial, sans-serif", size: axisFontSize, color: COLORS.gray5 },
          }
        : undefined,
      automargin: true,
      showgrid: true,
      gridcolor: PLOTLY_GRID_COLOR,
      showline: true,
      linecolor: COLORS.gray4,
      linewidth: 1,
      tickfont: { family: "Arial, sans-serif", size: axisFontSize, color: COLORS.gray4 },
      zeroline: false,
    },
    ...PLOTLY_SURFACE,
    // Fresh copy per layout: Plotly's cleanLayout mutates layout.font in place,
    // so the shared (frozen) default must never be passed by reference.
    font: {
      ...PLOTLY_FONT,
      family: fontFamily,
      size: axisFontSize,
      color: COLORS.gray6,
    },
    margin: {
      l: 70,
      r: 40,
      // Reserve room for the title and, when present, the subtitle beneath it so
      // they don't overlap each other or crowd the plot.
      t: (labels.title ? 60 : 24) + (labels.subtitle ? 30 : 0),
      // A bottom legend needs room beneath the x-axis title.
      b:
        (appearance.legendPosition === "bottom" ? 104 : 60) +
        (labels.footnote ? 34 : 0),
    },
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
  const data = transformed.series.map((item, index) => {
    const name = item.location || item.label || `Series ${index + 1}`;
    const legendName = wrapLegendLabel(name, appearance);
    return {
      x: item.years,
      y: item.values,
      type: "scatter",
      mode,
      name: legendName,
      line: {
        width: 2,
        color: seriesColor(appearance, name, index),
      },
      marker: { size: markerMode === "auto" ? 5 : 6 },
      connectgaps: false,
      // Stacked-area mode (e.g. regional composition on the landing tiles).
      ...(area ? { stackgroup: "one", fill: "tonexty" } : {}),
      hovertemplate: labels.tooltip || `%{x}<br>%{y}<extra>${name}</extra>`,
    };
  });

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
      const name = `${item.location} · ${layer.label}`;
      const legendName = wrapLegendLabel(name, appearance);
      data.push({
        x: item.years,
        y: item.values,
        type: "scatter",
        mode: "lines",
        name: legendName,
        line: {
          width: 2,
          dash: "dot",
          color: seriesColor(appearance, name, index),
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
  const dataLabelFontSize = appearanceNumber(appearance, "dataLabelFontSize", 14);
  const groups = new Map();
  for (const record of records) {
    const group = valueOf(record, bindings.group, ["group", "series"]) || "Value";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(record);
  }
  const horizontal = appearance.orientation === "horizontal";
  // Population-pyramid variant: the first group's values are mirrored onto the
  // negative side of the measure axis so the two groups diverge from zero.
  const mirror = Boolean(appearance.mirror);
  const data = [...groups.entries()].map(([group, rows], index) => {
    const categories = rows.map((row) =>
      valueOf(row, bindings.category, ["category", "location", "label"]),
    );
    const raw = rows.map((row) => valueOf(row, bindings.y, ["value", "y"]));
    const values =
      mirror && index === 0
        ? raw.map((value) => (value == null ? value : -value))
        : raw;
    return {
      type: "bar",
      name: wrapLegendLabel(group, appearance),
      orientation: horizontal ? "h" : "v",
      x: horizontal ? values : categories,
      y: horizontal ? categories : values,
      marker: {
        color: seriesColor(appearance, group, index),
      },
      text: appearance.showValueLabels ? values : undefined,
      textposition: appearance.showValueLabels ? "auto" : undefined,
      textfont: appearance.showValueLabels
        ? { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 }
        : undefined,
      hovertemplate: labels.tooltip || "%{x}, %{y}<extra></extra>",
    };
  });
  const layout = {
    ...baseLayout(labels, appearance),
    barmode:
      mirror
        ? "relative"
        : appearance.stackMode === "stacked"
          ? "stack"
          : appearance.stackMode === "percent"
            ? "relative"
            : "group",
    barnorm: appearance.stackMode === "percent" && !mirror ? "percent" : undefined,
  };
  if (horizontal) layout.yaxis = { ...layout.yaxis, autorange: "reversed" };
  if (mirror) {
    // The mirrored (negative) side should read as positive magnitudes.
    const measureAxis = horizontal ? "xaxis" : "yaxis";
    layout[measureAxis] = { ...layout[measureAxis], tickformat: "~s" };
  }
  return { data, layout, config: DEFAULT_CONFIG };
}

function twoPeriodSpec(spec, { slope = false } = {}) {
  const {
    appearance = {},
    bindings = {},
    labels = {},
    period = {},
    series = [],
  } = spec;
  const records = Array.isArray(series) ? series : series.records || [];
  const dataLabelFontSize = appearanceNumber(appearance, "dataLabelFontSize", 14);
  const categories = records.map((row) =>
    valueOf(row, bindings.category, ["category", "location", "label"]),
  );
  const starts = records.map((row) =>
    valueOf(row, bindings.start, ["start", "startValue"]),
  );
  const ends = records.map((row) =>
    valueOf(row, bindings.end, ["end", "endValue"]),
  );

  // The value (x) axis and per-point number labels are toggleable for the
  // range/dot-plot family. Hiding the value axis drops its ticks, gridlines,
  // and line; automargin in baseLayout keeps the category labels from crowding.
  const rangeLayout = () => {
    const layout = baseLayout(labels, appearance);
    if (appearance.showValueAxis === false) {
      layout.xaxis = { ...layout.xaxis, visible: false };
    }
    return layout;
  };

  if (slope) {
    const left = String(period.startYear ?? "Start");
    const right = String(period.endYear ?? "End");
    const data = records.map((row, index) => ({
      type: "scatter",
      mode: appearance.showEndpointLabels === false ? "lines+markers" : "lines+markers+text",
      x: [left, right],
      y: [starts[index], ends[index]],
      name: wrapLegendLabel(categories[index], appearance),
      text:
        appearance.showEndpointLabels === false
          ? undefined
          : [categories[index], categories[index]],
      textposition: ["middle left", "middle right"],
      textfont: { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 },
      line: {
        color: seriesColor(appearance, categories[index], index),
      },
      hovertemplate: labels.tooltip || "%{x}: %{y}<extra>%{fullData.name}</extra>",
    }));
    return {
      data,
      layout: baseLayout(labels, appearance),
      config: DEFAULT_CONFIG,
    };
  }

  const startName = String(period.startYear ?? "Start");
  const endName = String(period.endYear ?? "End");
  // Optional center dot between the two ends (e.g. a point estimate inside a
  // low/high confidence interval). Only drawn when the `point` role is bound.
  const points = records.map((row) => valueOf(row, bindings.point, ["point"]));
  const hasPoint =
    Boolean(bindings.point) && points.some((value) => Number.isFinite(Number(value)));

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
      mode: appearance.showPointLabels ? "markers+text" : "markers",
      name: wrapLegendLabel(startName, appearance),
      x: starts,
      y: categories,
      texttemplate: appearance.showPointLabels ? "%{x:,}" : undefined,
      textposition: "middle left",
      textfont: { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 },
      marker: { color: seriesColor(appearance, startName, 0), size: 9 },
    },
    {
      type: "scatter",
      mode: appearance.showPointLabels ? "markers+text" : "markers",
      name: wrapLegendLabel(endName, appearance),
      x: ends,
      y: categories,
      texttemplate: appearance.showPointLabels ? "%{x:,}" : undefined,
      textposition: "middle right",
      textfont: { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 },
      marker: { color: seriesColor(appearance, endName, 1), size: 9 },
    },
    ...(hasPoint
      ? [
          {
            type: "scatter",
            mode: appearance.showPointLabels ? "markers+text" : "markers",
            // The bound column name reads well in the legend (e.g. "Point Estimate").
            name: wrapLegendLabel(bindings.point, appearance),
            x: points,
            y: categories,
            texttemplate: appearance.showPointLabels ? "%{x:,}" : undefined,
            textposition: "top center",
            textfont: { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 },
            // Dark, white-ringed dot so it reads on top of the connector.
            marker: {
              color: COLORS.gray7,
              size: 10,
              line: { color: "#ffffff", width: 1.5 },
            },
          },
        ]
      : []),
  ];
  return {
    data,
    layout: rangeLayout(),
    config: DEFAULT_CONFIG,
  };
}

// Build the {x (series), y (category), z[row][col] (value)} matrix from either
// a pre-shaped {x,y,z} envelope (inline/module matrix view) or record rows.
function toMatrix(series, bindings) {
  if (!Array.isArray(series) && series?.x && series?.y && series?.z) return series;
  const rows = Array.isArray(series) ? series : series?.records || [];
  const x = [...new Set(rows.map((row) => valueOf(row, bindings.x, ["x", "year"])))];
  const y = [...new Set(rows.map((row) => valueOf(row, bindings.y, ["y", "location"])))];
  const lookup = new Map(
    rows.map((row) => [
      `${valueOf(row, bindings.y, ["y", "location"])}|${valueOf(row, bindings.x, ["x", "year"])}`,
      valueOf(row, bindings.color, ["value", "color", "z"]),
    ]),
  );
  return {
    x,
    y,
    z: y.map((row) => x.map((col) => lookup.get(`${row}|${col}`) ?? null)),
  };
}

// Multi-series dot plot: each category (matrix row) gets one coloured dot per
// series (matrix column) on a shared value axis, joined by a light range band
// spanning that category's min→max. Reuses the heatmap/matrix data path.
function dotPlotSpec(spec) {
  const { appearance = {}, bindings = {}, labels = {}, series = [] } = spec;
  const matrix = toMatrix(series, bindings);
  const rows = matrix.y || [];
  const cols = matrix.x || [];
  const z = matrix.z || [];
  const dataLabelFontSize = appearanceNumber(appearance, "dataLabelFontSize", 14);

  const finite = (values) => values.filter((v) => Number.isFinite(Number(v)));

  // One light-gray band per category row, from its lowest to its highest value.
  const bands = rows
    .map((rowName, r) => {
      const nums = finite(z[r] || []);
      if (nums.length < 2) return null;
      return {
        type: "scatter",
        mode: "lines",
        x: [Math.min(...nums), Math.max(...nums)],
        y: [rowName, rowName],
        line: { color: COLORS.gray2, width: 9 },
        showlegend: false,
        hoverinfo: "skip",
      };
    })
    .filter(Boolean);

  // Value labels: the master `showPointLabels` toggle turns them on; the
  // advanced `pointLabelSeries` map then hides specific series (default shown),
  // so a chart can label just one series (e.g. only "Women").
  const perSeries = appearance.pointLabelSeries || {};
  const labelsOn = (name) => appearance.showPointLabels && perSeries[name] !== false;
  // One trace per series (column) so the legend lists the series and each keeps
  // its palette colour across every category row.
  const dotTraces = cols.map((colName, c) => {
    const name = String(colName);
    const showText = labelsOn(name);
    return {
      type: "scatter",
      mode: showText ? "markers+text" : "markers",
      name: wrapLegendLabel(name, appearance),
      x: rows.map((_, r) => z[r]?.[c] ?? null),
      y: rows,
      texttemplate: showText ? "%{x:,}" : undefined,
      textposition: "top center",
      textfont: { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 },
      marker: { color: seriesColor(appearance, name, c), size: 12 },
      hovertemplate: labels.tooltip || "%{y} — %{x}<extra>%{fullData.name}</extra>",
    };
  });

  const layout = baseLayout(labels, appearance);
  if (appearance.showValueAxis === false) {
    layout.xaxis = { ...layout.xaxis, visible: false };
  }
  return { data: [...bands, ...dotTraces], layout, config: DEFAULT_CONFIG };
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
    name: wrapLegendLabel(group, appearance),
    x: rows.map((row) => valueOf(row, bindings.x, ["x"])),
    y: rows.map((row) => valueOf(row, bindings.y, ["y"])),
    text: rows.map((row) =>
      valueOf(row, bindings.unit, ["label", "location", "unit"]),
    ),
    marker: {
      color: seriesColor(appearance, group, index),
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
    field,
    labels = {},
    series = [],
    transforms,
  } = spec;
  const dataLabelFontSize = appearanceNumber(appearance, "dataLabelFontSize", 14);
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

  // Apply the active transform against the base-year column, one row (place)
  // at a time: each row becomes a {years, values} series so the shared,
  // null-safe transformRegistry can run unchanged (flagged issue 1). "actual"
  // (the default) is a no-op, so untransformed heatmaps render unchanged.
  const rowSeries = matrix.y.map((location, index) => ({
    location,
    years: matrix.x,
    values: matrix.z[index],
  }));
  const transformedRows = transformSeries(rowSeries, transforms, field);
  const z = transformedRows.series.map((item) => item.values);

  return {
    data: [
      {
        type: "heatmap",
        x: matrix.x,
        y: matrix.y,
        z,
        // Deliberately left as the Plotly built-in "Blues"/"RdBu" names
        // (distinct from the choropleth's custom CHOROPLETH_BLUES ramp in
        // palettes.js) so default-appearance heatmap rendering is unchanged.
        colorscale: appearance.colorScale === "diverging" ? "RdBu" : "Blues",
        colorbar: {
          thickness: 12,
          len: 0.72,
          x: 0.99,
          xanchor: "right",
        },
        reversescale: appearance.colorScale === "diverging",
        texttemplate: appearance.showCellValues ? "%{z}" : undefined,
        textfont: appearance.showCellValues
          ? { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 }
          : undefined,
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
        colorscale: paletteForScale(
          appearance.colorScale === "diverging" ? "diverging" : "sequential",
        ),
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

function pieSpec(spec) {
  const { appearance = {}, bindings = {}, labels = {}, series = [] } = spec;
  const records = Array.isArray(series) ? series : series.records || [];
  const dataLabelFontSize = appearanceNumber(appearance, "dataLabelFontSize", 14);
  const labelsList = records.map((row) =>
    valueOf(row, bindings.category, ["category", "label", "location"]),
  );
  const values = records.map((row) => valueOf(row, bindings.y, ["value", "y"]));
  return {
    data: [
      {
        type: "pie",
        labels: labelsList.map((name) => wrapLegendLabel(name, appearance)),
        values,
        // hole = 0 renders a pie; > 0 renders the donut variant.
        hole: appearance.hole ?? 0,
        marker: {
          colors: labelsList.map((name, index) => seriesColor(appearance, name, index)),
        },
        sort: appearance.sort === "none" ? false : undefined,
        textinfo: appearance.showValueLabels === false ? "none" : undefined,
        textfont: { family: "Arial, sans-serif", size: dataLabelFontSize },
        hovertemplate: labels.tooltip || "%{label}: %{value}<extra></extra>",
      },
    ],
    layout: baseLayout(labels, appearance),
    config: DEFAULT_CONFIG,
  };
}

function symbolMapSpec(spec) {
  const { appearance = {}, bindings = {}, labels = {}, series = [] } = spec;
  const records = Array.isArray(series) ? series : series.records || [];
  const sizes = records.map((row) => valueOf(row, bindings.size, ["value", "size"]));
  const maxSize = Math.max(...sizes.map(Number).filter(Number.isFinite), 1);
  return {
    data: [
      {
        type: "scattergeo",
        mode: "markers",
        lat: records.map((row) => row.lat),
        lon: records.map((row) => row.lon),
        text: records.map((row) =>
          valueOf(row, bindings.geography, ["location", "label"]),
        ),
        marker: {
          size: sizes,
          sizemode: appearance.sizeByArea === false ? "diameter" : "area",
          sizeref: (2 * maxSize) / 40 ** 2,
          sizemin: 3,
          opacity: appearance.opacity ?? 0.75,
          color: COLORS.blue3,
          line: { color: COLORS.white, width: 0.5 },
        },
        hovertemplate: labels.tooltip || "%{text}: %{marker.size}<extra></extra>",
      },
    ],
    layout: {
      ...baseLayout(labels, appearance),
      geo: { fitbounds: "locations", visible: false, scope: "usa" },
    },
    config: DEFAULT_CONFIG,
  };
}

/**
 * Convert a declarative chart config plus query result into one normalized
 * Plotly contract: `{ data, layout, config }`. The `dataTable` chart type is the
 * exception: it short-circuits to `{ table }`, consumed by DataTableView rather
 * than Plotly.
 */
export function toPlotly(spec) {
  switch (spec.chartType) {
    case "line":
      return lineSpec(spec);
    case "bar":
      return barSpec(spec);
    case "dumbbell":
      return twoPeriodSpec(spec, {});
    case "slope":
      return twoPeriodSpec(spec, { slope: true });
    case "dotPlot":
      return dotPlotSpec(spec);
    case "scatter":
    case "bubble":
      return scatterSpec(spec);
    case "heatmap":
      return heatmapSpec(spec);
    case "choroplethMap":
      return choroplethSpec(spec);
    case "pie":
      return pieSpec(spec);
    case "symbolMap":
      return symbolMapSpec(spec);
    case "dataTable":
      // Not a Plotly chart: hand the displayed table straight to DataTableView.
      return { table: spec.series };
    default:
      throw new Error(`No Plotly adapter exists for chart type "${spec.chartType}".`);
  }
}

export default toPlotly;
