"use client";

/**
 * ChartFrame.js — the PPIC chart parts around a visx drawing, in the style
 * guide's order: eyebrow, title, subtitle, the drawing with its key (above,
 * right, or below), then the gray source-and-notes box, styled as PPIC publishes it (bold
 * uppercase "SOURCE:" and "NOTES:" captions, 11px gray text, 20px below the chart).
 * The gaps between parts follow PPIC's published charts (`CHART_STYLE.frameGap`:
 * 20px below the title block, 12px between the key and the chart), not the
 * guide's 48px.
 *
 * Each part is left out entirely, not left as an empty gap, when it has no text
 * or its show switch is off; "Show source and notes" (`showSource`) switches
 * off the whole gray box. Type sizes, colors, and spacing come from
 * chartStyle.js through sharedSettings.js, so the frame and the chart models
 * read the label and typography settings in one way.
 *
 * ChartFrame is the one owner of size: it measures the width it is given and
 * hands the drawing an exact `{ width, height }`. It also holds the chart's
 * hover focus (chartFocus.js), so the key can show only the hovered series. Drawings never measure
 * themselves, which keeps them testable in jsdom. Until it has measured, the
 * drawing area holds its height but draws nothing.
 *
 * Props:
 *   children     {Function}       — ({ width, height }) => the drawing
 *   labels       {Object}         — { eyebrow?, title, subtitle, footnote }
 *   appearance   {Object}         — presentation.appearance (show switches, text sizes)
 *   observations {Array<Object>}  — the drawn observations; the datasets they
 *                                   come from fill the source line
 *   sourceCitations {Object|null} — the topic's { sourceId | "default": citation }
 *                                   map (module schema); without it the raw
 *                                   source ids are shown
 *   summary      {string|null}    — written summary, read to screen readers only
 *   legend       {Object|null}    — { entries, position, title, scale? } for ChartKey; drawn
 *                                   only for "top", "right", or "bottom" ("automatic"
 *                                   and "hidden" leave the key to the chart)
 *   height       {number|null}    — drawing height in px; when omitted the drawing
 *                                   fills the height the frame is given
 *   fitContent   {boolean}        — the drawing sizes itself (the range chart's
 *                                   rows), so the frame does not reserve the
 *                                   full height and the source box follows the
 *                                   drawing directly
 *   aspectRatio  {number|null}    — the drawing's own width over its height (a
 *                                   map's shape). With the key on the right, the
 *                                   drawing takes that width (shrinking if it
 *                                   must) and the key sits right beside it, as
 *                                   the guide's map example draws it
 *   className    {string}         — optional classes for the frame
 *   ref          {Object|Function} — the <figure>, for image export
 *
 * Data sources:
 *   - Via props from parent (PreviewPane, from the tagged visx result)
 *
 * UI Kit reference:
 *   - Implements the "Chart Anatomy" pattern from the UI Kit page
 */

import React from "react";

import { ChartFocusProvider } from "@/components/charts/chartFocus";
import ChartKey from "@/components/charts/visx/ChartKey";
import { cn } from "@/components/ui/utils";

import { CHART_STYLE } from "@/lib/visualization/chartStyle";
import { citeSources } from "@/lib/visualization/datasetLabels";
import {
  resolveLabels,
  resolveTypography,
  showsSourceBox,
} from "@/lib/visualization/models/sharedSettings";
import { CHART_HEIGHTS } from "@/lib/constants";

const { text, frameGap, sourceBox } = CHART_STYLE;

// ── Helpers ──────────────────────────────────────────────────────────

function textStyle(role, fontSize = role.fontSize) {
  return {
    fontFamily: role.fontFamily,
    fontSize,
    fontWeight: role.fontWeight,
    color: role.color,
    ...(role.letterSpacing ? { letterSpacing: role.letterSpacing } : {}),
    ...(role.lineHeight ? { lineHeight: role.lineHeight } : {}),
  };
}

/**
 * The source line ends with a period, as PPIC publishes it. Citations can
 * contain commas ("California Department of Finance (DOF), P-3 ..."), so more
 * than one is separated with semicolons.
 */
