/**
 * palettes.js — named color palettes and per-series/per-scale color
 * resolution for the chart-rendering layer.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Single place that resolves a palette id or brand color token to a hex
 * value for Plotly traces. `toPlotly.js`'s chart builders source every color
 * through `seriesColor`/`paletteForScale` rather than reaching into
 * `BASE_PLOTLY_COLORS` or `COLORS` directly, so a palette switch (or a
 * per-series override in `appearance.seriesColors`) is a single, consistent
 * code path.
 *
 * Exports:
 *   PALETTES         — { id: { label, kind, tokens? , scale? } } named palettes
 *   DEFAULT_PALETTE  — palette id used when appearance.palette is unset
 *   resolveToken(token)                          — COLORS key (or raw #hex) → hex
 *   seriesColor(appearance, seriesName, index)    — resolved per-series color
 *   paletteForScale(kind)                        — "sequential"|"diverging" ramp
 *
 * Data sources:
 *   - lib/constants.js (COLORS, BASE_PLOTLY_COLORS)
 */

import { BASE_PLOTLY_COLORS, COLORS } from "@/lib/constants";

/**
 * Named palettes. Categorical palettes list brand color TOKENS (keys into
 * COLORS), cycled by series index. Sequential/diverging palettes describe the
 * ramp `toPlotly.js`'s choropleth builder hardcoded before this module
 * existed — moved here verbatim (see CHOROPLETH_BLUES / "RdBu" below) so
 * rendering with default appearance is unchanged.
 */
export const PALETTES = Object.freeze({
  "brand-categorical": Object.freeze({
    label: "Brand (categorical)",
    kind: "categorical",
    // Mirrors BASE_PLOTLY_COLORS exactly — the chart-wide default cycle.
    tokens: Object.freeze([
      "blue3",
      "orange3",
      "navyBlue",
      "steelBlue",
      "burntOrange",
      "blue5",
      "orange2",
      "gray5",
      "blue2",
      "orange4",
    ]),
  }),
  "colorblind-safe": Object.freeze({
    label: "Colorblind-safe",
    kind: "categorical",
    // Chosen for strong LIGHTNESS separation (not hue alone), so the sequence
    // still reads under red-green and blue-yellow color vision deficiencies:
    // it alternates a dark blue, a light-mid orange, a saturated green, a
    // light orange, a mid navy, a pale teal, a near-black gray, and a deep
    // orange — no two adjacent stops share comparable luminance.
    tokens: Object.freeze([
      "blue5",
      "orange2",
      "complementGreen",
      "burntOrange1",
      "navyBlue2",
      "teal2",
      "gray6",
      "orange5",
    ]),
  }),
  "sequential-blues": Object.freeze({
    label: "Sequential (blues)",
    kind: "sequential",
    // Legacy CHOROPLETH_BLUES: light blue (low) → dark blue (high).
    scale: Object.freeze([
      [0, "blue1"],
      [1, "blue5"],
    ]),
  }),
  "diverging-redblue": Object.freeze({
    label: "Diverging (red-blue)",
    kind: "diverging",
    // Plotly's built-in named colorscale, used verbatim by the legacy code.
    scale: "RdBu",
  }),
});

/** Palette used when `appearance.palette` is unset. */
export const DEFAULT_PALETTE = "brand-categorical";

const RAW_HEX = /^#[0-9a-f]{3,8}$/i;

/**
 * Resolve a COLORS key to its hex value. A raw "#hex" string passes through
 * unchanged (the spec layer already warns on raw hex via SPEC_RAW_HEX; this
 * function still needs to render it).
 * @throws {Error} naming the token when it is neither a known key nor hex.
 */
export function resolveToken(token) {
  if (typeof token === "string" && RAW_HEX.test(token)) return token;
  const hex = COLORS[token];
  if (!hex) throw new Error(`Unknown color token: "${token}".`);
  return hex;
}

function categoricalTokens(paletteId) {
  const palette = PALETTES[paletteId];
  return palette?.kind === "categorical" ? palette.tokens : null;
}

/**
 * Resolve the color for one series. Precedence:
 *   1. appearance.seriesColors[seriesName] — an explicit per-series override
 *   2. the active palette (appearance.palette, else DEFAULT_PALETTE), cycled
 *      by index
 *   3. BASE_PLOTLY_COLORS, cycled by index (final fallback, e.g. an unknown
 *      palette id)
 */
export function seriesColor(appearance = {}, seriesName, index = 0) {
  const override = appearance?.seriesColors?.[seriesName];
  if (override) return resolveToken(override);

  const activeId = appearance?.palette || DEFAULT_PALETTE;
  const tokens = categoricalTokens(activeId);
  if (tokens?.length) return resolveToken(tokens[index % tokens.length]);

  // Final fallback: an unregistered palette id (or, defensively, a broken
  // DEFAULT_PALETTE) falls through to the raw base cycle rather than throwing.
  return BASE_PLOTLY_COLORS[index % BASE_PLOTLY_COLORS.length];
}

/**
 * The sequential or diverging color ramp a heatmap/choropleth color scale
 * consumes (a Plotly `colorscale` value: either a named string or an array of
 * `[stop, hex]` pairs).
 * @param {"sequential"|"diverging"} kind
 * @throws {Error} naming the kind when no palette declares it.
 */
export function paletteForScale(kind) {
  const entry = Object.values(PALETTES).find((candidate) => candidate.kind === kind);
  if (!entry) throw new Error(`No palette registered for scale kind "${kind}".`);
  if (typeof entry.scale === "string") return entry.scale;
  return entry.scale.map(([stop, token]) => [stop, resolveToken(token)]);
}
