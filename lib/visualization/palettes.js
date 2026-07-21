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
 *   UI_KIT_PALETTE_IDS — the eight named color-family options from the UI Kit
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
 * Color-family palettes documented by components/ui-kit/ColorPalette.js.
 * Keeping the ids here makes the renderer/editor registry the single runtime
 * owner while the UI Kit remains the composition reference. Each cycle starts
 * on the family's primary data shade, then alternates lighter/darker stops for
 * useful categorical separation on a white chart surface.
 */
export const UI_KIT_PALETTE_IDS = Object.freeze([
  "ui-kit-orange",
  "ui-kit-blue",
  "ui-kit-teal",
  "ui-kit-navy-blue",
  "ui-kit-steel-blue",
  "ui-kit-complement-green",
  "ui-kit-burnt-orange",
  "ui-kit-neutral",
]);

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
  "ui-kit-orange": Object.freeze({
    label: "Orange · Brand",
    kind: "categorical",
    tokens: Object.freeze([
      "orange3", "orange1", "orange5", "orange2", "orange6", "orange4", "orange7",
    ]),
  }),
  "ui-kit-blue": Object.freeze({
    label: "Blue · Data",
    kind: "categorical",
    tokens: Object.freeze([
      "blue5", "blue2", "blue7", "blue3", "blue1", "blue6", "blue4",
    ]),
  }),
  "ui-kit-teal": Object.freeze({
    label: "Teal · Data",
    kind: "categorical",
    tokens: Object.freeze([
      "teal7", "teal2", "teal8", "teal5", "teal1", "teal6", "teal3", "teal4",
    ]),
  }),
  "ui-kit-navy-blue": Object.freeze({
    label: "Navy Blue · Accent",
    kind: "categorical",
    tokens: Object.freeze([
      "navyBlue3", "navyBlue1", "navyBlue6", "navyBlue2", "navyBlue7", "navyBlue4", "navyBlue5",
    ]),
  }),
  "ui-kit-steel-blue": Object.freeze({
    label: "Steel Blue · Accent",
    kind: "categorical",
    tokens: Object.freeze([
      "steelBlue3", "steelBlue1", "steelBlue6", "steelBlue2", "steelBlue7", "steelBlue4", "steelBlue5",
    ]),
  }),
  "ui-kit-complement-green": Object.freeze({
    label: "Complement Green · Accent",
    kind: "categorical",
    tokens: Object.freeze([
      "complementGreen8", "complementGreen2", "complementGreen7", "complementGreen4",
      "complementGreen1", "complementGreen6", "complementGreen3", "complementGreen5",
    ]),
  }),
  "ui-kit-burnt-orange": Object.freeze({
    label: "Burnt Orange · Accent",
    kind: "categorical",
    tokens: Object.freeze([
      "burntOrange3", "burntOrange1", "burntOrange6", "burntOrange2",
      "burntOrange7", "burntOrange4", "burntOrange5",
    ]),
  }),
  "ui-kit-neutral": Object.freeze({
    label: "Neutral · Surface",
    kind: "categorical",
    tokens: Object.freeze([
      "gray4", "gray1", "gray7", "gray2", "gray6", "gray3", "gray5",
    ]),
  }),
  "ppic-official": Object.freeze({
    label: "PPIC official categorical",
    kind: "categorical",
    // UI Kit / official style-guide order for 10 groups: Orange, Navy, Lime,
    // Blue, Violet, Seafoam, Gray, Red, Green, Dark Gray.
    tokens: Object.freeze([
      "officialOrange",
      "officialNavy",
      "officialLime",
      "officialBlue",
      "officialViolet",
      "officialSeafoam",
      "officialGray",
      "officialRed",
      "officialGreen",
      "officialDarkGray",
    ]),
  }),
  "ppic-official-two-group": Object.freeze({
    label: "PPIC official two-group",
    kind: "categorical",
    tokens: Object.freeze(["officialOrange", "officialNavy"]),
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
