import { describe, expect, it } from "vitest";
import {
  classCountFor,
  classIndex,
  classesFor,
  classificationFor,
  colorAt,
  customBreaksFor,
  scaleStops,
} from "@/lib/visualization/colorScale";

const plain = (value, decimals) => value.toFixed(decimals);
const STOPS = [[0, "#000000"], [1, "#FFFFFF"]];

describe("scaleStops", () => {
  it("turns Plotly's named RdBu into its stops, so visx can draw it", () => {
    expect(scaleStops({}, { kind: "diverging" })).toEqual([
      [0, "#050AAC"], [0.35, "#6A89F7"], [0.5, "#BEBEBE"], [0.6, "#DCAA84"], [0.7, "#E6915A"], [1, "#B20A1C"],
    ]);
  });
  it("inverts the colors along the same stops", () => {
    expect(scaleStops({}, { kind: "diverging", invert: true }).slice(0, 2)).toEqual([[0, "#B20A1C"], [0.3, "#E6915A"]]);
  });
  it("uses the chart type's default ramp when no ramp palette is chosen", () => {
    expect(scaleStops({}, { fallback: "ppic-map-orange" })[0]).toEqual([0, "#ECE8E7"]);
  });
});

describe("colorAt", () => {
  it("blends between the stops around t", () => {
    expect(colorAt(STOPS, 0)).toBe("#000000");
    expect(colorAt(STOPS, 0.5)).toBe("#808080");
    expect(colorAt(STOPS, 1)).toBe("#FFFFFF");
  });
});

describe("classesFor", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  it("puts the same number of values in each quantile class", () => {
    const { thresholds } = classesFor(values, { count: 5, stops: STOPS, format: plain });
    expect(thresholds).toEqual([3, 5, 7, 9]);
    const counts = [0, 0, 0, 0, 0];
    for (const value of values) counts[classIndex(value, thresholds)] += 1;
    expect(counts).toEqual([2, 2, 2, 2, 2]);
  });
  it("splits the value range evenly for equal intervals", () => {
    const { thresholds } = classesFor([0, 1, 2, 100], { method: "equalInterval", count: 4, stops: STOPS, format: plain });
    expect(thresholds).toEqual([25, 50, 75]);
  });
  it("labels the ends with < and > and each middle class by its range", () => {
    const { classes } = classesFor([14, 14.5, 15, 16, 17, 18, 18.5, 19], { count: 3, stops: STOPS, decimalPlaces: 1, format: plain });
    expect(classes.map((entry) => entry.label)).toEqual(["< 16.0", "16.0 – 18.4", "> 18.4"]);
  });
  it("never draws an empty class when values repeat", () => {
    const { classes } = classesFor([5, 5, 5, 5, 9], { count: 5, stops: STOPS, format: plain });
    expect(classes.length).toBeLessThan(5);
    expect(classes.length).toBeGreaterThan(0);
  });
  it("draws one class for one value", () => {
    expect(classesFor([7], { count: 5, stops: STOPS, format: plain }).classes.map((entry) => entry.label)).toEqual(["7"]);
  });
});

describe("custom breaks", () => {
  // Advanced Mode (owner, 2026-10-12): the reader types where each class starts.
  it("uses the reader's breaks as typed and labels them to their precision", () => {
    const { thresholds, classes } = classesFor([13, 14.5, 16, 17.9, 19], {
      count: 5, stops: STOPS, breaks: [14.1, 15.6, 17.4, 18.4], format: plain,
    });
    expect(thresholds).toEqual([14.1, 15.6, 17.4, 18.4]);
    // The guide's p.29 key.
    expect(classes.map((entry) => entry.label)).toEqual(["< 14.1", "14.1 – 15.5", "15.6 – 17.3", "17.4 – 18.3", "> 18.3"]);
  });
  it("keeps a class no value falls in", () => {
    expect(classesFor([1, 2], { count: 3, stops: STOPS, breaks: [10, 20], format: plain }).classes).toHaveLength(3);
  });
  it("accepts breaks only when they fit the class count and rise", () => {
    expect(customBreaksFor({ classBreaks: [1, "2.5", 4] }, 4)).toEqual([1, 2.5, 4]);
    expect(customBreaksFor({ classBreaks: [1, 2] }, 4)).toBeNull();
    expect(customBreaksFor({ classBreaks: [1, 3, 2] }, 4)).toBeNull();
    expect(customBreaksFor({ classBreaks: [1, null, 4] }, 4)).toBeNull();
  });
});

describe("settings", () => {
  it("defaults to five quantile classes and keeps the count within 3 to 7", () => {
    expect(classificationFor({})).toBe("quantile");
    expect(classificationFor({ classification: "nonsense" })).toBe("quantile");
    expect(classCountFor({})).toBe(5);
    expect(classCountFor({ bins: 99 })).toBe(7);
    expect(classCountFor({ bins: 1 })).toBe(3);
  });
});
