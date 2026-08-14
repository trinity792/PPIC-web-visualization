import { COLORS } from "@/lib/constants";
import { getChartType } from "./chartRegistry";
import { rampProps, resolveToken, seriesColor } from "./palettes";
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

// Decimal-places control. Whole-number measures (people/housing/generic counts)
// keep their native integer formatting; the setting only reformats non-integer
// measures — ratios, percentages, rates — plus any percent-change/index
// transform of a count, whose values are inherently fractional.
const INTEGER_MEASURE_UNITS = new Set(["people", "housingUnits", "count", "number"]);
const NON_INTEGER_TRANSFORMS = new Set(["percentChange", "indexed"]);
const DEFAULT_DECIMAL_PLACES = 2; // hundredths

/**
 * The d3 number format for the spec's measure values (e.g. ",.2f"), or null to
 * leave native formatting untouched. Returns null for integer-valued measures
 * so years and whole counts never gain spurious decimals.
 */
function measureFormat(spec) {
  const unit = spec?.field?.formatter || spec?.field?.unit;
  const transformId = spec?.transforms?.id;
  const nonInteger =
    NON_INTEGER_TRANSFORMS.has(transformId) ||
    (unit != null && !INTEGER_MEASURE_UNITS.has(unit));
  if (!nonInteger) return null;
  const raw = Number(spec?.appearance?.decimalPlaces);
  const decimals =
    Number.isFinite(raw) && raw >= 0 ? Math.min(10, Math.trunc(raw)) : DEFAULT_DECIMAL_PLACES;
  return `,.${decimals}f`;
}

/** Append a d3 format to a Plotly template token: fmtToken("%{z}", ",.2f"). */
function fmtToken(token, format) {
  if (!format) return token;
  // token is like "%{z}" or "%{customdata[0]}" — insert ":format" before "}".
  return token.replace(/\}$/, `:${format}}`);
}

/**
 * Which layout axis (or axes) carries the measure, by chart type, so decimal
 * formatting lands on value ticks/hover but never on the category or temporal
 * (year/period) axis. Non-cartesian charts (maps, pie, heatmap) return [] and
 * format their measure via the hovertemplate token instead.
 */
function measureAxes(spec) {
  const { chartType, appearance = {} } = spec;
  // Workstream B: a diverging bar reads its measure axis with the orientations
  // reversed from a plain bar's, preserving each variant's pre-merge default
  // exactly.
  const diverging = Boolean(appearance.diverging);
  switch (chartType) {
    case "line":
      return ["yaxis"];
    case "bar":
      return [
        diverging
          ? appearance.orientation === "vertical"
            ? "yaxis"
            : "xaxis"
          : appearance.orientation === "horizontal"
            ? "xaxis"
            : "yaxis",
      ];
    case "dumbbell":
    case "forest":
    case "dotPlot":
      return ["xaxis"];
    case "scatter":
    case "bubble":
      return ["xaxis", "yaxis"];
    default:
      return [];
  }
}

/**
 * Apply the measure decimal format to the measure axis/axes' tick and hover
 * formatting. Bare "%{x}"/"%{y}" tokens honor the axis hoverformat, so this
 * covers most hover numbers centrally; non-axis tokens are formatted in-spec.
 */
function withMeasureFormat(result, spec) {
  const format = measureFormat(spec);
  if (!format || !result?.layout) return result;
  const axes = measureAxes(spec);
  if (axes.length === 0) return result;
  const layout = { ...result.layout };
  for (const axis of axes) {
    layout[axis] = { ...(layout[axis] || {}), hoverformat: format, tickformat: format };
  }
  return { ...result, layout };
}

const DEFAULT_GROUP_GAP = 0.75;
const GROUP_HEADER_OFFSET = 0.7;
const GROUPED_ROW_LABEL_GAP = 12;
const GROUPED_ROW_MIN_LABEL_COLUMN_WIDTH = 44;
const GROUPED_ROW_TEXT_WIDTH_RATIO = 0.55;
const GROUPED_ROW_MAX_INDENT = 200;
const GROUPED_ROW_ALIGNMENTS = new Set(["left", "center", "right"]);
const RANGE_ROW_HEIGHT = 52;
const RANGE_VERTICAL_CHROME = 220;

function rangeHeight(sections, rowCount) {
  const visualRows = sections.grouped ? sections.maxPosition + 2 : rowCount;
  return Math.max(520, RANGE_VERTICAL_CHROME + visualRows * RANGE_ROW_HEIGHT);
}

/**
 * Build stable category blocks for every sectioning chart family. The incoming
 * record order already represents the chart's active value/name sort; this
 * helper restores first-seen group blocks and applies manual category order
 * only inside each block. Numeric axis positions create true empty space
 * between blocks without injecting fake records into traces.
 */
export function groupedCategorySections(
  records,
  {
    bindings = {},
    appearance = {},
    categoryRole = "category",
    categoryFallbacks = ["category", "location", "label"],
  } = {},
) {
  const hidden = new Set(appearance.hiddenCategories || []);
  const manualOrder = new Map(
    (appearance.categoryOrder || []).map((name, index) => [name, index]),
  );
  const visible = (records || [])
    .map((record, index) => ({
      record,
      index,
      category: valueOf(record, bindings[categoryRole], categoryFallbacks),
      group: valueOf(record, bindings.group, ["group"]),
    }))
    .filter(({ category }) => !hidden.has(category));

  const grouped = Boolean(bindings.group) && visible.some(({ group }) => group != null);
  if (!grouped) {
    const items = visible
      .sort((a, b) => {
        const aRank = manualOrder.get(a.category) ?? Infinity;
        const bRank = manualOrder.get(b.category) ?? Infinity;
        return aRank - bRank || a.index - b.index;
      })
      .map((item) => ({ ...item, axisValue: item.category }));
    return { grouped: false, items, headers: [], tickvals: [], ticktext: [] };
  }

  const blocks = [];
  const byGroup = new Map();
  for (const item of visible) {
    const key = item.group == null ? "" : String(item.group);
    if (!byGroup.has(key)) {
      const block = { key, label: key, items: [] };
      byGroup.set(key, block);
      blocks.push(block);
    }
    byGroup.get(key).items.push(item);
  }

  const gap = Math.max(
    0,
    Math.min(3, appearanceNumber(appearance, "groupGap", DEFAULT_GROUP_GAP)),
  );
  const items = [];
  const headers = [];
  const tickvals = [];
  const ticktext = [];
  let cursor = 0;

  for (const block of blocks) {
    const categoryOrder = [];
    const categoryItems = new Map();
    for (const item of block.items) {
      const key = String(item.category ?? "");
      if (!categoryItems.has(key)) {
        categoryItems.set(key, []);
        categoryOrder.push(key);
      }
      categoryItems.get(key).push(item);
    }
    categoryOrder.sort((a, b) => {
      const aRank = manualOrder.get(a) ?? Infinity;
      const bRank = manualOrder.get(b) ?? Infinity;
      return aRank - bRank;
    });

    const firstPosition = cursor;
    for (const category of categoryOrder) {
      const position = cursor;
      tickvals.push(position);
      ticktext.push(category);
      for (const item of categoryItems.get(category)) {
        items.push({ ...item, axisValue: position });
      }
      cursor += 1;
    }
    headers.push({
      label: block.label,
      firstPosition,
      lastPosition: Math.max(firstPosition, cursor - 1),
      position: firstPosition - GROUP_HEADER_OFFSET,
    });
    cursor += gap;
  }

  return {
    grouped: true,
    items,
    headers,
    tickvals,
    ticktext,
    gap,
    maxPosition: tickvals.at(-1) ?? 0,
  };
}

