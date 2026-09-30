import { expect, it } from "vitest";
import { sharedSettings } from "@/lib/visualization/models/sharedSettings";
import { input } from "@/tests/fixtures/visualization-v3/renderer";
const settings = (appearance = {}, labels = input().labels) => sharedSettings(input("line", { appearance, labels }));
it("falls back to guide sizes when none are set", () => expect(settings().typography).toEqual({ title: 20, subtitle: 18, axis: 14, legend: 14, dataLabel: 14 }));
it.each([
  ["titleFontSize", "title", 14, 32], ["subtitleFontSize", "subtitle", 11, 24],
  ["axisFontSize", "axis", 9, 20], ["legendFontSize", "legend", 10, 20], ["dataLabelFontSize", "dataLabel", 9, 22],
])("keeps %s within the Typography section's limits", (key, role, min, max) => {
  expect(settings({ [key]: 99 }).typography[role]).toBe(max);
  expect(settings({ [key]: -1 }).typography[role]).toBe(min);
  expect(settings({ [key]: 16 }).typography[role]).toBe(16);
});
it.each([["showTitle", "title"], ["showSubtitle", "subtitle"], ["showXAxisLabel", "xAxis"], ["showYAxisLabel", "yAxis"]])("honors %s", (key, label) => {
  expect(settings({ [key]: false }).labels[label]).toBeNull();
  expect(settings({ [key]: true }).labels[label]).toBe(input().labels[label]);
});
it("reads the subtitle and footnote", () => expect(settings().labels).toMatchObject({ subtitle: "Selected counties", footnote: "Estimates may be revised." }));
it.each(["right", "bottom", "hidden", "automatic"])("reads %s legend placement", position => expect(settings({ legendPosition: position }).key.position).toBe(position));
it.each([
  ["usd", 1234.5, 0, "$1,235"], ["usd", 1234.5, 2, "$1,234.50"],
  ["percent", 12.345, 2, "12.35%"], ["number", 1234.5, 1, "1,234.5"],
])("formats dollars, percents, and plain numbers: %s", (type, value, places, expected) => {
  const result = settings({ horizontalNumberType: type, verticalNumberType: type, decimalPlaces: places });
  expect(result.axes.x.format(value)).toBe(expected);
  expect(result.axes.y.format(value)).toBe(expected);
});
it("leaves whole-number counts unformatted when no number type is chosen", () => expect(settings({ decimalPlaces: 3 }).axes.y.format(40000)).toBe("40000"));
it("honors both tick increments", () => expect(settings({ horizontalTickIncrement: 5, verticalTickIncrement: 10 }).axes).toMatchObject({ x: { increment: 5 }, y: { increment: 10 } }));
it("ignores removed and hidden settings without error", () => {
  const old = settings({ showLegend: false, hiddenSeries: ["Latina Women"], legendLabels: { "Latina Women": "Changed" }, seriesColors: { "Latina Women": "#000000" }, groupLabelIndent: 20, variableLabelIndent: 40 }, { ...input().labels, tooltip: "%{y}" });
  // Functions cannot be deep-compared; compare the actual formatting and all
  // serializable drawing instructions independently.
  expect(JSON.stringify(old)).toBe(JSON.stringify(settings()));
  expect(old.axes.y.format(40000)).toBe("40000");
});