function sentence(text) {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function measuredSize(entry) {
  const box = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize;
  return {
    width: box?.inlineSize ?? entry.contentRect?.width ?? 0,
    height: box?.blockSize ?? entry.contentRect?.height ?? 0,
  };
}

// ── Component ────────────────────────────────────────────────────────

export default function ChartFrame({
  children,
  labels = {},
  appearance = {},
  observations = [],
  sourceCitations = null,
  summary = null,
  legend = null,
  height = null,
  fitContent = false,
  aspectRatio = null,
  className = "",
  ref = null,
}) {
  const drawingRef = React.useRef(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const element = drawingRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      const next = measuredSize(entry);
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const shown = resolveLabels(labels, appearance);
  const sizes = resolveTypography(appearance);
  const showSource = showsSourceBox(appearance);
  const sources = showSource ? citeSources(observations, sourceCitations) : [];
  const footnote = showSource ? shown.footnote : null;
  const fixedHeight = Number.isFinite(height) && height > 0 ? height : null;
  // A drawing that sizes itself is never handed its own measured height,
  // which would feed back into it.
  const drawingHeight = fixedHeight ??
    (size.height > 0 && !fitContent ? size.height : CHART_HEIGHTS.preview);
  const width = Math.floor(size.width);
  const keyPosition = ["top", "bottom"].includes(legend?.position) ? legend.position : "right";
  const key =
    // "automatic" belongs to the chart: it labels its data directly or draws
    // its own fallback key, because only it knows whether the labels fit.
    legend && ["top", "right", "bottom"].includes(legend.position) &&
    (legend.entries?.length || legend.scale) ? (
      <ChartKey
        entries={legend.entries || []}
        legendPosition={keyPosition}
        title={legend.title ?? null}
        fontSize={sizes.legend}
        scale={legend.scale ?? null}
      />
    ) : null;
  const hasHeader = Boolean(shown.eyebrow || shown.title || shown.subtitle);
  // A drawing with its own shape and a key on the right is only as wide as
  // that shape, so the key follows it rather than the frame's far edge.
  const shapedWidth =
    key && keyPosition === "right" && Number.isFinite(aspectRatio) && aspectRatio > 0
      ? Math.round(drawingHeight * aspectRatio)
      : null;

  return (
    <ChartFocusProvider>
    <figure ref={ref} data-chart-frame="" className={cn("m-0 flex w-full min-w-0 flex-col", className)}>
      {hasHeader ? (
        <div data-frame-part="header" className="flex flex-col gap-1">
          {shown.eyebrow ? (
            <p data-frame-part="eyebrow" className="m-0 uppercase" style={textStyle(text.eyebrow)}>
              {shown.eyebrow}
            </p>
          ) : null}
          {shown.title ? (
            <p data-frame-part="title" className="m-0" style={textStyle(text.title, sizes.title)}>
              {shown.title}
            </p>
          ) : null}
          {shown.subtitle ? (
            <p
              data-frame-part="subtitle"
              className="m-0"
              style={textStyle(text.subtitle, sizes.subtitle)}
            >
              {shown.subtitle}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "flex min-w-0",
          // A drawing that fills the frame's height must stretch beside a key
          // on the right too; "items-start" would leave it at its first height
          // and open a gap above the source box.
          keyPosition === "right"
            ? cn("flex-row", fixedHeight || fitContent ? "items-start" : "items-stretch")
            : "flex-col",
          fixedHeight || fitContent ? null : "min-h-0 flex-1",
        )}
        style={{
          gap: keyPosition === "right" ? frameGap.keySide : frameGap.key,
          marginTop: hasHeader ? frameGap.header : 0,
        }}
      >
        {keyPosition === "top" ? key : null}
        <div
          ref={drawingRef}
          data-frame-part="chart"
          // A drawing may grow past the size it was given (line spacing adds
          // room between values). With a set height the frame grows with it;
          // with a measured height it scrolls, so the size never feeds back.
          className={cn(
            "min-w-0",
            fitContent || shapedWidth ? null : "flex-1",
            fixedHeight || fitContent ? null : "overflow-y-auto",
          )}
          style={{
            minHeight: fitContent ? undefined : fixedHeight ?? undefined,
            ...(shapedWidth ? { flex: `0 1 ${shapedWidth}px` } : {}),
          }}
        >
          {width > 0 ? children({ width, height: Math.floor(drawingHeight) }) : null}
        </div>
        {keyPosition === "top" ? null : key}
      </div>

      {sources.length || footnote ? (
        <div
          data-frame-part="source"
          style={{
            backgroundColor: sourceBox.background,
            padding: sourceBox.padding,
            marginTop: sourceBox.gap,
          }}
        >
          {sources.length ? (
            <p className="m-0" style={textStyle(text.source)}>
              <span style={sourceBox.caption}>Source:</span>
              {` ${sentence(sources.join("; "))}`}
            </p>
          ) : null}
          {footnote ? (
            <p data-frame-part="notes" className="m-0" style={textStyle(text.source)}>
              <span style={sourceBox.caption}>Notes:</span>
              {` ${footnote}`}
            </p>
          ) : null}
        </div>
      ) : null}

      {summary ? <figcaption className="sr-only">{summary}</figcaption> : null}
    </figure>
    </ChartFocusProvider>
  );
}
