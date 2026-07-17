import { COLORS } from "@/lib/constants";
import { getChartType } from "./chartRegistry";
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

/** Apply the Advanced bar-category visibility and drag-order preferences. */
function selectedCategoryRecords(records, bindings, appearance) {
  const hidden = new Set(appearance.hiddenCategories || []);
  const order = new Map(
    (appearance.categoryOrder || []).map((name, index) => [name, index]),
  );
  return records
    .map((record, index) => ({
      record,
      index,
      category: valueOf(record, bindings.category, ["category", "location", "label"]),
    }))
    .filter(({ category }) => !hidden.has(category))
    .sort((a, b) => {
      const aRank = order.has(a.category) ? order.get(a.category) : Infinity;
      const bRank = order.has(b.category) ? order.get(b.category) : Infinity;
      return aRank - bRank || a.index - b.index;
    })
    .map(({ record }) => record);
}

/** Apply the same Advanced visibility/order preferences to line series. */
function selectedLineSeries(series, appearance) {
  const hidden = new Set(appearance.hiddenCategories || []);
  const order = new Map(
    (appearance.categoryOrder || []).map((name, index) => [name, index]),
  );
  return series
    .map((item, index) => ({
      item,
      index,
      name: item.location || item.label || `Series ${index + 1}`,
    }))
    .filter(({ name }) => !hidden.has(name))
    .sort((a, b) => {
      const aRank = order.has(a.name) ? order.get(a.name) : Infinity;
      const bRank = order.has(b.name) ? order.get(b.name) : Infinity;
      return aRank - bRank || a.index - b.index;
    })
    .map(({ item }) => item);
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

const FOOTNOTE_ANNOTATION_NAME = "ppic-footnote";

/** Escape raw HTML, then allow only basic bold/italic Markdown in footnotes. */
function footnoteText(value) {
  return escapeLegendText(value)
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_\n]+)__/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<i>$2</i>")
    .replace(/\r?\n/g, "<br>");
}

function estimatedFootnoteLines(text, width, fontSize) {
  const plainText = String(text || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:amp|lt|gt);/g, "x");
  const charactersPerLine = Math.max(1, Math.floor(width / (fontSize * 0.55)));
  return plainText.split("\n").reduce(
    (total, line) =>
      total + Math.max(1, Math.ceil(line.length / charactersPerLine)),
    0,
  );
}

/**
 * Size the footnote callout to the live x-axis width. Plotly annotation widths
 * are pixels rather than paper fractions, so the responsive wrapper calls this
 * whenever its container changes size. The extra margin follows wrapped lines.
 */
