import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";


import ChartKey from "@/components/charts/visx/ChartKey";
const entries = [{ id: "a", label: "Latina Women", color: "#CA4F1A" }, { id: "b", label: "White Women", color: "#293B54" }];
it("draws square swatches no larger than 20px", () => {
  const { container } = render(<ChartKey entries={entries} legendPosition="right" />);
  const swatches = container.querySelectorAll('[data-key-swatch]');
  expect(swatches).toHaveLength(2);
  for (const swatch of swatches) {
    expect(swatch).toHaveStyle({ width: "20px", height: "20px" });
  }
});
it.each(["right", "bottom", "hidden"])("places the key right, at the bottom, or hides it: %s", legendPosition => {
  const { container } = render(<ChartKey entries={entries} legendPosition={legendPosition} />);
  if (legendPosition === "hidden") expect(container).toBeEmptyDOMElement();
  else {
    expect(container.querySelector('[data-key-position]')).toHaveAttribute("data-key-position", legendPosition);
    expect(screen.getByText("Latina Women")).toBeInTheDocument();
  }
});
it("draws a line sample for line series", () => {
  const { container } = render(<ChartKey entries={[{ ...entries[0], kind: "line", dashed: true }]} legendPosition="right" />);
  const line = container.querySelector("line");
  expect(line).toHaveAttribute("stroke", "#CA4F1A");
  expect(line.getAttribute("stroke-dasharray")).toBeTruthy();
  expect(container.querySelector("rect")).toBeNull();
});

// Owner, 2026-09-30: hiding the other entries made the key too dim; their
// samples fade as their bars do, and every label stays readable.
it("fades the other entries' samples while one series is focused, keeping every label", () => {
  const { container } = render(<ChartKey legendPosition="top" focusId="b" entries={[{ id: "a", label: "A", color: "#CA4F1A" }, { id: "b", label: "B", color: "#293B54" }]} />);
  const entries = [...container.querySelectorAll("li")];
  expect(entries.map(li => li.style.visibility)).toEqual(["", ""]);
  expect(entries.map(li => li.querySelector("[data-key-swatch]").style.backgroundColor)).toEqual(["rgb(239, 202, 186)", "rgb(41, 59, 84)"]);
  expect(entries.map(li => li.textContent)).toEqual(["A", "B"]);
  expect(container.querySelector('[data-key-position="top"]')).toBeInTheDocument();
});

it("draws a dot sample for each of the range chart's ends", () => {
  const { container } = render(<ChartKey entries={[{ id: "start", label: "2020", color: "#2D4059", kind: "dot" }, { id: "end", label: "2030", color: "#E36A36", kind: "dot" }]} legendPosition="top" />);
  expect([...container.querySelectorAll('[data-key-sample="dot"] circle')].map(c => c.getAttribute("fill"))).toEqual(["#2D4059", "#E36A36"]);
});
