import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { input, lineRows, comparisons, observations } from "@/tests/fixtures/visualization-v3/renderer";

import BarChart from "@/components/charts/visx/BarChart";
import { buildBarModel } from "@/lib/visualization/models/barModel";
function draw(appearance = {}, overrides = {}, width = 650) {
  const model = buildBarModel(input("bar", { appearance, ...overrides }));
  return { model, ...render(<BarChart model={model} width={width} height={400} />) };
}

it("never draws a bar narrower than 10px", () => {
  const { container } = draw({}, {}, 330);
  const bars = container.querySelectorAll('[data-mark="bar"]');
  expect(bars.length).toBeGreaterThan(0);
  for (const bar of bars) expect(Number(bar.getAttribute("width"))).toBeGreaterThanOrEqual(10);
});
it("asks for fewer categories when the minimum bar width cannot fit", () => {
  const rows = Array.from({length:80}, (_,i) => ({ ...lineRows[0], geographyId: String(i), geographyLabel: `County ${i}` }));
  const { container } = draw({}, { observations: rows, comparisons: [comparisons[0]] }, 330);
  expect(screen.getByRole("status")).toHaveTextContent(/fewer categories/i);
  expect(container.querySelectorAll('[data-mark="bar"]')).toHaveLength(0);
});
it("draws no vertical grid lines", () => expect(draw().container.querySelectorAll('[data-grid="vertical"]')).toHaveLength(0));
// Owner decision 2026-09-30: left-aligned, as PPIC's published charts show
// (the style guide shows right-aligned).
it("draws horizontal bars with left-aligned labels", () => {
  const { container } = draw({ orientation: "horizontal" });
  const labels = container.querySelectorAll('[data-mark="category-label"]');
  expect(labels).toHaveLength(2);
  for (const label of labels) expect(label).toHaveAttribute("text-anchor", "start");
  const bar = container.querySelector('[data-mark="bar"]');
  expect(Number(bar.getAttribute("width"))).toBeGreaterThan(0);
});
it.each([0,60000])("draws the reference line and its label: %s", referenceValue => {
  const { container } = draw({ diverging: true, referenceValue, referenceLabel: "Target" });
  expect(container.querySelector('[data-mark="reference-line"]')).toHaveAttribute("data-value", String(referenceValue));
  expect(screen.getByText("Target")).toBeInTheDocument();
});
it("draws the track rail behind each bar", () => {
  const { container } = draw({ diverging: true, trackRail: true });
  const rails = container.querySelectorAll('[data-mark="track-rail"]');
  expect(rails).toHaveLength(4);
  expect(rails[0].compareDocumentPosition(container.querySelector('[data-mark="bar"]')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it("draws the minimal axis", () => {
  const { container } = draw({ diverging: true, minimalAxis: true });
  expect(container.querySelectorAll('[data-mark="axis-tick-label"]')).toHaveLength(0);
  expect(container.querySelector('[data-mark="axis-line"]')).toBeInTheDocument();
});
it("shows the bar's value on hover", () => {
  const { container } = draw();
  fireEvent.pointerEnter(container.querySelector('[data-mark="bar"]'));
  expect(screen.getByRole("tooltip")).toHaveTextContent("50,000");
  expect(screen.getByRole("tooltip")).toHaveTextContent("San Francisco");
  expect(screen.getByRole("tooltip")).toHaveTextContent("Latina Women");
});

// ── Added 2026-09-30 (owner decisions from the PPIC bar references) ──
const onlyLatina = () => ({ comparisons: [comparisons[0]] });
const insideLabels = container => [...container.querySelectorAll('[data-mark="value-label"][data-placement="inside"]')];

it("writes inside labels in white on dark bars and dark on light bars", () => {
  const colored = [{ ...comparisons[0], color: "Navy" }, { ...comparisons[1], color: "Lime" }];
  const { container } = draw({ showValueLabels: true, valueLabelPosition: "inside" }, { comparisons: colored });
  const fills = Object.fromEntries(insideLabels(container).map(label => [label.getAttribute("data-series"), label.getAttribute("fill")]));
  expect(fills["latina::2025"]).toBe("#FFFFFF");
  expect(fills["white::2025"]).toBe("#1A1918");
});
it("colors outside labels by series when only some series are labeled", () => {
  const { container } = draw({ showValueLabels: true, valueLabelSeries: { "White Women": false } });
  const labels = [...container.querySelectorAll('[data-mark="value-label"]')];
  expect(labels).toHaveLength(2);
  for (const label of labels) expect(label).toHaveAttribute("fill", "#CA4F1A");
  const all = draw({ showValueLabels: true, valueLabelPosition: "outside" }).container;
  for (const label of all.querySelectorAll('[data-mark="value-label"]')) expect(label).toHaveAttribute("fill", "#6C7075");
});
it("moves an inside label outside when the bar is too short", () => {
  // San Francisco's 50,000 is a sliver beside Los Angeles' 2,520,000.
  const { container } = draw({ showValueLabels: true, valueLabelPosition: "inside" }, onlyLatina());
  const placements = [...container.querySelectorAll('[data-mark="value-label"]')].map(label => label.getAttribute("data-placement"));
  expect(placements).toEqual(["outside", "inside"]);
});
it("leaves out a label on a segment too small to hold it", () => {
  const { container } = draw({ showValueLabels: true, stackMode: "stacked" });
  const keys = [...container.querySelectorAll('[data-mark="value-label"]')].map(label => label.getAttribute("data-key"));
  expect(keys).toEqual(["latina|06037|2025", "white|06037|2025"]);
});
it("labels a negative bar past its tip", () => {
  const negative = input("bar").observations.map(r => ({ ...r, value: r.geographyId === "06075" ? -r.value : r.value }));
  const { container } = draw({ showValueLabels: true }, { observations: negative, comparisons: [comparisons[0]] });
  const bar = container.querySelector('[data-mark="bar"][data-key="latina|06075|2025"]');
  const label = container.querySelector('[data-mark="value-label"][data-key="latina|06075|2025"]');
  expect(Number(label.getAttribute("y"))).toBeGreaterThan(Number(bar.getAttribute("y")) + Number(bar.getAttribute("height")));
});
it("wraps a long category label onto two lines", () => {
  const rows = input("bar").observations.map(r => ({ ...r, geographyLabel: r.geographyId === "06075" ? "San Francisco Bay Area" : r.geographyLabel }));
  const { container } = draw({}, { observations: rows, comparisons: [comparisons[0]] }, 330);
  const label = [...container.querySelectorAll('[data-mark="category-label"]')].find(node => node.textContent.includes("Francisco"));
  expect(label.querySelectorAll("tspan").length).toBe(2);
});
it("turns category labels 90 degrees when wrapping is not enough", () => {
  const states = Array.from({ length: 50 }, (_, i) => ({ ...input("bar").observations[0], geographyId: `s${i}`, geographyLabel: `State ${i}`, value: 1000 + i }));
  const { container } = draw({}, { observations: states, comparisons: [comparisons[0]] }, 950);
  const labels = container.querySelectorAll('[data-mark="category-label"]');
  expect(labels).toHaveLength(50);
  for (const label of labels) expect(label.getAttribute("transform")).toMatch(/rotate\(-90/);
});
it("draws the zero line as an axis line when values go negative", () => {
  const negative = input("bar").observations.map(r => ({ ...r, value: r.geographyId === "06075" ? -r.value : r.value }));
  const { model, container } = draw({}, { observations: negative });
  expect(model.valueAxis.domain[0]).toBeLessThan(0);
  expect(container.querySelector('[data-mark="axis-line"]')).toHaveAttribute("data-value", "0");
});
it("draws divider lines between nested groups", () => {
  const rows = observations.filter(r => r.comparisonId !== "black" && [2020, 2025].includes(r.period));
  const { container } = draw({ barColorBy: "period" }, { observations: rows });
  expect(container.querySelectorAll('[data-mark="group-label"]')).toHaveLength(2);
  expect(container.querySelectorAll('[data-mark="group-divider"]').length).toBeGreaterThan(0);
});
it("draws bold group headers for nested horizontal rows", () => {
  const rows = observations.filter(r => r.comparisonId !== "black" && [2020, 2025].includes(r.period));
  const { container } = draw({ barColorBy: "period", orientation: "horizontal" }, { observations: rows });
  const headers = container.querySelectorAll('[data-mark="group-label"]');
  expect([...headers].map(h => h.textContent)).toEqual(["San Francisco", "Los Angeles"]);
  for (const header of headers) expect(header).toHaveAttribute("font-weight", "700");
});
it("names stacked series at the right when the key is Automatic", () => {
  const { container } = draw({ stackMode: "stacked", legendPosition: "automatic" });
  expect([...container.querySelectorAll('[data-mark="direct-label"]')].map(l => l.textContent)).toEqual(["Latina Women", "White Women"]);
  expect(container.querySelector('[data-key-position="right"]')).toBeNull();
});
it("falls back to the key when stacked series names do not fit", () => {
  const five = ["a", "b", "c", "d", "e"].map((id, i) => ({ id, label: `Group ${id}` , color: ["Orange", "Navy", "Green", "Violet", "Blue"][i] }));
  const rows = five.map(c => ({ ...input("bar").observations[0], comparisonId: c.id, comparisonLabel: c.label }));
  const { container } = draw({ stackMode: "stacked", legendPosition: "automatic" }, { observations: rows, comparisons: five });
  expect(container.querySelectorAll('[data-mark="direct-label"]')).toHaveLength(0);
  expect(container.querySelector('[data-key-position="right"]')).toBeInTheDocument();
});
it("never overlaps two value labels", () => {
  const { container } = draw({ showValueLabels: true, valueLabelPosition: "outside", orientation: "horizontal" }, {}, 330);
  const boxes = [...container.querySelectorAll('[data-mark="value-label"]')].map(l => ({ y: Number(l.getAttribute("y")), x: Number(l.getAttribute("x")) }));
  const ys = boxes.map(b => b.y).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i += 1) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(14);
});
it("shows the stack total on hover", () => {
  const { container } = draw({ stackMode: "stacked" });
  fireEvent.pointerEnter(container.querySelector('[data-mark="bar"]'));
  expect(screen.getByRole("tooltip")).toHaveTextContent("113,000");
});
it("puts each bar's stable key on the drawing", () => {
  const { container } = draw();
  expect([...container.querySelectorAll('[data-mark="bar"]')].map(bar => bar.getAttribute("data-key"))).toEqual(["latina|06075|2025", "white|06075|2025", "latina|06037|2025", "white|06037|2025"]);
});
it("draws the track rail and minimal axis without diverging bars", () => {
  const { container } = draw({ trackRail: true, minimalAxis: true });
  expect(container.querySelectorAll('[data-mark="track-rail"]')).toHaveLength(4);
  expect(container.querySelectorAll('[data-mark="axis-tick-label"]')).toHaveLength(0);
});
it("moves between bars with the arrow keys", () => {
  const { container } = draw();
  const drawing = screen.getByRole("img");
  fireEvent.keyDown(drawing, { key: "ArrowRight" });
  expect(screen.getByRole("tooltip")).toHaveTextContent("50,000");
  fireEvent.keyDown(drawing, { key: "ArrowRight" });
  expect(screen.getByRole("tooltip")).toHaveTextContent("63,000");
  fireEvent.keyDown(drawing, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(container).toBeTruthy();
});

// ── Hover, as PPIC's published bar charts do it (owner, 2026-09-30) ──
// Several series: the hovered series stays, the others fade to a 30% tint,
// and every bar of the hovered series shows its value. One series: the
// hovered bar darkens (official orange to official red) and shows its value
// above it unless its value is already shown. No floating label box.
const hover = (container, key) => fireEvent.pointerEnter(container.querySelector(`[data-mark="bar"][data-key="${key}"]`));
const fillOf = (container, key) => container.querySelector(`[data-mark="bar"][data-key="${key}"]`).getAttribute("fill");

it("darkens the hovered bar of a single series to the official red", () => {
  const { container } = draw({}, onlyLatina());
  hover(container, "latina|06075|2025");
  expect(fillOf(container, "latina|06075|2025")).toBe("#832522");
  expect(fillOf(container, "latina|06037|2025")).toBe("#CA4F1A");
});
it("darkens other colors while keeping their hue", () => {
  const { container } = draw({}, { comparisons: [{ ...comparisons[0], color: "Navy" }] });
  hover(container, "latina|06075|2025");
  const fill = fillOf(container, "latina|06075|2025");
  expect(fill).not.toBe("#293B54");
  const lightness = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16)).reduce((a, b) => a + b, 0);
  expect(lightness(fill)).toBeLessThan(lightness("#293B54"));
});
it("shows a single series' hovered value above the bar in bold", () => {
  const { container } = draw({}, onlyLatina());
  hover(container, "latina|06037|2025");
  const tip = screen.getByRole("tooltip");
  expect(tip).toHaveTextContent("2,520,000");
  expect(tip).not.toHaveClass("sr-only");
  expect(tip).toHaveAttribute("data-placement", "outside");
  expect(tip.style.fontWeight).toBe("700");
});
it("only darkens a bar whose value is already shown", () => {
  const { container } = draw({ showValueLabels: true }, onlyLatina());
  hover(container, "latina|06037|2025");
  expect(screen.getByRole("tooltip")).toHaveClass("sr-only");
  expect(fillOf(container, "latina|06037|2025")).toBe("#832522");
});
it("fades the other series and labels every bar of the hovered one", () => {
  const { container } = draw();
  hover(container, "latina|06075|2025");
  // Navy mixed 30% with white: rgb(191, 196, 204).
  expect(fillOf(container, "white|06075|2025")).toBe("#BFC4CC");
  expect(fillOf(container, "white|06037|2025")).toBe("#BFC4CC");
  expect(fillOf(container, "latina|06037|2025")).toBe("#CA4F1A");
  expect(screen.getByRole("tooltip")).toHaveTextContent("50,000");
  expect([...container.querySelectorAll('[data-mark="hover-label"]')].map(l => l.textContent)).toEqual(["2,520,000"]);
});
// Owner, 2026-09-30: hovering a stacked segment showed nothing when its value
// did not fit inside it.
it("shows a stacked segment's value past the stack when it does not fit inside", () => {
  const { container } = draw({ stackMode: "stacked" });
  hover(container, "latina|06075|2025");
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).not.toHaveClass("sr-only");
  expect(tooltip).toHaveAttribute("data-placement", "outside");
  expect(tooltip).toHaveTextContent("50,000");
});
// Owner, 2026-09-30: hovering Inland Empire showed Bay Area's value inside its
// segment while the others did not fit. A stack now labels the hovered series
// everywhere or only at the hovered stack.
it("labels a stacked series in every stack or only past the hovered one", () => {
  const { container } = draw({ stackMode: "stacked" });
  // Los Angeles' 2,520,000 fits inside its segment; San Francisco's 50,000 does not.
  hover(container, "latina|06037|2025");
  expect(container.querySelectorAll('[data-mark="hover-label"]')).toHaveLength(0);
  expect(screen.getByRole("tooltip")).toHaveAttribute("data-placement", "outside");
  expect(screen.getByRole("tooltip")).toHaveTextContent("2,520,000");
});
// Owner, 2026-09-30: hover numbers take the hovered bar's color.
it("writes hover numbers in the hovered bar's color", () => {
  const { container } = draw();
  hover(container, "latina|06075|2025");
  // San Francisco's sliver puts its value outside, in the series' orange.
  expect(screen.getByRole("tooltip")).toHaveAttribute("data-placement", "outside");
  expect(screen.getByRole("tooltip").style.color).toBe("rgb(202, 79, 26)");
  // Los Angeles' value sits inside the orange bar, in white.
  expect(container.querySelector('[data-mark="hover-label"]')).toHaveAttribute("fill", "#FFFFFF");
  const single = draw({}, onlyLatina()).container;
  hover(single, "latina|06037|2025");
  // One series: the bar darkens to the official red, and so does its value.
  expect(screen.getAllByRole("tooltip").at(-1).style.color).toBe("rgb(131, 37, 34)");
});
it("fades the other series in the key, as on the bars", () => {
  const { container } = draw({ legendPosition: "automatic" });
  hover(container, "white|06075|2025");
  const entries = [...container.querySelectorAll('[data-key-position="right"] li')];
  expect(entries.map(li => [li.textContent, li.hasAttribute("data-faded")])).toEqual([["Latina Women", true], ["White Women", false]]);
});
// Owner, 2026-09-30: the category labels are gray enough already, so only the
// hovered one changes.
it("bolds the hovered category label and leaves the others as they are", () => {
  const { container } = draw({}, onlyLatina());
  hover(container, "latina|06075|2025");
  const labels = [...container.querySelectorAll('[data-mark="category-label"]')];
  expect(labels[0]).toHaveAttribute("font-weight", "700");
  expect(labels[0]).toHaveAttribute("fill", "#1A1918");
  expect(labels[1]).toHaveAttribute("fill", "#6C7075");
  expect(labels[1]).not.toHaveAttribute("font-weight");
});
it("draws no hover changes once the pointer leaves", () => {
  const { container } = draw();
  hover(container, "latina|06075|2025");
  fireEvent.pointerLeave(container.querySelector('[data-mark="bar"][data-key="latina|06075|2025"]'));
  expect(fillOf(container, "white|06075|2025")).toBe("#293B54");
  expect(container.querySelectorAll('[data-mark="hover-label"]')).toHaveLength(0);
});
it("hides the faded series' value labels while another series is hovered", () => {
  const { container } = draw({ showValueLabels: true });
  hover(container, "latina|06037|2025");
  const series = [...container.querySelectorAll('[data-mark="value-label"]')].map(l => l.getAttribute("data-series"));
  expect(series.length).toBeGreaterThan(0);
  expect(series.every(id => id === "latina::2025")).toBe(true);
});

// ── Owner, 2026-09-30: angle sparse labels; name one series' value in the key ──
it("angles category labels 45 degrees when the bars have room", () => {
  const regions = ["Bay Area", "Central Coast", "Far North", "Inland Empire", "Los Angeles (Regional)", "North San Joaquin Valley", "Sacramento (Regional)", "San Diego (Regional)", "South San Joaquin Valley"];
  const rows = regions.map((name, i) => ({ ...input("bar").observations[0], geographyId: `r${i}`, geographyLabel: name, value: 1000000 + i * 100000 }));
  const { container } = draw({}, { observations: rows, comparisons: [comparisons[0]] }, 650);
  const labels = container.querySelectorAll('[data-mark="category-label"]');
  expect(labels).toHaveLength(9);
  for (const label of labels) expect(label.getAttribute("transform")).toMatch(/rotate\(-45/);
});
it("leaves the value axis title to the key for a single series", () => {
  const one = draw({}, onlyLatina()).container;
  expect(one.querySelector('[data-axis-title="y"]')).toBeNull();
  const several = draw().container;
  expect(several.querySelector('[data-axis-title="y"]')).toHaveTextContent("People");
  const noKey = draw({ legendPosition: "hidden" }, onlyLatina()).container;
  expect(noKey.querySelector('[data-axis-title="y"]')).toHaveTextContent("People");
});