function groupedRowAlignment(appearance, key, fallback) {
  const value = appearance?.[key];
  return GROUPED_ROW_ALIGNMENTS.has(value) ? value : fallback;
}

function groupedRowIndent(appearance, key) {
  const value = Number(appearance?.[key]);
  return Number.isFinite(value)
    ? Math.max(0, Math.min(GROUPED_ROW_MAX_INDENT, value))
    : 0;
}

function groupedRowLabelLayout(layout, sections, axisFontSize, appearance) {
  const yAxis = layout.yaxis || {};
  const titleFontSize = Number(yAxis.title?.font?.size) || axisFontSize;
  const titleReserve = yAxis.title?.text
    ? Math.ceil(titleFontSize * 1.4 + (Number(yAxis.title.standoff) || 0))
    : 0;
  const estimatedVariableWidth = Math.ceil(
    Math.max(0, ...sections.ticktext.map((label) => String(label ?? "").length)) *
      axisFontSize *
      GROUPED_ROW_TEXT_WIDTH_RATIO,
  );
  const groupAlignment = groupedRowAlignment(
    appearance,
    "groupLabelAlignment",
    "left",
  );
  const estimatedGroupWidth =
    groupAlignment === "left"
      ? 0
      : Math.ceil(
          Math.max(
            0,
            ...sections.headers.map((header) => String(header.label ?? "").length),
          ) *
            axisFontSize *
            GROUPED_ROW_TEXT_WIDTH_RATIO,
        );
  const baseLeftMargin = Number(layout.margin?.l) || 0;
  const labelColumnWidth = Math.max(
    GROUPED_ROW_MIN_LABEL_COLUMN_WIDTH,
    estimatedVariableWidth + GROUPED_ROW_LABEL_GAP,
    estimatedGroupWidth + GROUPED_ROW_LABEL_GAP,
    baseLeftMargin - titleReserve,
  );
  return {
    labelColumnWidth,
    leftMargin: titleReserve + labelColumnWidth,
    titleReserve,
  };
}

function groupedRowLabelPlacement(rowLayout, alignment, indent) {
  const left = -rowLayout.labelColumnWidth;
  const right = -GROUPED_ROW_LABEL_GAP;
  if (alignment === "right") {
    return { align: "right", xanchor: "right", xshift: right - indent };
  }
  if (alignment === "center") {
    return {
      align: "center",
      xanchor: "center",
      xshift: (left + right) / 2 + indent,
    };
  }
  return { align: "left", xanchor: "left", xshift: left + indent };
}

