/**
 * Tests for lib/visualization/palettes.js — the single place that resolves a
 * palette id or brand color token to a hex value for Plotly traces.
 */

import { describe, expect, it } from "vitest";

import { BASE_PLOTLY_COLORS, COLORS } from "@/lib/constants";
import {
  DEFAULT_PALETTE,
  PALETTES,
  PPIC_CATEGORICAL_PALETTE_IDS,
  UI_KIT_PALETTE_IDS,
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

  it("registers every named UI Kit color-family palette as an editor option", () => {
    expect(UI_KIT_PALETTE_IDS).toHaveLength(8);
    expect(UI_KIT_PALETTE_IDS.map((id) => PALETTES[id]?.label)).toEqual([
      "Orange · Brand",
      "Blue · Data",
      "Teal · Data",
      "Navy Blue · Accent",
      "Steel Blue · Accent",
      "Complement Green · Accent",
      "Burnt Orange · Accent",
      "Neutral · Surface",
    ]);
    for (const id of UI_KIT_PALETTE_IDS) {
      expect(PALETTES[id]?.kind).toBe("categorical");
    }
  });

  it("registers official PPIC 3–10-group palettes with Lime last from group 5", () => {
    expect(PPIC_CATEGORICAL_PALETTE_IDS).toEqual([
      "ppic-official-3",
      "ppic-official-4",
      "ppic-official-5",
      "ppic-official-6",
      "ppic-official-7",
      "ppic-official-8",
      "ppic-official-9",
      "ppic-official",
    ]);

    PPIC_CATEGORICAL_PALETTE_IDS.forEach((id, index) => {
      const groupCount = index + 3;
      const palette = PALETTES[id];
      expect(palette.label).toBe(
        `Official PPIC categorical · ${groupCount} groups`,
      );
      expect(palette.tokens).toHaveLength(groupCount);
      if (groupCount < 5) {
        expect(palette.tokens).not.toContain("officialLime");
      } else {
        expect(palette.tokens.at(-1)).toBe("officialLime");
      }
    });
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
