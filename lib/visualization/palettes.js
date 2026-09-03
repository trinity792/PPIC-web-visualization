/**
 * palettes.js — named color palettes and per-series/per-scale color
 * resolution for the chart-rendering layer.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Single place that resolves a palette id or brand color token to a hex
 * value for Plotly traces. `toPlotly.js`'s chart builders source every color
 * through `seriesColor`/`rampProps` rather than reaching into
 * `BASE_PLOTLY_COLORS` or `COLORS` directly, so a palette switch (or a
 * per-series override in `appearance.seriesColors`) is a single, consistent
 * code path.
 *
 * Exports:
 *   PALETTES         — { id: { label, kind, tokens? , scale? } } named palettes
 *   UI_KIT_PALETTE_IDS — the eight named color-family options from the UI Kit
 *   PPIC_CATEGORICAL_PALETTE_IDS — official categorical options for 3–10 groups
 *   DEFAULT_PALETTE  — palette id used when appearance.palette is unset
 *   resolveToken(token)                          — COLORS key (or raw #hex) → hex
 *   seriesColor(appearance, seriesName, index)    — resolved per-series color
 *   rampFor(appearance, { kind })                — palette-aware ramp for a scale-driven chart
 *   rampProps(appearance, { kind, invert })      — that ramp plus its direction, as Plotly props
 *   paletteKindFor(chartTypeId, appearance)      — "categorical" | "sequential" | "diverging"
 *   palettesOfKind(kind)                         — the ids a picker offers for that kind
 *   customDivergingScale(stops)                  — a reader's 3- or 5-shade diverging ramp
 *
 * Data sources:
 *   - lib/constants.js (COLORS, BASE_PLOTLY_COLORS)
 *   - chartRegistry.js (`colorEncoding`, for paletteKindFor)
 *   - ppicRamps.js (the guide's published shade ramps)
 */

import { BASE_PLOTLY_COLORS, COLORS } from "@/lib/constants";

import { getChartType } from "./chartRegistry";
import {
  PPIC_CHOROPLETH_DIVERGENT as PPIC_DIVERGING_RAW,
  PPIC_DIVERGING_STOPS,
  PPIC_SEQUENTIAL as PPIC_SEQUENTIAL_RAW,
  PPIC_SEQUENTIAL_FAMILIES,
  RAMP_SHADES,
} from "./ppicRamps";

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

// Editor variants of the official PPIC 3–10-group categorical schemes. These
// retain the guide's contrast order with one requested editorial adjustment:
// Lime is excluded from 3/4 groups and is the final swatch from 5 groups on.
// The existing `ppic-official` id remains the 10-group entry for saved-view
// compatibility.
const PPIC_CATEGORICAL_TOKENS = Object.freeze({
  "ppic-official-3": Object.freeze([
    "officialOrange", "officialNavy", "officialGray",
  ]),
  "ppic-official-4": Object.freeze([
    "officialOrange", "officialNavy", "officialBlue", "officialDarkGray",
  ]),
  "ppic-official-5": Object.freeze([
    "officialOrange", "officialNavy", "officialBlue", "officialDarkGray",
    "officialLime",
  ]),
  "ppic-official-6": Object.freeze([
    "officialOrange", "officialNavy", "officialBlue", "officialViolet",
    "officialDarkGray", "officialLime",
  ]),
  "ppic-official-7": Object.freeze([
    "officialOrange", "officialNavy", "officialBlue", "officialViolet",
    "officialSeafoam", "officialDarkGray", "officialLime",
  ]),
  "ppic-official-8": Object.freeze([
    "officialOrange", "officialNavy", "officialBlue", "officialViolet",
    "officialSeafoam", "officialDarkGray", "officialGray", "officialLime",
  ]),
  "ppic-official-9": Object.freeze([
    "officialOrange", "officialNavy", "officialBlue", "officialViolet",
    "officialSeafoam", "officialGray", "officialRed", "officialDarkGray",
    "officialLime",
  ]),
  "ppic-official": Object.freeze([
    "officialOrange", "officialNavy", "officialBlue", "officialViolet",
    "officialSeafoam", "officialGray", "officialRed", "officialGreen",
    "officialDarkGray", "officialLime",
  ]),
});

export const PPIC_CATEGORICAL_PALETTE_IDS = Object.freeze(
  Object.keys(PPIC_CATEGORICAL_TOKENS),
);

const PPIC_CATEGORICAL_PALETTES = Object.freeze(
  Object.fromEntries(
    PPIC_CATEGORICAL_PALETTE_IDS.map((id) => {
      const tokens = PPIC_CATEGORICAL_TOKENS[id];
      return [
        id,
        Object.freeze({
          label: `Official PPIC categorical · ${tokens.length} groups`,
          kind: "categorical",
          tokens,
        }),
      ];
    }),
  ),
);

