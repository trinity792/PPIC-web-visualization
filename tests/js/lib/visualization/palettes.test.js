/**
 * Tests for lib/visualization/palettes.js — the single place that resolves a
 * palette id or brand color token to a hex value for Plotly traces.
 */

import { describe, expect, it } from "vitest";

import { BASE_PLOTLY_COLORS, COLORS } from "@/lib/constants";
import {
  DEFAULT_PALETTE,
  PALETTES,
  paletteForScale,
  resolveToken,
  seriesColor,
} from "@/lib/visualization/palettes";

describe("PALETTES", () => {
  it("resolves every declared token to a known hex value", () => {
    for (const palette of Object.values(PALETTES)) {
      if (palette.kind === "categorical") {
        for (const token of palette.tokens) {
          expect(() => resolveToken(token)).not.toThrow();
        }
      } else if (typeof palette.scale !== "string") {
        for (const [, token] of palette.scale) {
          expect(() => resolveToken(token)).not.toThrow();
        }
      }
    }
  });

  it("brand-categorical hexes exactly equal BASE_PLOTLY_COLORS, in order", () => {
    const hexes = PALETTES["brand-categorical"].tokens.map(resolveToken);
    expect(hexes).toEqual(BASE_PLOTLY_COLORS);
  });

  it("DEFAULT_PALETTE names a registered palette", () => {
    expect(PALETTES[DEFAULT_PALETTE]).toBeDefined();
  });
});

describe("resolveToken", () => {
  it("resolves a COLORS key to its hex value", () => {
    expect(resolveToken("blue3")).toBe(COLORS.blue3);
  });

  it("passes a raw hex value through unchanged", () => {
    expect(resolveToken("#ff0000")).toBe("#ff0000");
  });

  it("throws, naming the token, for an unknown token", () => {
    expect(() => resolveToken("notAColor")).toThrow(/notAColor/);
  });
});

describe("seriesColor", () => {
  it("uses the per-series override when one is set", () => {
    const appearance = { seriesColors: { California: "orange3" } };
    expect(seriesColor(appearance, "California", 0)).toBe(COLORS.orange3);
  });

  it("falls back to the active palette, cycled by index", () => {
    const appearance = { palette: "colorblind-safe" };
    const tokens = PALETTES["colorblind-safe"].tokens;
    expect(seriesColor(appearance, "Alameda", 2)).toBe(resolveToken(tokens[2]));
  });

  it("falls back to BASE_PLOTLY_COLORS for an unknown palette id", () => {
    const appearance = { palette: "no-such-palette" };
    expect(seriesColor(appearance, "Alameda", 1)).toBe(BASE_PLOTLY_COLORS[1]);
  });

  it("defaults to the brand-categorical palette when appearance is empty", () => {
    expect(seriesColor({}, "Alameda", 0)).toBe(BASE_PLOTLY_COLORS[0]);
  });

  it("overrides win over the active palette", () => {
    const appearance = {
      palette: "colorblind-safe",
      seriesColors: { Alameda: "burntOrange" },
    };
    expect(seriesColor(appearance, "Alameda", 0)).toBe(COLORS.burntOrange);
  });
});

describe("paletteForScale", () => {
  it("returns the legacy CHOROPLETH_BLUES stops for sequential", () => {
    expect(paletteForScale("sequential")).toEqual([
      [0, COLORS.blue1],
      [1, COLORS.blue5],
    ]);
  });

  it("returns the legacy 'RdBu' Plotly colorscale for diverging", () => {
    expect(paletteForScale("diverging")).toBe("RdBu");
  });

  it("throws, naming the kind, for an unregistered scale kind", () => {
    expect(() => paletteForScale("notAKind")).toThrow(/notAKind/);
  });
});
