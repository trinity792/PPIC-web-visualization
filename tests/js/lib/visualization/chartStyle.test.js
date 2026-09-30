import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";
import { COLORS } from "@/lib/constants";
// The object shape below is the proposed public contract for Workstream A.
describe("PPIC chart style", () => {
  it("uses Inter for every chart text role", () => {
    for (const role of ["title", "subtitle", "keyTitle", "key", "eyebrow", "axis", "dataLabel", "source"]) expect(CHART_STYLE.text[role].fontFamily).toBe("Inter, sans-serif");
  });
  it("matches the style guide type sizes", () => {
    expect(Object.fromEntries(Object.entries(CHART_STYLE.text).map(([k,v]) => [k,v.fontSize]))).toEqual({ title: 20, subtitle: 18, keyTitle: 16, key: 14, eyebrow: 12, axis: 14, dataLabel: 14, source: 11 });
    expect(CHART_STYLE.text.title.fontWeight).toBe(700);
    expect(CHART_STYLE.text.subtitle).toMatchObject({ fontWeight: 400, color: "#646D76" });
    expect(CHART_STYLE.text.eyebrow).toMatchObject({ fontWeight: 700, letterSpacing: "0.05em" });
    expect(CHART_STYLE.text.keyTitle.fontWeight).toBe(700);
  });
  it("draws graph lines at 1px in #6C7075", () => expect(CHART_STYLE.graphLine).toEqual({ width: 1, color: "#6C7075" }));
  it("draws data lines at 2px", () => expect(CHART_STYLE.dataLine.width).toBe(2));
  it("caps key swatches at 20px", () => expect(CHART_STYLE.keySwatch).toEqual({ width: 20, height: 20 }));
  it("lists the guide's three export widths", () => expect(CHART_STYLE.exportWidths).toEqual([950, 650, 330]));
  it("keeps the remaining guide spacing and grid rules", () => {
    expect(CHART_STYLE).toMatchObject({ partSpacing: 48, minBarWidth: 10, grid: { horizontal: true, vertical: false }, sourceBox: { background: "#EFF0F2" }, tableDivider: { width: 1, color: "#EFF0F2" } });
    expect(CHART_STYLE.text.axis.color).toBe("#6C7075");
    expect(Object.isFrozen(CHART_STYLE)).toBe(true);
  });
  it("takes every color from lib/constants.js", () => {
    const source = fs.readFileSync("lib/visualization/chartStyle.js", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(source).toMatch(/from ["'](?:@\/lib\/constants|\.\.\/constants)(?:\.js)?["']/);
    expect(Object.values(COLORS)).toEqual(expect.arrayContaining(["#6C7075", "#646D76", "#EFF0F2"]));
  });
});
