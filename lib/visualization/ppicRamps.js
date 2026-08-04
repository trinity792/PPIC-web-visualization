/**
 * ppicRamps.js — the official PPIC colour ramps, transcribed from the
 * "PPIC Data Visualization Style Guide" (Version 1.0, 06.24.2021).
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * These hex values reproduce the published PDF exactly and INTENTIONALLY
 * differ from the app's adapted runtime tokens in `lib/constants.js` — the
 * guide's shade ramps are their own colour set, not shades of the `COLORS`
 * palette. They live here rather than in `components/ui-kit/ppicSpec.js`
 * (which re-exports them, and where they used to live) because `palettes.js`
 * needs them at render time and `lib/` must not import from `components/`.
 *
 * Exports:
 *   PPIC_SEQUENTIAL          — the 9 families, guide-verbatim, 4 or 5 stops
 *   PPIC_SEQUENTIAL_FAMILIES — the same, normalized to 5 stops (see below)
 *   PPIC_CHOROPLETH_DIVERGENT — the guide's orange↔blue choropleth colorway
 *   PPIC_DIVERGING_STOPS     — that colorway flattened, dark orange → dark blue
 *   RAMP_SHADE_GROUPS        — every ramp shade, grouped by family, for a
 *                              swatch picker
 *
 * Data sources:
 *   - PPIC Data Visualization Style Guide pp.13, 29
 */

// ── Sequential shade ramps, lightest → darkest (guide p.13) ──────────
export const PPIC_SEQUENTIAL = Object.freeze([
  { name: "Orange", stops: ["#F9E1D9", "#E9632A", "#CA4F1A", "#8F3811"] },
  { name: "Green", stops: ["#DEE5E2", "#BDE3D0", "#42BC89", "#196348", "#02391D"] },
  { name: "Blue", stops: ["#E4EDF1", "#D6F0FB", "#44AFD0", "#0F4880"] },
  { name: "Violet", stops: ["#EEECEF", "#E5D6F0", "#A171B8", "#693692", "#3C0965"] },
  { name: "Red", stops: ["#F2DDDC", "#DBA19F", "#9F1511", "#832522", "#470806"] },
  { name: "Seafoam", stops: ["#DFE8E7", "#A2CDC8", "#02BDA7", "#0C6F63", "#02332D"] },
  { name: "Lime", stops: ["#E7E6E0", "#EEED9C", "#CCCB74", "#9A9803", "#494908"] },
  { name: "Navy", stops: ["#DFDFDF", "#C1CFE3", "#546D91", "#293B54", "#071323"] },
  { name: "Gray", stops: ["#EFF0F2", "#DDDDDD", "#AFAEAD", "#7B7B77", "#191918"] },
]);

// ── Choropleth divergent colorway (guide p.29) ───────────────────────
export const PPIC_CHOROPLETH_DIVERGENT = Object.freeze({
  negative: Object.freeze(["#8F3811", "#CA4F1A", "#E9632A", "#FFCEBD"]),
  positive: Object.freeze(["#ECE8E7", "#CBE3ED", "#44AFD0", "#0F4880"]),
});

/**
 * The choropleth colorway as one ordered list, dark orange (low) through its
 * near-white midpoint to dark blue (high) — the shape a Plotly `colorscale`
 * wants. `#ECE8E7` is the guide's own neutral, not an interpolation.
 */
export const PPIC_DIVERGING_STOPS = Object.freeze([
  ...PPIC_CHOROPLETH_DIVERGENT.negative,
  ...PPIC_CHOROPLETH_DIVERGENT.positive,
]);

// ── Midpoint inference ───────────────────────────────────────────────

function toRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
}

// Uppercase, matching every transcribed value above — an inferred shade should
// be indistinguishable in form from a published one wherever it is displayed.
function toHex([r, g, b]) {
  return `#${[r, g, b]
    .map((c) => Math.round(c).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

/** The sRGB midpoint of two hex colours. */
export function blendHex(a, b) {
  const left = toRgb(a);
  const right = toRgb(b);
  return toHex(left.map((channel, index) => (channel + right[index]) / 2));
}

/**
 * Every family at five stops.
 *
 * Seven of the nine families publish five shades; Orange and Blue publish four,
 * so they have no single middle shade. Rather than leave the set ragged - which
 * would make the diverging swatch picker offer a different number of choices
 * per family, and leave those two families with no true midpoint to build a
 * three-point scheme around - the missing middle is interpolated between the
 * two shades that straddle it. Interpolating beats picking one of the
 * neighbours: a borrowed neighbour would make the ramp visibly uneven at
 * exactly the stop a reader reads as "the middle".
 */
export const PPIC_SEQUENTIAL_FAMILIES = Object.freeze(
  PPIC_SEQUENTIAL.map(({ name, stops }) => {
    if (stops.length === 5) return Object.freeze({ name, stops: Object.freeze([...stops]) });
    const [lightest, low, high, darkest] = stops;
    return Object.freeze({
      name,
      inferredMidpoint: true,
      stops: Object.freeze([lightest, low, blendHex(low, high), high, darkest]),
    });
  }),
);

/**
 * Every shade the diverging picker may offer, grouped by the family it came
 * from, plus the choropleth colorway's own two outliers. No custom hex entry:
 * a reader picks a published shade or nothing.
 */
export const RAMP_SHADE_GROUPS = Object.freeze([
  ...PPIC_SEQUENTIAL_FAMILIES.map(({ name, stops }) =>
    Object.freeze({ name, shades: stops }),
  ),
  Object.freeze({
    name: "Choropleth",
    // The two shades the p.29 colorway contributes that no family ramp holds:
    // its pale orange end and its near-white neutral.
    shades: Object.freeze(["#FFCEBD", "#ECE8E7", "#CBE3ED"]),
  }),
]);

/** Every selectable shade, flattened - the picker's validity check. */
export const RAMP_SHADES = Object.freeze([
  ...new Set(RAMP_SHADE_GROUPS.flatMap((group) => group.shades)),
]);