/**
 * One `sequential` palette per official shade family (guide p.13), which is
 * what a scale-driven chart type offers. These replaced a two-stop ramp
 * derived from each `ui-kit-*` family's categorical tokens: the guide already
 * publishes the ramps, and deriving a second, near-duplicate set from the
 * runtime tokens meant a choropleth offered "Blue · Data" and "Blue" as two
 * different things.
 *
 * Stops are evenly spaced across 0-1. Every family carries five, so the
 * spacing is identical family to family - see `PPIC_SEQUENTIAL_FAMILIES` for
 * how Orange and Blue, which the guide publishes at four shades, get theirs.
 */
const PPIC_RAMP_PALETTES = Object.freeze(
  Object.fromEntries(
    PPIC_SEQUENTIAL_FAMILIES.map(({ name, stops }) => [
      `ppic-ramp-${name.toLowerCase()}`,
      Object.freeze({
        label: `${name} · sequential`,
        kind: "sequential",
        scale: Object.freeze(
          stops.map((hex, index) => [index / (stops.length - 1), hex]),
        ),
      }),
    ]),
  ),
);

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
  "ppic-official-two-group": Object.freeze({
    label: "PPIC official two-group",
    kind: "categorical",
    tokens: Object.freeze(["officialOrange", "officialNavy"]),
  }),
  ...PPIC_CATEGORICAL_PALETTES,
  ...PPIC_RAMP_PALETTES,
  "ppic-diverging-choropleth": Object.freeze({
    label: "PPIC official diverging (choropleth)",
    kind: "diverging",
    // Guide p.29, dark orange (low) through its near-white neutral to dark
    // blue (high). Raw hexes, not COLORS tokens: the guide's ramp shades are
    // their own colour set, not shades of the app's runtime palette.
    scale: Object.freeze(
      PPIC_DIVERGING_STOPS.map((hex, index) => [
        index / (PPIC_DIVERGING_STOPS.length - 1),
        hex,
      ]),
    ),
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

/** A palette's declared `scale`, with its tokens resolved to hex. */
function resolveScale(scale) {
  if (typeof scale === "string") return scale;
  return scale.map(([stop, token]) => [stop, resolveToken(token)]);
}

// The verbatim legacy stops/name, keyed by scale kind, for a palette that
// declares no ramp of its own (every categorical palette, including
// DEFAULT_PALETTE) — moved here so rendering with default appearance is
// unchanged.
function legacyRampScale(kind) {
  const legacyId = kind === "diverging" ? "diverging-redblue" : "sequential-blues";
  return resolveScale(PALETTES[legacyId].scale);
}

/**
 * A hand-picked diverging ramp: three stops (low / middle / high) or five,
 * evenly spaced, each a published shade. Returns null for anything else, so a
 * half-filled or hand-edited config falls back to the registered palette
 * rather than rendering a ramp nobody chose.
 */
export function customDivergingScale(stops) {
  if (!Array.isArray(stops)) return null;
  if (stops.length !== 3 && stops.length !== 5) return null;
  if (!stops.every((hex) => RAMP_SHADES.includes(hex))) return null;
  return stops.map((hex, index) => [index / (stops.length - 1), hex]);
}

/**
 * The sequential or diverging color ramp for a scale-driven chart type
 * (choropleth, heatmap, and a symbol map's optional gradient) — a Plotly
 * `colorscale` value: a named string or an array of `[stop, hex]` pairs.
 *
 * Resolution order:
 *   1. `appearance.divergingStops`, on a diverging scale — the reader's own
 *      three or five published shades, which outrank a named palette because
 *      picking them is a more specific act than picking a palette.
 *   2. The active palette's own `scale`, if it declares one. That is the nine
 *      official shade families (`ppic-ramp-*`) and the official choropleth
 *      colorway.
 *   3. The legacy verbatim stops for this kind, so a categorical palette —
 *      including `DEFAULT_PALETTE` — renders exactly as it always has.
 *
 * Direction is NOT this function's job — see `rampProps`.
 * @param {object} appearance
 * @param {{kind?: "sequential"|"diverging"}} [opts]
 */
export function rampFor(appearance = {}, { kind = "sequential" } = {}) {
  if (appearance?.palette === "ppic-sequential") return PPIC_SEQUENTIAL_RAW;
  if (appearance?.palette === "ppic-diverging") return PPIC_DIVERGING_RAW;
  if (kind === "diverging") {
    const custom = customDivergingScale(appearance?.divergingStops);
    if (custom) return custom;
  }
  const palette = PALETTES[appearance?.palette || DEFAULT_PALETTE];
  return palette?.scale ? resolveScale(palette.scale) : legacyRampScale(kind);
}

const PPIC_MAIN_HEX = Object.freeze({
  Orange: "#CA4F1A",
  Red: "#832522",
  Green: "#196348",
  Seafoam: "#02BDA7",
  Navy: "#293B54",
  Violet: "#693692",
  Blue: "#44AFD0",
  Lime: "#CCCB74",
  Gray: "#CFCFCF",
  "Dark Gray": "#1A1918",
});

const PPIC_SCHEME_NAMES = Object.freeze({
  1: ["Orange"],
  2: ["Orange", "Navy"],
  3: ["Orange", "Navy", "Gray"],
  4: ["Orange", "Navy", "Lime", "Blue"],
  5: ["Orange", "Navy", "Lime", "Blue", "Dark Gray"],
  6: ["Orange", "Navy", "Lime", "Blue", "Violet", "Dark Gray"],
  7: ["Orange", "Navy", "Lime", "Blue", "Violet", "Seafoam", "Dark Gray"],
  8: ["Orange", "Navy", "Lime", "Blue", "Violet", "Seafoam", "Dark Gray", "Gray"],
  9: ["Orange", "Navy", "Lime", "Blue", "Violet", "Seafoam", "Gray", "Red", "Dark Gray"],
  10: ["Orange", "Navy", "Lime", "Blue", "Violet", "Seafoam", "Gray", "Red", "Green", "Dark Gray"],
});

export const OFFICIAL_COMPARISON_COLOR_NAMES = Object.freeze(
  Object.keys(PPIC_MAIN_HEX),
);

export function officialComparisonColor(name) {
  return PPIC_MAIN_HEX[name] || null;
}

export function officialComparisonScheme(count) {
  const requested = Math.max(0, Number(count) || 0);
  const baseNames = PPIC_SCHEME_NAMES[Math.min(10, Math.max(1, requested))] || [];
  const base = baseNames.map((name) => PPIC_MAIN_HEX[name]);
  return Array.from({ length: requested }, (_, index) => base[index % base.length]);
}

export function assignComparisonColors(comparisons, {
  existing = {},
  overrides = {},
} = {}) {
  const officialTokens = new Map(
    Object.entries(PPIC_MAIN_HEX).flatMap(([name, value]) => [
      [name.toLowerCase(), value],
      [value.toLowerCase(), value],
    ]),
  );
  const resolvedOverrides = {};
  for (const [id, value] of Object.entries(overrides)) {
    const resolved = officialTokens.get(String(value).toLowerCase());
    if (!resolved) {
      throw new Error(`Comparison color ${value} is not an official PPIC token.`);
    }
    resolvedOverrides[id] = resolved;
  }
  const countChanged = Object.keys(existing).length !== comparisons.length;
  const defaults = officialComparisonScheme(comparisons.length);
  return Object.fromEntries(
    comparisons.map((comparison, index) => [
      comparison.id,
      resolvedOverrides[comparison.id] ||
        (!countChanged && existing[comparison.id]) ||
        defaults[index],
    ]),
  );
}

/**
 * Every Plotly color-scale prop a scale-driven renderer needs: the ramp plus
 * its direction. This is the single owner of that pair — a renderer spreads it
 * rather than setting `colorscale` and `reversescale` separately.
 *
 * Inversion goes through Plotly's own `reversescale` rather than reordering
 * the stops, because a ramp is not always a stop array: the legacy diverging
 * fallback is the *named* scale "RdBu", which cannot be reordered at all. An
 * earlier version reordered stops and silently passed named scales through, so
 * the Invert color scale switch did nothing on a default-palette diverging
 * heatmap or choropleth. `reversescale` applies to both forms.
 * @param {object} appearance
 * @param {{kind?: "sequential"|"diverging", invert?: boolean}} [opts]
 * @returns {{colorscale: string|Array, reversescale: boolean}}
 */
export function rampProps(appearance = {}, { kind = "sequential", invert = false } = {}) {
  return {
    colorscale: rampFor(appearance, { kind }),
    reversescale: Boolean(invert),
  };
}

/**
 * The palette ids a picker should offer for a given kind, in registry order.
 * A scale-driven chart must not be offered a categorical palette (there are no
 * ramp stops to read), and a categorical chart must not be offered a ramp.
 * @param {"categorical"|"sequential"|"diverging"} kind
 */
export function palettesOfKind(kind) {
  return Object.entries(PALETTES)
    .filter(([, palette]) => palette.kind === kind)
    .map(([id]) => id);
}

/**
 * Which flavour of palette a chart type wants right now: `"categorical"` for a
 * cycled per-series colour, or `"sequential"`/`"diverging"` for a ramp.
 *
 * Reads `colorEncoding` off the chart-type descriptor rather than a list of
 * chart-type ids, so a newly registered scale-driven type gets ramp palettes by
 * declaring itself rather than by someone remembering to edit a section file.
 * The one config-dependent case is `"conditional-scale"` (the symbol map, which
 * is categorical until its gradient is switched on) - the same shape as
 * `skeletonShapeFor`, where the descriptor states the fact and a helper folds in
 * the appearance.
 *
 * `"none"` answers `"categorical"`: a data table has nothing to colour, so the
 * question is moot, and the value exists so the registry has to say so out loud.
 * @param {string} chartTypeId
 * @param {object} [appearance]
 */
export function paletteKindFor(chartTypeId, appearance = {}) {
  const encoding = getChartType(chartTypeId)?.colorEncoding;
  const ramp = appearance?.colorScale === "diverging" ? "diverging" : "sequential";
  if (encoding === "scale") return ramp;
  if (encoding === "conditional-scale") {
    return appearance?.symbolGradient ? ramp : "categorical";
  }
  return "categorical";
}