export function fitFootnoteLayout(layout = {}, chartWidth = 0, chartHeight = 0) {
  const footnote = layout.annotations?.find(
    (annotation) => annotation.name === FOOTNOTE_ANNOTATION_NAME,
  );
  if (!footnote || chartWidth <= 0) return layout;

  const leftMargin = Number(layout.margin?.l) || 0;
  const rightMargin = Number(layout.margin?.r) || 0;
  const borderpad = Number(footnote.borderpad) || 0;
  const borderwidth = Number(footnote.borderwidth) || 0;
  const axisWidth = Math.max(1, chartWidth - leftMargin - rightMargin);
  const contentWidth = Math.max(1, axisWidth - 2 * (borderpad + borderwidth));
  const fontSize = Number(footnote.font?.size) || 11;
  const lineHeight = Math.round(fontSize * 1.35);
  const lines = estimatedFootnoteLines(footnote.text, contentWidth, fontSize);
  const extraHeight = (lines - 1) * lineHeight;
  const bottomMargin = (Number(layout.margin?.b) || 0) + extraHeight;
  const annotations = layout.annotations.map((annotation) =>
    annotation.name === FOOTNOTE_ANNOTATION_NAME
      ? { ...annotation, width: contentWidth }
      : annotation,
  );
  const next = {
    ...layout,
    annotations,
    margin: { ...layout.margin, b: bottomMargin },
  };

  // Bottom legends share this margin. Anchor their first row a fixed number of
  // pixels after the responsive callout instead of relying on plot-height units.
  if (layout.legend?.orientation === "h" && chartHeight > 0) {
    const topMargin = Number(layout.margin?.t) || 0;
    const plotHeight = Math.max(1, chartHeight - topMargin - bottomMargin);
    const footnoteHeight = lines * lineHeight + 2 * borderpad;
    const legendOffset = Math.abs(Number(footnote.yshift) || 0) + footnoteHeight + 12;
    next.legend = { ...layout.legend, y: -legendOffset / plotHeight };
  }

  return next;
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
  // Bottom legends pack many entries into narrow, plot-width columns, so a
  // slightly smaller type keeps long region names on one line instead of
  // overflowing into the next column or clipping at the plot edge. Right/side
  // legends have a full column each and keep the requested size.
  const effectiveLegendFontSize =
    appearance.legendPosition === "bottom"
      ? Math.min(legendFontSize, 11)
      : legendFontSize;
  // Footnotes live in the bottom margin, immediately after the x-axis tick
  // labels/title. A pixel shift keeps that relationship stable as the chart's
  // responsive plot area changes height (the old paper-relative y coordinate
  // could drift upward and cover the axis labels).
  const footnoteAxisOffset =
    Math.round(axisFontSize * 1.5) +
    (labels.xAxis ? Math.round(axisFontSize * 1.3) + 12 : 0);
  const footnotePadding = 8;
  const footnoteHeight = Math.round(sourceFontSize * 1.35) + footnotePadding * 2;
  if (legend.legend) {
    legend.legend = {
      ...legend.legend,
      font: {
        family: fontFamily,
        size: effectiveLegendFontSize,
        color: COLORS.gray6,
      },
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
      // Size each swatch to its own trace: a small marker centered on a thin
      // line. Plotly's "constant" sizing forced a chunky 12px marker + 5px line
      // that the symbol box clipped, so the line-chart circle rendered as an
      // off-centre half-disc at the line's left end. `itemwidth` is held at
      // Plotly's 30px floor so the indicator line stays as short as allowed.
      itemsizing: "trace",
      itemwidth: 30,
      // Pull the label a touch closer to the swatch so the whole item reads as
      // one compact unit rather than a long line trailing into text.
      indentation: -4,
      // Space entries proportionally to the legend text — smaller legends
      // tighten up, larger ones breathe (roughly the 48px-per-component rule
      // once label height is included).
      tracegroupgap: Math.round(effectiveLegendFontSize * 0.6),
      // Bottom legends flow horizontally and wrap. Two even half-width columns
      // (entrywidth 0.5) give each entry a predictable, generous column instead
      // of Plotly packing a third column that clips the right-hand labels; at
      // the smaller bottom-legend type the longest region names fit on one line.
      ...(appearance.legendPosition === "bottom"
        ? { entrywidth: 0.5, entrywidthmode: "fraction" }
        : {}),
    };
    // When both elements use the bottom margin, keep the legend below the
    // footnote callout instead of letting its first row overlap the box.
    if (labels.footnote && appearance.legendPosition === "bottom") {
      legend.legend.y = -0.42;
    }
  }
  const annotations = [];
  // A subtitle normally rides in the native title block below (so Plotly spaces
  // it against the title and reserves margin automatically). The only case that
  // still needs a free-floating annotation is a subtitle with no title to hang
  // it under.
  if (labels.subtitle && !labels.title) {
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
      name: FOOTNOTE_ANNOTATION_NAME,
      text: footnoteText(labels.footnote),
      x: 0,
      xref: "paper",
      xanchor: "left",
      y: 0,
      yref: "paper",
      yanchor: "top",
      yshift: -footnoteAxisOffset,
      showarrow: false,
      align: "left",
      bgcolor: COLORS.gray3,
      bordercolor: COLORS.gray3,
      borderpad: footnotePadding,
      borderwidth: 0,
      font: {
        family: "Arial, sans-serif",
        size: sourceFontSize,
        color: COLORS.darkGray,
      },
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
  // Explicit top-margin budget for the heading block (see margin.t below).
  // wrapTitle breaks a title onto a second line once it passes 30 chars, so the
  // margin tracks that same threshold; ~1.3× the font size approximates a line
  // box, plus a small gap above the title and between title and subtitle.
  const titleLineHeight = Math.round(titleFontSize * 1.3);
  const titleLines = wrapTitle(labels.title || "").includes("<br>") ? 2 : 1;
  const topMargin = labels.title
    ? 20 +
      titleLines * titleLineHeight +
      (labels.subtitle ? Math.round(subtitleFontSize * 1.3) + 8 : 0)
    : 24 + (labels.subtitle ? 30 : 0);
  return {
    title: labels.title
      ? {
          text: wrapTitle(labels.title),
          font: { family: fontFamily, size: titleFontSize, color: COLORS.gray7 },
          // Native Plotly subtitle: it renders directly beneath the title with a
          // built-in gap, so a wrapped (two-line) title can never collide with
          // it the way the old fixed-position annotation did.
          ...(labels.subtitle
            ? {
                subtitle: {
                  text: labels.subtitle,
                  font: {
                    family: fontFamily,
                    size: subtitleFontSize,
                    color: COLORS.gray5,
                  },
                },
              }
            : {}),
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
      // Reserve room for the whole heading block explicitly. Plotly's
      // `title.automargin` only grows the margin for cartesian subplots, not for
      // geo/map layouts, so a wrapped map title would render above the tile and
      // get clipped. Sizing the margin to the title's own line count (wrapTitle
      // breaks past 30 chars) plus the subtitle keeps every chart type correct.
      t: topMargin,
      // A bottom legend needs room beneath the x-axis title.
      b:
        (appearance.legendPosition === "bottom" ? 104 : 60) +
        (labels.footnote ? footnoteHeight + 20 : 0),
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
  const selected = selectedLineSeries(series, appearance);
  const transformed = transformSeries(selected, transforms, field);
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
      selected,
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
  const sourceRecords = Array.isArray(series) ? series : series.records || [];
  const records = selectedCategoryRecords(sourceRecords, bindings, appearance);
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

// Diverging bar: a Bar-family variant where each category's bar starts at a
// `center` reference value instead of zero, so categories above center extend
// one way and those below extend the other. Values are colored by side (above /
// below center) and a reference line marks the center. Reuses the same
// category/measure record contract as barSpec (view=category records).
function divergingBarSpec(spec) {
  const { appearance = {}, bindings = {}, labels = {}, series = [] } = spec;
  const sourceRecords = Array.isArray(series) ? series : series.records || [];
  const records = selectedCategoryRecords(sourceRecords, bindings, appearance);
  const dataLabelFontSize = appearanceNumber(appearance, "dataLabelFontSize", 14);
  const center = appearanceNumber(appearance, "center", 0);
  // Diverging bars default to horizontal; only an explicit "vertical" flips it.
  const horizontal = appearance.orientation !== "vertical";

  const categories = records.map((row) =>
    valueOf(row, bindings.category, ["category", "location", "label"]),
  );
  const rawValues = records.map((row) => {
    const raw = valueOf(row, bindings.y, ["value", "y"]);
    // Guard nullish/empty before Number() — Number(null) is 0, not NaN.
    const value = raw == null || raw === "" ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  });
  // Bar length = distance from the center; `base: center` (below) anchors the
  // start so the value axis still reads in true units.
  const offsets = rawValues.map((value) => (value == null ? null : value - center));

  const aboveColor = appearance.divergePositiveColor || COLORS.blue3;
  const belowColor = appearance.divergeNegativeColor || COLORS.orange3;
  const colors = offsets.map((offset) =>
    offset == null ? COLORS.gray3 : offset >= 0 ? aboveColor : belowColor,
  );

  const measureAxisKey = horizontal ? "x" : "y";
  const categoryAxisKey = horizontal ? "y" : "x";
  const trace = {
    type: "bar",
    orientation: horizontal ? "h" : "v",
    [categoryAxisKey]: categories,
    [measureAxisKey]: offsets,
    base: center,
    marker: { color: colors },
    customdata: rawValues,
    text: appearance.showValueLabels ? rawValues : undefined,
    textposition: appearance.showValueLabels ? "auto" : undefined,
    textfont: appearance.showValueLabels
      ? { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 }
      : undefined,
    hovertemplate:
      labels.tooltip ||
      (horizontal
        ? "%{y}<br>%{customdata}<extra></extra>"
        : "%{x}<br>%{customdata}<extra></extra>"),
  };

  const layout = baseLayout(labels, appearance);
  if (horizontal) layout.yaxis = { ...layout.yaxis, autorange: "reversed" };
  // Center reference line: vertical when the measure is on x, horizontal when
  // the measure is on y.
  const centerLine = [
    { type: horizontal ? "vertical" : "horizontal", value: center },
  ];
  return {
    data: [trace],
    layout: withReferenceLines(layout, centerLine),
    config: DEFAULT_CONFIG,
  };
}

// How the CI ends and the estimate marker render, exposed as Forest-plot
// appearance controls. Plotly marker symbols: "line-ns" is a vertical bar
// (a classic CI cap/serif); the rest are literal shapes.
const FOREST_ENDPOINT_SYMBOL = Object.freeze({
  caps: "line-ns",
  bars: "line-ns",
  dots: "circle",
  diamonds: "diamond-open",
});
const FOREST_POINT_SYMBOL = Object.freeze({
  square: "square",
  diamond: "diamond",
  dot: "circle",
});

function twoPeriodSpec(spec, { slope = false, forest = false } = {}) {
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

  // Forest plot (Range-family variant for meta-analysis): a thin CI whisker per
  // study, style-controlled endpoint caps, a consistently sized estimate
  // marker, and a "line of no effect".
  if (forest) {
    const estimates = hasPoint
      ? points
      : records.map((_, index) => {
          const lo = Number(starts[index]);
          const hi = Number(ends[index]);
          return Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : null;
        });
    const markerColor = seriesColor(appearance, categories[0] ?? "estimate", 0);

    const ciLines = records.map((_, index) => ({
      type: "scatter",
      mode: "lines",
      x: [starts[index], ends[index]],
      y: [categories[index], categories[index]],
      line: { color: COLORS.gray5, width: 1.5 },
      showlegend: false,
      hoverinfo: "skip",
    }));

    const endpointStyle = appearance.endpointStyle || "caps";
    const endpointSymbol = FOREST_ENDPOINT_SYMBOL[endpointStyle];
    const endpointTraces =
      endpointStyle !== "none" && endpointSymbol
        ? [
            {
              type: "scatter",
              mode: "markers",
              x: [...starts, ...ends],
              y: [...categories, ...categories],
              marker: {
                symbol: endpointSymbol,
                color: COLORS.gray5,
                size: endpointSymbol === "line-ns" ? 14 : 8,
                line: { color: COLORS.gray5, width: 1.5 },
              },
              showlegend: false,
              hoverinfo: "skip",
            },
          ]
        : [];

    const pointStyle = appearance.pointStyle || "square";
    const pointSymbol = FOREST_POINT_SYMBOL[pointStyle];
    const estimateTraces =
      pointStyle !== "none" && pointSymbol
        ? [
            {
              type: "scatter",
              mode: appearance.showPointLabels ? "markers+text" : "markers",
              name: wrapLegendLabel(bindings.point || "Estimate", appearance),
              x: estimates,
              y: categories,
              texttemplate: appearance.showPointLabels ? "%{x:,}" : undefined,
              textposition: "top center",
              textfont: {
                family: "Arial, sans-serif",
                size: dataLabelFontSize,
                color: COLORS.gray6,
              },
              marker: {
                symbol: pointSymbol,
                color: markerColor,
                size: 13,
                line: { color: "#ffffff", width: 1 },
              },
              customdata: records.map((_, index) => [starts[index], ends[index]]),
              hovertemplate:
                labels.tooltip ||
                "%{y}<br>Estimate: %{x}<br>CI: %{customdata[0]} – %{customdata[1]}<extra></extra>",
            },
          ]
        : [];

    // Line of no effect (0 for differences, 1 for ratios); hidden when unset.
    const noEffect = Number(appearance.noEffectValue);
    const noEffectLine = Number.isFinite(noEffect)
      ? [{ type: "vertical", value: noEffect }]
      : [];

    const forestLayout = rangeLayout();
    // Give every study a readable row instead of compressing long forests into
    // the generic chart height. PlotlyChart honors this requested minimum.
    forestLayout.height = Math.max(520, 220 + records.length * 52);
    // Studies read top-to-bottom in their given order (Plotly stacks the first
    // category at the bottom otherwise).
    forestLayout.yaxis = { ...forestLayout.yaxis, autorange: "reversed" };

    return {
      data: [...ciLines, ...endpointTraces, ...estimateTraces],
      layout: withReferenceLines(forestLayout, noEffectLine),
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

const NUMERIC_AXIS_TICK_POSITIONS = 6;

function uniqueAxisPositions(data, axis) {
  const values = (data || []).flatMap((trace) =>
    Array.isArray(trace?.[axis]) ? trace[axis] : [],
  );
  return new Set(
    values
      .filter((value) => value != null && value !== "")
      .map((value) => String(value)),
  ).size;
}

function linePositionCounts(chartType, data) {
  const xCount = Math.max(1, uniqueAxisPositions(data, "x"));
  const yCount = Math.max(1, uniqueAxisPositions(data, "y"));

  if (chartType === "line") {
    return { horizontal: Math.max(1, data.length), vertical: xCount };
  }
  if (chartType === "bar" || chartType === "divergingBar") {
    const horizontalBars = data[0]?.orientation === "h";
    return horizontalBars
      ? { horizontal: yCount, vertical: NUMERIC_AXIS_TICK_POSITIONS }
      : { horizontal: NUMERIC_AXIS_TICK_POSITIONS, vertical: xCount };
  }
  if (["dumbbell", "forest", "dotPlot"].includes(chartType)) {
    return { horizontal: yCount, vertical: NUMERIC_AXIS_TICK_POSITIONS };
  }
  if (chartType === "slope") {
    return { horizontal: Math.max(1, data.length), vertical: xCount };
  }
  return { horizontal: yCount, vertical: xCount };
}

function pixelPadding(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return Math.min(100, Math.round(number));
}

function withLinePaddingMeta(result, spec) {
  if (!getChartType(spec.chartType)?.lineAxes || !result.layout) return result;
  const counts = linePositionCounts(spec.chartType, result.data || []);
  return {
    ...result,
    layout: {
      ...result.layout,
      meta: {
        ...(result.layout.meta || {}),
        ppicLinePadding: {
          horizontal: pixelPadding(spec.appearance?.horizontalLinePadding),
          vertical: pixelPadding(spec.appearance?.verticalLinePadding),
          horizontalCount: counts.horizontal,
          verticalCount: counts.vertical,
        },
      },
    },
  };
}

/**
 * Convert a declarative chart config plus query result into one normalized
 * Plotly contract: `{ data, layout, config }`. The `dataTable` chart type is the
 * exception: it short-circuits to `{ table }`, consumed by DataTableView rather
 * than Plotly.
 */
export function toPlotly(spec) {
  let result;
  switch (spec.chartType) {
    case "line":
      result = lineSpec(spec);
      break;
    case "bar":
      result = barSpec(spec);
      break;
    case "divergingBar":
      result = divergingBarSpec(spec);
      break;
    case "dumbbell":
      result = twoPeriodSpec(spec, {});
      break;
    case "slope":
      result = twoPeriodSpec(spec, { slope: true });
      break;
    case "forest":
      result = twoPeriodSpec(spec, { forest: true });
      break;
    case "dotPlot":
      result = dotPlotSpec(spec);
      break;
    case "scatter":
    case "bubble":
      result = scatterSpec(spec);
      break;
    case "heatmap":
      result = heatmapSpec(spec);
      break;
    case "choroplethMap":
      result = choroplethSpec(spec);
      break;
    case "pie":
      result = pieSpec(spec);
      break;
    case "symbolMap":
      result = symbolMapSpec(spec);
      break;
    case "dataTable":
      // Not a Plotly chart: hand the displayed table straight to DataTableView.
      return { table: spec.series };
    default:
      throw new Error(`No Plotly adapter exists for chart type "${spec.chartType}".`);
  }

  return withLinePaddingMeta(result, spec);
}

export default toPlotly;