function withGroupedCategoryAxis(layout, sections, axisName, appearance = {}) {
  if (!sections.grouped) return layout;
  const axisKey = `${axisName}axis`;
  const axisFontSize = appearanceNumber(appearance, "axisFontSize", 14);
  const rowLabelLayout =
    axisName === "y"
      ? groupedRowLabelLayout(layout, sections, axisFontSize, appearance)
      : null;
  const groupLabelPlacement = rowLabelLayout
    ? groupedRowLabelPlacement(
        rowLabelLayout,
        groupedRowAlignment(appearance, "groupLabelAlignment", "left"),
        groupedRowIndent(appearance, "groupLabelIndent"),
      )
    : null;
  const variableLabelPlacement = rowLabelLayout
    ? groupedRowLabelPlacement(
        rowLabelLayout,
        groupedRowAlignment(appearance, "variableLabelAlignment", "right"),
        groupedRowIndent(appearance, "variableLabelIndent"),
      )
    : null;
  const originalAxis = layout[axisKey] || {};
  const axis = {
    ...originalAxis,
    // A grouped row axis uses annotations in the left margin as section
    // headers. The normal y-axis spine otherwise runs vertically through those
    // headers, making the blocks look divided by a stray rule.
    ...(axisName === "y" ? { showline: false } : {}),
    tickmode: "array",
    tickvals: sections.tickvals,
    ticktext: sections.ticktext,
    range:
      axisName === "y"
        ? [sections.maxPosition + 0.5, -GROUP_HEADER_OFFSET - 0.45]
        : [-0.5, sections.maxPosition + 0.5],
    autorange: false,
    ...(rowLabelLayout
      ? { automargin: false, showticklabels: false, title: undefined }
      : {}),
  };
  const headers = sections.headers
    .filter((header) => header.label)
    .map((header) =>
      axisName === "y"
        ? {
            name: "ppic-group-header",
            text: `<b>${escapeLegendText(header.label)}</b>`,
            x: 0,
            xref: "paper",
            ...groupLabelPlacement,
            y: header.position,
            yref: "y",
            yanchor: "middle",
            showarrow: false,
            font: {
              family: chartFontFamily(appearance),
              size: axisFontSize,
              color: COLORS.gray6,
            },
          }
        : {
            name: "ppic-group-header",
            text: `<b>${escapeLegendText(header.label)}</b>`,
            x: header.firstPosition,
            xref: "x",
            xanchor: "left",
            y: 1.02,
            yref: "paper",
            yanchor: "bottom",
            align: "left",
            showarrow: false,
            font: {
              family: chartFontFamily(appearance),
              size: axisFontSize,
              color: COLORS.gray6,
            },
          },
    );
  const variableLabels = rowLabelLayout
    ? sections.tickvals.map((position, index) => ({
        name: "ppic-variable-label",
        text: escapeLegendText(sections.ticktext[index]),
        x: 0,
        xref: "paper",
        ...variableLabelPlacement,
        y: position,
        yref: "y",
        yanchor: "middle",
        showarrow: false,
        font: {
          family: chartFontFamily(appearance),
          size: axisFontSize,
          color: COLORS.gray4,
        },
      }))
    : [];
  const groupedAxisTitle =
    rowLabelLayout && originalAxis.title?.text
      ? [
          {
            name: "ppic-y-axis-title",
            text: originalAxis.title.text,
            textangle: -90,
            x: 0,
            xref: "paper",
            xanchor: "center",
            xshift:
              -rowLabelLayout.labelColumnWidth - rowLabelLayout.titleReserve / 2,
            y: 0.5,
            yref: "paper",
            yanchor: "middle",
            showarrow: false,
            font: originalAxis.title.font,
          },
        ]
      : [];
  const groupedAxisSegments =
    axisName === "y"
      ? sections.headers.map((header) => ({
          name: "ppic-group-axis",
          type: "line",
          x0: 0,
          x1: 0,
          xref: "paper",
          // Restore the y-axis alongside each block while leaving a break
          // around the header and inter-group whitespace.
          y0: header.firstPosition - 0.25,
          y1: header.lastPosition + 0.35,
          yref: "y",
          layer: "above",
          line: {
            color: axis.linecolor || COLORS.gray4,
            width: axis.linewidth || 1,
          },
        }))
      : [];
  return {
    ...layout,
    [axisKey]: axis,
    margin: {
      ...layout.margin,
      ...(axisName === "x"
        ? { t: (layout.margin?.t || 0) + axisFontSize + 12 }
        : { l: rowLabelLayout.leftMargin }),
    },
    annotations: [
      ...(layout.annotations || []),
      ...headers,
      ...variableLabels,
      ...groupedAxisTitle,
    ],
    shapes: [...(layout.shapes || []), ...groupedAxisSegments],
  };
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

function legendVisible(appearance = {}) {
  return appearance.showLegend !== false && appearance.legendPosition !== "hidden";
}

function escapeLegendText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Plotly renders legend labels as SVG text, so browser word-wrapping rules do
// not apply. A zero-width marker distinguishes a break inserted inside one
// long token from a break that replaced whitespace; normalizeSeriesName uses
// that distinction when it matches a rendered trace back to hiddenSeries.
const HARD_LEGEND_BREAK = "&#8203;";
// Plotly calculates a vertical legend's clip width before it has the final
// multi-line SVG bounds. Two invisible em spaces on each wrapped line give the
// clip box a stable right inset; without it, the last glyph can be cut off.
const SIDE_LEGEND_LINE_END_PADDING = "&#8195;&#8195;";

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
  // Stop the callout before a right-hand legend column (0 when none / bottom).
  const legendReserve = Number(layout.meta?.ppicFootnoteReserve) || 0;
  const axisWidth = Math.max(1, chartWidth - leftMargin - rightMargin - legendReserve);
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
  const rawText = String(value ?? "");
  if (appearance.legendWrap === false) return escapeLegendText(rawText);

  const configuredLimit = Number(appearance.legendWrapChars);
  const maxChars =
    Number.isFinite(configuredLimit) && configuredLimit > 0
      ? Math.max(1, Math.floor(configuredLimit))
      : appearance.legendPosition === "bottom"
        ? 24
        : 18;
  if (!/[\r\n]/.test(rawText) && rawText.length <= maxChars) {
    return escapeLegendText(rawText);
  }

  const lines = [];
  const paragraphs = rawText.split(/\r?\n/);
  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let current = "";

    for (let word of words) {
      if (current && current.length + word.length + 1 > maxChars) {
        lines.push({ text: current, joinsNext: false });
        current = "";
      }

      // SVG text has no equivalent of overflow-wrap: anywhere. Split a token
      // that is itself wider than the legend column so IDs, URLs, and joined
      // category values cannot escape or be clipped by Plotly's clip path.
      while (word.length > maxChars) {
        lines.push({ text: word.slice(0, maxChars), joinsNext: true });
        word = word.slice(maxChars);
      }

      current = current ? `${current} ${word}` : word;
    }

    if (current || !words.length) {
      lines.push({ text: current, joinsNext: false });
    }
    // A manual newline is always a word boundary, including when the previous
    // paragraph ended with a full-width token.
    if (paragraphIndex < paragraphs.length - 1 && lines.length) {
      lines[lines.length - 1].joinsNext = false;
    }
  }

  const lineEndPadding =
    appearance.legendPosition === "bottom" ? "" : SIDE_LEGEND_LINE_END_PADDING;
  return lines
    .map(({ text, joinsNext }) =>
      `${escapeLegendText(text)}${lineEndPadding}${joinsNext ? HARD_LEGEND_BREAK : ""}`,
    )
    .join("<br>");
}

