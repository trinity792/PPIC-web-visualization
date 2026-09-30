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
