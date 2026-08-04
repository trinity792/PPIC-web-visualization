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
  customDivergingScale,
  UI_KIT_PALETTE_IDS,
  palettesOfKind,
  rampFor,
  rampProps,
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

describe("rampFor", () => {
  const legacyBlues = [
    [0, COLORS.blue1],
    [1, COLORS.blue5],
  ];

  it("returns the legacy blues for the default palette", () => {
    expect(rampFor({}, { kind: "sequential" })).toEqual(legacyBlues);
    expect(
      rampFor({ palette: DEFAULT_PALETTE }, { kind: "sequential" }),
    ).toEqual(legacyBlues);
  });

  it("returns the guide's published stops for an official ramp palette", () => {
    // Guide p.13, Green - five shades, evenly spaced, hand-written here rather
    // than read back out of PPIC_SEQUENTIAL.
    expect(rampFor({ palette: "ppic-ramp-green" }, { kind: "sequential" })).toEqual([
      [0, "#DEE5E2"],
      [0.25, "#BDE3D0"],
      [0.5, "#42BC89"],
      [0.75, "#196348"],
      [1, "#02391D"],
    ]);
  });

  it("interpolates the middle shade for a four-shade family", () => {
    // Orange publishes four shades, so the guide gives it no true midpoint.
    // #E9632A and #CA4F1A straddle it; their sRGB blend is #DA5922.
    expect(rampFor({ palette: "ppic-ramp-orange" }, { kind: "sequential" })).toEqual([
      [0, "#F9E1D9"],
      [0.25, "#E9632A"],
      [0.5, "#DA5922"],
      [0.75, "#CA4F1A"],
      [1, "#8F3811"],
    ]);
  });

  it("returns the official choropleth colorway for the diverging palette", () => {
    const scale = rampFor(
      { palette: "ppic-diverging-choropleth" },
      { kind: "diverging" },
    );
    expect(scale.at(0)).toEqual([0, "#8F3811"]);
    expect(scale.at(-1)).toEqual([1, "#0F4880"]);
    // The guide's own near-white neutral sits at the turn, not an interpolation.
    expect(scale.map(([, hex]) => hex)).toContain("#ECE8E7");
  });

  it("still falls back to the legacy stops for a categorical palette", () => {
    // The ui-kit families no longer carry a derived two-stop ramp; a choropleth
    // is offered the official ramps instead. Picking one here is a config a
    // reader cannot reach through the picker, so it must degrade, not throw.
    expect(rampFor({ palette: "ui-kit-teal" }, { kind: "sequential" })).toEqual(
      legacyBlues,
    );
  });

  it("falls back rather than throwing for an unknown palette id", () => {
    expect(() =>
      rampFor({ palette: "not-registered" }, { kind: "sequential" }),
    ).not.toThrow();
    expect(
      rampFor({ palette: "not-registered" }, { kind: "sequential" }),
    ).toEqual(legacyBlues);
  });

  it("resolves every registered palette to a usable ramp", () => {
    for (const id of Object.keys(PALETTES)) {
      for (const kind of ["sequential", "diverging"]) {
        const ramp = rampFor({ palette: id }, { kind });
        if (typeof ramp === "string") continue; // the named RdBu fallback
        expect(ramp.length, `${id} (${kind})`).toBeGreaterThanOrEqual(2);
        expect(ramp.at(0)[0], `${id} (${kind})`).toBe(0);
        expect(ramp.at(-1)[0], `${id} (${kind})`).toBe(1);
        for (const [, color] of ramp) {
          expect(color, `${id} (${kind})`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });

  it("offers a ramp for every official shade family", () => {
    const sequential = palettesOfKind("sequential");
    for (const family of [
      "orange", "green", "blue", "violet", "red", "seafoam", "lime", "navy", "gray",
    ]) {
      expect(sequential, family).toContain(`ppic-ramp-${family}`);
    }
  });
});

describe("customDivergingScale", () => {
  it("spaces three published shades evenly", () => {
    expect(customDivergingScale(["#8F3811", "#ECE8E7", "#0F4880"])).toEqual([
      [0, "#8F3811"],
      [0.5, "#ECE8E7"],
      [1, "#0F4880"],
    ]);
  });

  it("spaces five published shades evenly", () => {
    const scale = customDivergingScale([
      "#8F3811", "#E9632A", "#ECE8E7", "#44AFD0", "#0F4880",
    ]);
    expect(scale.map(([stop]) => stop)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("rejects a count that is neither three nor five", () => {
    expect(customDivergingScale(["#8F3811", "#0F4880"])).toBeNull();
    expect(
      customDivergingScale(["#8F3811", "#E9632A", "#ECE8E7", "#0F4880"]),
    ).toBeNull();
  });

  it("rejects a shade the guide does not publish", () => {
    // No custom hex: a hand-edited config falls back rather than rendering a
    // colour nobody could have picked in the editor.
    expect(customDivergingScale(["#8F3811", "#123456", "#0F4880"])).toBeNull();
  });

  it("rejects a missing or malformed value", () => {
    expect(customDivergingScale(undefined)).toBeNull();
    expect(customDivergingScale("#8F3811")).toBeNull();
  });

  it("wins over the selected palette on a diverging scale", () => {
    const stops = ["#8F3811", "#ECE8E7", "#0F4880"];
    expect(
      rampFor(
        { palette: "ppic-diverging-choropleth", divergingStops: stops },
        { kind: "diverging" },
      ),
    ).toEqual(customDivergingScale(stops));
  });

  it("is ignored on a sequential scale", () => {
    // The key names a diverging ramp; a sequential chart keeps its palette.
    expect(
      rampFor(
        { palette: "ppic-ramp-green", divergingStops: ["#8F3811", "#ECE8E7", "#0F4880"] },
        { kind: "sequential" },
      ).at(0),
    ).toEqual([0, "#DEE5E2"]);
  });

  it("falls back to the palette when the stops are invalid", () => {
    const scale = rampFor(
      { palette: "ppic-diverging-choropleth", divergingStops: ["#8F3811"] },
      { kind: "diverging" },
    );
    expect(scale.at(0)).toEqual([0, "#8F3811"]);
    expect(scale.at(-1)).toEqual([1, "#0F4880"]);
  });
});

describe("rampProps", () => {
  it("pairs the ramp with an unreversed direction by default", () => {
    expect(rampProps({ palette: "ppic-ramp-gray" }, { kind: "sequential" })).toEqual({
      colorscale: [
        [0, "#EFF0F2"],
        [0.25, "#DDDDDD"],
        [0.5, "#AFAEAD"],
        [0.75, "#7B7B77"],
        [1, "#191918"],
      ],
      reversescale: false,
    });
  });

  it("reverses a stop-array ramp when asked", () => {
    const forward = rampProps({ palette: "ppic-ramp-green" }, { kind: "sequential" });
    const props = rampProps(
      { palette: "ppic-ramp-green" },
      { kind: "sequential", invert: true },
    );
    // The stops keep their own order; Plotly's reversescale flips the mapping,
    // which is the one mechanism that also works on a named scale (below).
    expect(props.colorscale).toEqual(forward.colorscale);
    expect(props.reversescale).toBe(true);
  });

  it("reverses the named diverging fallback, which stops cannot express", () => {
    // The regression this exists for: the default palette's diverging ramp is
    // the *named* scale "RdBu". Reordering stops silently did nothing to it, so
    // the Invert color scale switch was dead on a default-palette diverging
    // heatmap or choropleth.
    const props = rampProps({}, { kind: "diverging", invert: true });
    expect(props.colorscale).toBe("RdBu");
    expect(props.reversescale).toBe(true);
  });

  it("leaves the named diverging fallback forward when not inverted", () => {
    expect(rampProps({}, { kind: "diverging" })).toEqual({
      colorscale: "RdBu",
      reversescale: false,
    });
  });
});