function baseLayout(labels = {}, appearance = {}) {
  const titleFontSize = appearanceNumber(appearance, "titleFontSize", 20);
  const subtitleFontSize = appearanceNumber(appearance, "subtitleFontSize", 18);
  const axisFontSize = appearanceNumber(appearance, "axisFontSize", 14);
  const legendFontSize = appearanceNumber(appearance, "legendFontSize", 14);
  const sourceFontSize = appearanceNumber(appearance, "sourceFontSize", 11);
  const fontFamily = chartFontFamily(appearance);
  const visibleLabels = {
    ...labels,
    title: appearance.showTitle === false ? "" : labels.title,
    subtitle: appearance.showSubtitle === false ? "" : labels.subtitle,
    xAxis: appearance.showXAxisLabel === false ? "" : labels.xAxis,
    yAxis: appearance.showYAxisLabel === false ? "" : labels.yAxis,
  };
  const legendPosition = legendVisible(appearance)
    ? appearance.legendPosition
    : "hidden";
  const legend = legendFor(legendPosition);
  // Bottom legends pack many entries into narrow, plot-width columns, so a
  // slightly smaller type keeps long region names on one line instead of
  // overflowing into the next column or clipping at the plot edge. Right/side
  // legends have a full column each and keep the requested size.
  const effectiveLegendFontSize =
    legendPosition === "bottom"
      ? Math.min(legendFontSize, 11)
      : legendFontSize;
  // Footnotes live in the bottom margin, immediately after the x-axis tick
  // labels/title. A pixel shift keeps that relationship stable as the chart's
  // responsive plot area changes height (the old paper-relative y coordinate
  // could drift upward and cover the axis labels).
  const footnoteAxisOffset =
    Math.round(axisFontSize * 1.5) +
    (visibleLabels.xAxis ? Math.round(axisFontSize * 1.3) + 12 : 0);
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
      title: visibleLabels.legend
        ? {
            text: wrapLegendLabel(visibleLabels.legend, {
              ...appearance,
              legendPosition,
            }),
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
      ...(legendPosition === "bottom"
        ? { entrywidth: 0.5, entrywidthmode: "fraction" }
        : {}),
    };
    // When both elements use the bottom margin, keep the legend below the
    // footnote callout instead of letting its first row overlap the box.
    if (visibleLabels.footnote && legendPosition === "bottom") {
      legend.legend.y = -0.42;
    }
  }
  // A right-hand (vertical) legend reserves horizontal space that Plotly grows
  // the margin for only at render time. Record an estimate of that column so the
  // footnote can stop before it (fitFootnoteLayout) instead of running under it.
  const sideLegend = Boolean(legend.legend) && legend.legend.orientation !== "h";
  const footnoteLegendReserve =
    visibleLabels.footnote && sideLegend
      ? Math.round(34 + (Number(appearance.legendWrapChars) || 18) * effectiveLegendFontSize * 0.5)
      : 0;
  const annotations = [];
  // A subtitle normally rides in the native title block below (so Plotly spaces
  // it against the title and reserves margin automatically). The only case that
  // still needs a free-floating annotation is a subtitle with no title to hang
  // it under.
  if (visibleLabels.subtitle && !visibleLabels.title) {
    annotations.push({
      text: visibleLabels.subtitle,
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
  if (visibleLabels.footnote) {
    annotations.push({
      name: FOOTNOTE_ANNOTATION_NAME,
      text: footnoteText(visibleLabels.footnote),
      x: 0,
      xref: "paper",
      xanchor: "left",
      y: 0,
      yref: "paper",
      yanchor: "top",
      yshift: -footnoteAxisOffset,
      showarrow: false,
      align: "left",
      // Softer than the old solid gray3 block: a light tint with a hairline
      // border reads as a quiet source note rather than a harsh callout.
      bgcolor: COLORS.gray1,
      bordercolor: COLORS.gray2,
      borderpad: footnotePadding,
      borderwidth: 1,
      font: {
        family: "Arial, sans-serif",
        size: sourceFontSize,
        color: COLORS.gray6,
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
  const titleLines = wrapTitle(visibleLabels.title || "").includes("<br>") ? 2 : 1;
  const topMargin = visibleLabels.title
    ? 20 +
      titleLines * titleLineHeight +
      (visibleLabels.subtitle ? Math.round(subtitleFontSize * 1.3) + 8 : 0)
    : 24 + (visibleLabels.subtitle ? 30 : 0);
  return {
    title: visibleLabels.title
      ? {
          text: wrapTitle(visibleLabels.title),
          font: { family: fontFamily, size: titleFontSize, color: COLORS.gray7 },
          // Native Plotly subtitle: it renders directly beneath the title with a
          // built-in gap, so a wrapped (two-line) title can never collide with
          // it the way the old fixed-position annotation did.
          ...(visibleLabels.subtitle
            ? {
                subtitle: {
                  text: visibleLabels.subtitle,
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
      title: visibleLabels.xAxis
        ? {
            text: visibleLabels.xAxis,
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
      title: visibleLabels.yAxis
        ? {
            text: visibleLabels.yAxis,
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
        (legendPosition === "bottom" ? 104 : 60) +
        (visibleLabels.footnote ? footnoteHeight + 20 : 0),
    },
    autosize: true,
    ...legend,
    ...(annotations.length ? { annotations } : {}),
    meta: { ppicFootnoteReserve: footnoteLegendReserve },
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
  const shapes = [...(layout.shapes || [])];
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
      // Workstream A: an optional from/to pair bounds the line to the plotted
      // rows (e.g. the forest plot's rows) instead of spanning the whole
      // paper, which is what let a reference line cross the group-header
      // band. Absent bounds keep the original paper-spanning behaviour, so
      // every other caller (diverging bar's center line, etc.) is untouched.
      const hasBounds = reference.from != null && reference.to != null;
      shapes.push({
        type: "line",
        x0: reference.value,
        x1: reference.value,
        ...(hasBounds
          ? { y0: reference.from, y1: reference.to, yref: "y" }
          : { y0: 0, y1: 1, yref: "paper" }),
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
  const sections = groupedCategorySections(sourceRecords, { bindings, appearance });
  const items = sections.items;
  const dataLabelFontSize = appearanceNumber(appearance, "dataLabelFontSize", 14);
  const format = measureFormat(spec);
  const groups = new Map();
  for (const item of items) {
    const group = valueOf(item.record, bindings.color, ["color", "series"]) || "Value";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  const horizontal = appearance.orientation === "horizontal";
  // Population-pyramid variant: the first group's values are mirrored onto the
  // negative side of the measure axis so the two groups diverge from zero.
  const mirror = Boolean(appearance.mirror);
  const data = [...groups.entries()].map(([group, rows], index) => {
    const categories = rows.map((item) => item.axisValue);
    const categoryLabels = rows.map((item) => item.category);
    const raw = rows.map((item) => valueOf(item.record, bindings.y, ["value", "y"]));
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
      texttemplate:
        appearance.showValueLabels && format ? fmtToken("%{text}", format) : undefined,
      textfont: appearance.showValueLabels
        ? { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 }
        : undefined,
      customdata: sections.grouped ? categoryLabels : undefined,
      hovertemplate:
        labels.tooltip ||
        (sections.grouped
          ? horizontal
            ? `%{customdata}: ${fmtToken("%{x}", format)}<extra></extra>`
            : `%{customdata}: ${fmtToken("%{y}", format)}<extra></extra>`
          : "%{x}, %{y}<extra></extra>"),
    };
  });
  const layout = {
    ...withGroupedCategoryAxis(
      baseLayout(labels, appearance),
      sections,
      horizontal ? "y" : "x",
      appearance,
    ),
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
  if (horizontal && !sections.grouped) {
    layout.yaxis = { ...layout.yaxis, autorange: "reversed" };
  }
  if (mirror) {
    // The mirrored (negative) side should read as positive magnitudes.
    const measureAxis = horizontal ? "xaxis" : "yaxis";
    layout[measureAxis] = { ...layout[measureAxis], tickformat: "~s" };
  }
  return { data, layout, config: DEFAULT_CONFIG };
}

// Diverging bar: a Bar-family variant where each category's bar starts at a
// `center` reference value instead of zero, so categories above center extend
// Per-bar color for a diverging bar. When `appearance.colorBuckets` is set it
// drives a threshold ("traffic-light") scheme — an array of { at, color }
// evaluated high-to-low, so a value ≥ `at` takes that color and an entry with a
// null `at` is the catch-all (this reproduces the landing dashboard's on-track
// buckets). Without buckets it falls back to the above/below-center two-color.
function divergingBarColor(value, offset, appearance) {
  if (value == null) return COLORS.gray3;
  const buckets = Array.isArray(appearance.colorBuckets) ? appearance.colorBuckets : null;
  if (buckets && buckets.length > 0) {
    const sorted = [...buckets].sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity));
    for (const bucket of sorted) {
      const threshold = bucket.at == null ? -Infinity : Number(bucket.at);
      if (value >= threshold) return resolveToken(bucket.color);
    }
    return COLORS.gray3;
  }
  // Workstream C: the above/below colors follow the active palette's first
  // two tokens (via `seriesColor`, which already resolves the palette / falls
  // back consistently for an unregistered id), still overridable by an
  // explicit color. `brand-categorical`'s first two tokens are blue3 and
  // orange3 — exactly the old hard-coded pair — so default rendering doesn't
  // move.
  const aboveColor = appearance.divergePositiveColor || seriesColor(appearance, undefined, 0);
  const belowColor = appearance.divergeNegativeColor || seriesColor(appearance, undefined, 1);
  return offset >= 0 ? aboveColor : belowColor;
}

// Normalize a fixed value-axis range ([min, max] or { min, max }) to a sorted
// [min, max] pair, or null when unset/degenerate.
function normalizeValueRange(range) {
  if (!range) return null;
  const pair = Array.isArray(range) ? range : [range.min, range.max];
  const min = Number(pair[0]);
  const max = Number(pair[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
  return min < max ? [min, max] : [max, min];
}

// Strip axis chrome for the dashboard's bare-rail look: hide the measure axis
// entirely (grid, ticks, line, zeroline) and the category axis line/ticks while
// keeping its labels.
function applyMinimalDivergingAxis(layout, measureAxis, categoryAxis) {
  layout[measureAxis] = {
    ...layout[measureAxis],
    showgrid: false,
    showticklabels: false,
    showline: false,
    ticks: "",
    zeroline: false,
  };
  layout[categoryAxis] = {
    ...layout[categoryAxis],
    showgrid: false,
    showline: false,
    ticks: "",
  };
}

// one way and those below extend the other. Values are colored by side (above /
// below center) or by threshold buckets, and a reference line marks the center.
// Optional dashboard-style styling — a fixed value range, a background track
// rail, and minimal axis chrome — lets it mirror the landing on-track bars.
// Reuses the same category/measure record contract as barSpec (view=category
// records).
function divergingBarSpec(spec) {
  const { appearance = {}, bindings = {}, labels = {}, series = [] } = spec;
  const sourceRecords = Array.isArray(series) ? series : series.records || [];
  const sections = groupedCategorySections(sourceRecords, { bindings, appearance });
  const items = sections.items;
  const dataLabelFontSize = appearanceNumber(appearance, "dataLabelFontSize", 14);
  const format = measureFormat(spec);
  const center = appearanceNumber(appearance, "center", 0);
  // Diverging bars default to horizontal; only an explicit "vertical" flips it.
  const horizontal = appearance.orientation !== "vertical";

  const categories = items.map((item) => item.axisValue);
  const categoryLabels = items.map((item) => item.category);
  const rawValues = items.map((item) => {
    const raw = valueOf(item.record, bindings.y, ["value", "y"]);
    // Guard nullish/empty before Number() — Number(null) is 0, not NaN.
    const value = raw == null || raw === "" ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  });
  // Bar length = distance from the center; `base: center` (below) anchors the
  // start so the value axis still reads in true units.
  const offsets = rawValues.map((value) => (value == null ? null : value - center));

  const colors = rawValues.map((value, index) =>
    divergingBarColor(value, offsets[index], appearance),
  );

  const measureAxisKey = horizontal ? "x" : "y";
  const categoryAxisKey = horizontal ? "y" : "x";
  const measureAxis = horizontal ? "xaxis" : "yaxis";
  const categoryAxis = horizontal ? "yaxis" : "xaxis";
  const trace = {
    type: "bar",
    orientation: horizontal ? "h" : "v",
    [categoryAxisKey]: categories,
    [measureAxisKey]: offsets,
    base: center,
    marker: { color: colors },
    customdata: sections.grouped
      ? rawValues.map((value, index) => [value, categoryLabels[index]])
      : rawValues,
    text: appearance.showValueLabels ? rawValues : undefined,
    textposition: appearance.showValueLabels ? "auto" : undefined,
    texttemplate:
      appearance.showValueLabels && format ? fmtToken("%{text}", format) : undefined,
    textfont: appearance.showValueLabels
      ? { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 }
      : undefined,
    hovertemplate:
      labels.tooltip ||
      (sections.grouped
        ? `%{customdata[1]}<br>${fmtToken("%{customdata[0]}", format)}<extra></extra>`
        : horizontal
          ? `%{y}<br>${fmtToken("%{customdata}", format)}<extra></extra>`
          : `%{x}<br>${fmtToken("%{customdata}", format)}<extra></extra>`),
  };

  const layout = withGroupedCategoryAxis(
    baseLayout(labels, appearance),
    sections,
    horizontal ? "y" : "x",
    appearance,
  );
  if (horizontal && !sections.grouped) {
    layout.yaxis = { ...layout.yaxis, autorange: "reversed" };
  }

  // Fixed value-axis range (the dashboard uses a fixed 0–2 pace scale). When a
  // track rail is requested but no range is set, fall back to the data's own
  // extent (including the center) so the rail spans the whole plot.
  const explicitRange = normalizeValueRange(appearance.valueRange);
  const railOn = Boolean(appearance.trackRail);
  const finiteValues = rawValues.filter((value) => value != null);
  const dataRange =
    finiteValues.length > 0
      ? [Math.min(center, ...finiteValues), Math.max(center, ...finiteValues)]
      : [center - 1, center + 1];
  const effectiveRange = explicitRange || (railOn ? dataRange : null);
  if (effectiveRange) {
    layout[measureAxis] = {
      ...layout[measureAxis],
      range: [...effectiveRange],
      autorange: false,
    };
  }

  // Background track rail behind each bar (the dashboard's bg-muted track).
  const data = [];
  if (railOn && effectiveRange) {
    const [railMin, railMax] = effectiveRange;
    data.push({
      type: "bar",
      orientation: horizontal ? "h" : "v",
      [categoryAxisKey]: categories,
      [measureAxisKey]: categories.map(() => railMax - railMin),
      base: railMin,
      marker: { color: COLORS.gray2 },
      hoverinfo: "skip",
      showlegend: false,
    });
    layout.barmode = "overlay";
  }
  data.push(trace);

  if (appearance.minimalAxis) {
    applyMinimalDivergingAxis(layout, measureAxis, categoryAxis);
  }

  // Reference line: vertical when the measure is on x, horizontal when the
  // measure is on y. `referenceValue` is the line's own position, separate
  // from `center` (the bar anchor and above/below color split, both above) —
  // an author who wants the line somewhere else must not also move the bars.
  // Guard nullish/empty before Number(), as Workstream A does: `null` means
  // "follow center", but a real 0 is a setting, not an absence.
  const rawReferenceValue = appearance.referenceValue;
  const explicitReference =
    rawReferenceValue == null || rawReferenceValue === ""
      ? NaN
      : Number(rawReferenceValue);
  const referenceValue = Number.isFinite(explicitReference) ? explicitReference : center;
  const centerLine = [
    {
      type: horizontal ? "vertical" : "horizontal",
      value: referenceValue,
      label: appearance.referenceLabel || undefined,
    },
  ];
  return {
    data,
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
  const sourceRecords = Array.isArray(series) ? series : series.records || [];
  const sections = groupedCategorySections(sourceRecords, { bindings, appearance });
  const items = sections.items;
  const records = items.map((item) => item.record);
  const dataLabelFontSize = appearanceNumber(appearance, "dataLabelFontSize", 14);
  const format = measureFormat(spec);
  // Point-label template: decimal format when set, else the raw thousands form.
  const pointLabelTemplate = format ? fmtToken("%{x}", format) : "%{x:,}";
  const categories = items.map((item) => item.category);
  const axisCategories = items.map((item) => item.axisValue);
  // A normal categorical y-axis draws its last value at the top; the numeric
  // grouped axis is explicitly reversed and draws its first value at the top.
  // Restricting labels must follow that visible row, not the source-array index.
  const topAxisCategory = sections.grouped
    ? axisCategories[0]
    : axisCategories.at(-1);
  const rangePointLabelTemplate = !appearance.showPointLabels
    ? undefined
    : appearance.pointLabelsFirstLineOnly
      ? axisCategories.map((category) =>
          category === topAxisCategory ? pointLabelTemplate : "",
        )
      : pointLabelTemplate;
  const starts = records.map((row) =>
    valueOf(row, bindings.start, ["start", "startValue"]),
  );
  const ends = records.map((row) =>
    valueOf(row, bindings.end, ["end", "endValue"]),
  );
  // Module-backed two-period charts bind one metric at two actual years; inline
  // Range data binds two distinct value columns. Prefer those column names for
  // inline data (Women / Men, Lower / Upper) instead of exposing the shape
  // builder's internal 0 / 1 period indices in the legend and slope axis.
  const hasDistinctEndpointColumns =
    Boolean(bindings.start) &&
    Boolean(bindings.end) &&
    bindings.start !== bindings.end;
  const startName = String(
    hasDistinctEndpointColumns
      ? bindings.start
      : period.startYear ?? bindings.start ?? "Start",
  );
  const endName = String(
    hasDistinctEndpointColumns
      ? bindings.end
      : period.endYear ?? bindings.end ?? "End",
  );

  // The value (x) axis and per-point number labels are toggleable for the
  // range/dot-plot family. Hiding the value axis drops its ticks, gridlines,
  // and line; automargin in baseLayout keeps the category labels from crowding.
  // `forestChrome` strips the category axis's tick marks and spine — the
  // stray chrome that read as short marks/a spine beside a forest plot's rows
  // — without touching any other Range-family chart. Horizontal gridlines
  // are left alone; they are what lets a reader trace a long row to its
  // label. This is scoped to this function's forest caller only, not
  // baseLayout, which every other chart type reads.
  const rangeLayout = ({ forestChrome = false } = {}) => {
    const layout = withGroupedCategoryAxis(
      baseLayout(labels, appearance),
      sections,
      "y",
      appearance,
    );
    if (appearance.showValueAxis === false) {
      layout.xaxis = { ...layout.xaxis, visible: false };
    }
    if (forestChrome) {
      layout.yaxis = { ...layout.yaxis, ticks: "", showline: false };
    }
    return layout;
  };

  if (slope) {
    const left = startName;
    const right = endName;
    const seenGroups = new Set();
    const data = items.map((item, index) => {
      const group = item.group == null ? "" : String(item.group);
      const firstInGroup = sections.grouped && !seenGroups.has(group);
      seenGroups.add(group);
      return {
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
        ...(sections.grouped
          ? {
              legendgroup: group,
              ...(firstInGroup && group
                ? {
                    legendgrouptitle: {
                      text: `<b>${wrapLegendLabel(group, appearance)}</b>`,
                    },
                  }
                : {}),
            }
          : {}),
        hovertemplate: labels.tooltip || "%{x}: %{y}<extra>%{fullData.name}</extra>",
      };
    });
    const layout = baseLayout(labels, appearance);
    if (sections.grouped && layout.legend) {
      layout.legend = {
        ...layout.legend,
        tracegroupgap: Math.round(
          appearanceNumber(appearance, "groupGap", DEFAULT_GROUP_GAP) * 24,
        ),
      };
    }
    return {
      data,
      layout,
      config: DEFAULT_CONFIG,
    };
  }

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
      y: [axisCategories[index], axisCategories[index]],
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
              y: [...axisCategories, ...axisCategories],
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
              y: axisCategories,
              texttemplate: appearance.showPointLabels ? pointLabelTemplate : undefined,
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
                line: { color: COLORS.white, width: 1 },
              },
              customdata: records.map((_, index) => [
                starts[index],
                ends[index],
                categories[index],
              ]),
              hovertemplate:
                labels.tooltip ||
                `${sections.grouped ? "%{customdata[2]}" : "%{y}"}<br>Estimate: %{x}<br>CI: ${fmtToken("%{customdata[0]}", format)} – ${fmtToken("%{customdata[1]}", format)}<extra></extra>`,
            },
          ]
        : [];

    // Line of no effect (0 for differences, 1 for ratios); hidden when unset.
    // Guard nullish/empty before Number() — Number(null) is 0, not NaN — so a
    // reader clearing the input (which writes null) actually removes the
    // line, and 0 itself still draws since it's a meaningful difference
    // value, not an absence.
    const rawNoEffect = appearance.noEffectValue;
    const noEffect =
      rawNoEffect == null || rawNoEffect === "" ? NaN : Number(rawNoEffect);
    // Bound the line to the plotted rows rather than the whole paper, so it
    // can no longer cross the group-header band above the first row.
    const noEffectBounds = sections.grouped
      ? { from: -0.5, to: sections.maxPosition + 0.5 }
      : { from: axisCategories[0], to: axisCategories.at(-1) };
    const noEffectLine = Number.isFinite(noEffect)
      ? [{ type: "vertical", value: noEffect, ...noEffectBounds }]
      : [];

    const forestLayout = rangeLayout({ forestChrome: true });
    // Give every study a readable row instead of compressing long forests into
    // the generic chart height. PlotlyChart honors this requested minimum.
    forestLayout.height = rangeHeight(sections, records.length);
    // Studies read top-to-bottom in their given order (Plotly stacks the first
    // category at the bottom otherwise).
    if (!sections.grouped) {
      forestLayout.yaxis = { ...forestLayout.yaxis, autorange: "reversed" };
    }

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
    y: [axisCategories[index], axisCategories[index]],
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
      y: axisCategories,
      customdata: sections.grouped ? categories : undefined,
      hovertemplate: sections.grouped
        ? `%{customdata}: ${fmtToken("%{x}", format)}<extra></extra>`
        : undefined,
      texttemplate: rangePointLabelTemplate,
      textposition: "top center",
      textfont: { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 },
      marker: { color: seriesColor(appearance, startName, 0), size: 9 },
    },
    {
      type: "scatter",
      mode: appearance.showPointLabels ? "markers+text" : "markers",
      name: wrapLegendLabel(endName, appearance),
      x: ends,
      y: axisCategories,
      customdata: sections.grouped ? categories : undefined,
      hovertemplate: sections.grouped
        ? `%{customdata}: ${fmtToken("%{x}", format)}<extra></extra>`
        : undefined,
      texttemplate: rangePointLabelTemplate,
      textposition: "top center",
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
            y: axisCategories,
            customdata: sections.grouped ? categories : undefined,
            hovertemplate: sections.grouped
              ? `%{customdata}: ${fmtToken("%{x}", format)}<extra></extra>`
              : undefined,
            texttemplate: rangePointLabelTemplate,
            textposition: "top center",
            textfont: { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 },
            // Dark, white-ringed dot so it reads on top of the connector.
            marker: {
              color: COLORS.gray7,
              size: 10,
              line: { color: COLORS.white, width: 1.5 },
            },
          },
        ]
      : []),
  ];
  const layout = rangeLayout();
  // Labels occupy the space above each connector, so keep a complete row of
  // vertical room per category. Without the toggle, Range keeps the standard
  // responsive chart height.
  if (appearance.showPointLabels) {
    layout.height = rangeHeight(sections, records.length);
  }
  return {
    data,
    layout,
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
  const rowRecords = (matrix.y || []).map((category, index) => ({
    category,
    group: matrix.groups?.[index] ?? null,
    rowIndex: index,
  }));
  const sections = groupedCategorySections(rowRecords, { bindings, appearance });
  const rows = sections.items.map((item) => item.category);
  const axisRows = sections.items.map((item) => item.axisValue);
  const cols = matrix.x || [];
  const z = sections.items.map((item) => matrix.z?.[item.record.rowIndex] || []);
  const dataLabelFontSize = appearanceNumber(appearance, "dataLabelFontSize", 14);
  const format = measureFormat(spec);
  const pointLabelTemplate = format ? fmtToken("%{x}", format) : "%{x:,}";

  const finite = (values) => values.filter((v) => Number.isFinite(Number(v)));

  // One light-gray band per category row, from its lowest to its highest value.
  const bands = rows
    .map((_, r) => {
      const nums = finite(z[r] || []);
      if (nums.length < 2) return null;
      return {
        type: "scatter",
        mode: "lines",
        x: [Math.min(...nums), Math.max(...nums)],
        y: [axisRows[r], axisRows[r]],
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
      y: axisRows,
      customdata: sections.grouped ? rows : undefined,
      texttemplate: showText ? pointLabelTemplate : undefined,
      textposition: "top center",
      textfont: { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 },
      marker: { color: seriesColor(appearance, name, c), size: 12 },
      hovertemplate:
        labels.tooltip ||
        (sections.grouped
          ? "%{customdata} — %{x}<extra>%{fullData.name}</extra>"
          : "%{y} — %{x}<extra>%{fullData.name}</extra>"),
    };
  });

  const layout = withGroupedCategoryAxis(
    baseLayout(labels, appearance),
    sections,
    "y",
    appearance,
  );
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
  const format = measureFormat(spec);
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
        // Workstream C: follows the active palette (via `rampProps`) instead of
        // the hard-coded "Blues"/"RdBu" Plotly names, so a palette selection
        // reaches the heatmap. The old unconditional reversescale-on-diverging
        // quirk folds into the reader's own invert flag rather than sitting
        // beside it, so a diverging heatmap now starts unreversed and the
        // Invert color scale switch is what turns it around.
        ...rampProps(appearance, {
          kind: appearance.colorScale === "diverging" ? "diverging" : "sequential",
          invert: appearance.invertScale,
        }),
        showscale: legendVisible(appearance),
        colorbar: {
          thickness: 12,
          len: 0.72,
          x: 0.99,
          xanchor: "right",
        },
        texttemplate: appearance.showCellValues ? fmtToken("%{z}", format) : undefined,
        textfont: appearance.showCellValues
          ? { family: "Arial, sans-serif", size: dataLabelFontSize, color: COLORS.gray6 }
          : undefined,
        hovertemplate:
          labels.tooltip || `%{y}<br>%{x}: ${fmtToken("%{z}", format)}<extra></extra>`,
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
        // Workstream C: `paletteForScale` searched PALETTES for the first
        // entry of a scale kind and ignored `appearance.palette` entirely —
        // the reported "choropleth color palette settings do nothing".
        // `rampProps` reads the active palette; the default (no palette set)
        // still resolves to the same legacy stops/name `paletteForScale`
        // returned.
        ...rampProps(appearance, {
          kind: appearance.colorScale === "diverging" ? "diverging" : "sequential",
          invert: appearance.invertScale,
        }),
        showscale: legendVisible(appearance),
        marker: {
          line: {
            color: COLORS.white,
            width: appearance.showBoundaries === false ? 0 : 0.6,
          },
        },
        hovertemplate:
          labels.tooltip || `%{text}<br>${fmtToken("%{z}", measureFormat(spec))}<extra></extra>`,
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
        hovertemplate:
          labels.tooltip || `%{label}: ${fmtToken("%{value}", measureFormat(spec))}<extra></extra>`,
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
  // Workstream C: off (default), behaviour is unchanged — one palette colour
  // for every marker. On, `marker.color` becomes the measure's own values, a
  // second, redundant encoding of the same magnitude the marker *area*
  // already carries — which is what lets a large light dot read as clearly
  // as a small dark one.
  const gradient = Boolean(appearance.symbolGradient);
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
          ...(gradient
            ? {
                color: sizes,
                showscale: legendVisible(appearance),
                ...rampProps(appearance, {
                  kind: "sequential",
                  invert: appearance.invertScale,
                }),
                colorbar: { thickness: 12, len: 0.72, x: 0.99, xanchor: "right" },
              }
            : {
                // One colour for every marker, taken from the active palette
                // rather than hard-coded, so the Color Palette control
                // actually reaches this chart. Keyed on the plotted measure
                // so a per-series override in `appearance.seriesColors` can
                // name it, the same way the forest plot keys its single
                // marker colour.
                color: seriesColor(appearance, bindings.size || "value", 0),
              }),
          line: { color: COLORS.white, width: 0.5 },
        },
        hovertemplate:
          labels.tooltip ||
          `%{text}: ${fmtToken("%{marker.size}", measureFormat(spec))}<extra></extra>`,
      },
    ],
    layout: {
      ...baseLayout(labels, appearance),
      // One unnamed trace carries every marker, so a legend can only ever read
      // "trace 0" — magnitude is in the marker areas, not in a swatch.
      showlegend: false,
      // Unlike a choropleth, where the polygons *are* the map and the base
      // layers only get in their way, a symbol map draws nothing but markers —
      // with the base hidden, the reader gets dots floating on white with no
      // way to tell where they are. Land and state boundaries stay on;
      // `fitbounds: "locations"` reads the trace's own lon/lat extremes, so the
      // frame lands on the places plotted rather than on the whole scope.
      geo: {
        scope: "usa",
        fitbounds: "locations",
        visible: true,
        showland: true,
        landcolor: COLORS.lightGray,
        showlakes: false,
        showsubunits: true,
        subunitcolor: COLORS.white,
        subunitwidth: 1,
        showframe: false,
        showcoastlines: false,
        bgcolor: "rgba(0,0,0,0)",
      },
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
  if (chartType === "bar") {
    // Covers a diverging bar too: it is a `bar` with `appearance.diverging`.
    const horizontalBars = data[0]?.orientation === "h";
    return horizontalBars
      ? { horizontal: yCount, vertical: NUMERIC_AXIS_TICK_POSITIONS }
      : { horizontal: NUMERIC_AXIS_TICK_POSITIONS, vertical: xCount };
  }
  if (["dumbbell", "forest", "dotPlot"].includes(chartType)) {
    return { horizontal: yCount, vertical: NUMERIC_AXIS_TICK_POSITIONS };
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
// Reverse the legend-label markup (escaping + soft-wrap <br>) so a stored raw
// series name matches the trace's rendered `name`.
function normalizeSeriesName(name) {
  return String(name ?? "")
    .replace(/(?:&#8195;|\u2003)/gi, "")
    .replace(/(?:&#8203;|\u200b)<br\s*\/?\s*>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Apply `appearance.hiddenSeries` by marking matching traces `visible: false`,
 * so hidden legend items disappear from both the chart and the legend — and,
 * because it's config-driven, the choice survives export (unlike Plotly's
 * interactive legend toggles).
 */
function withHiddenSeries(result, spec) {
  const hidden = spec.appearance?.hiddenSeries;
  if (!Array.isArray(hidden) || !hidden.length || !Array.isArray(result?.data)) {
    return result;
  }
  const hiddenSet = new Set(hidden.map(normalizeSeriesName));
  let changed = false;
  const data = result.data.map((trace) => {
    if (trace?.name != null && hiddenSet.has(normalizeSeriesName(trace.name))) {
      changed = true;
      return { ...trace, visible: false };
    }
    return trace;
  });
  return changed ? { ...result, data } : result;
}

/**
 * Replace only the rendered legend text while retaining raw series names for
 * color and visibility lookups. Trace-based charts store legend text in
 * `name`; pie/donut charts store one legend entry per `labels` value.
 */
function withLegendLabels(result, spec) {
  const labels = spec.appearance?.legendLabels;
  if (!labels || !Object.keys(labels).length || !Array.isArray(result?.data)) {
    return result;
  }
  const overrides = new Map(
    Object.entries(labels)
      .filter(([, label]) => typeof label === "string" && label.trim().length > 0)
      .map(([name, label]) => [normalizeSeriesName(name), label]),
  );
  if (!overrides.size) return result;

  let changed = false;
  const renamed = (name) => {
    const label = overrides.get(normalizeSeriesName(name));
    if (label == null) return name;
    changed = true;
    return wrapLegendLabel(label, spec.appearance);
  };
  const data = result.data.map((trace) => ({
    ...trace,
    ...(trace?.name != null ? { name: renamed(trace.name) } : {}),
    ...(Array.isArray(trace?.labels)
      ? { labels: trace.labels.map(renamed) }
      : {}),
  }));
  return changed ? { ...result, data } : result;
}

export function toPlotly(spec) {
  let result;
  switch (spec.chartType) {
    case "line":
      result = lineSpec(spec);
      break;
    case "bar":
      // Workstream B: `appearance.diverging` routes a plain `bar` through the
      // renderer the retired `divergingBar` id used, rather than a separate
      // chart type. A stored view still carrying that id is rewritten to this
      // shape by `normalizeSpec` before it ever reaches here.
      result = spec.appearance?.diverging ? divergingBarSpec(spec) : barSpec(spec);
      break;
    case "dumbbell":
      result = twoPeriodSpec(spec, {});
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

  const formatted = withLinePaddingMeta(withMeasureFormat(result, spec), spec);
  return withLegendLabels(withHiddenSeries(formatted, spec), spec);
}

export default toPlotly;
