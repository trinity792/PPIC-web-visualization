import React from "react";
import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { input, lineRows } from "@/tests/fixtures/visualization-v3/renderer";

import { afterEach, beforeEach } from "vitest";
import ChartFrame from "@/components/charts/ChartFrame";
let resize;
beforeEach(() => vi.stubGlobal("ResizeObserver", class { constructor(callback) { resize = callback; } observe(target) { resize([{ target, contentRect: { width: 650, height: 400 }, contentBoxSize: [{ inlineSize: 650, blockSize: 400 }] }]); } unobserve() {} disconnect() {} }));
afterEach(() => vi.unstubAllGlobals());
const frame = (props = {}) => <ChartFrame labels={{ eyebrow: "Figure 2", ...input().labels }} observations={lineRows} summary="Population increased over time." {...props}>{({width,height}) => <svg role="img" aria-label="Population chart" width={width} height={height} />}</ChartFrame>;
it("shows parts in guide order", () => {
  render(frame());
  const parts = [screen.getByText("Figure 2"), screen.getByText("Population"), screen.getByText("Selected counties"), screen.getByRole("img"), screen.getByText(/DoF P-3/)];
  for(let i=1;i<parts.length;i++) expect(parts[i-1].compareDocumentPosition(parts[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it("leaves out a part that is switched off", () => {
  render(frame({ appearance: { showTitle: false } }));
  expect(screen.queryByText("Population", { exact: true })).not.toBeInTheDocument();
});
it("leaves out a part with no text", () => {
  const { container } = render(frame({ labels: { title: "Population", subtitle: "" } }));
  expect(container.querySelector('[data-frame-part="subtitle"]')).not.toBeInTheDocument();
});
it("lists each distinct source once", () => {
  render(frame({ observations: [...lineRows, { ...lineRows[0], source: "Census cc-est" }] }));
  expect(screen.getAllByText(/DoF P-3/)).toHaveLength(1);
  const source = document.querySelector('[data-frame-part="source"]');
  expect(source).toHaveTextContent(/DoF P-3.*Census cc-est/);
  expect(source).toHaveStyle({ backgroundColor: "#EFF0F2" });
});
it("shows the footnote on the notes line", () => {
  render(frame());
  const note = screen.getByText(/Estimates may be revised/);
  expect(note.closest('[data-frame-part="notes"]')).not.toBeNull();
  expect(screen.getByText(/DoF P-3/).compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it("gives the drawing an exact width and height", () => {
  const child = vi.fn(({width,height}) => <svg width={width} height={height} />);
  const { container } = render(<ChartFrame labels={{}} observations={[]} height={400}>{child}</ChartFrame>);
  const target = container.firstElementChild;
  // ResizeObserver is the size owner; drawing children never measure the DOM.
  act(() => resize([{ target, contentRect: { width: 650, height: 400 }, contentBoxSize: [{inlineSize:650,blockSize:400}] }]));
  expect(child).toHaveBeenLastCalledWith(expect.objectContaining({ width: 650, height: 400 }));
});
it("includes a caption for screen readers", () => {
  render(frame());
  const caption = screen.getByText("Population increased over time.");
  expect(caption.tagName.toLowerCase()).toBe("figcaption");
  expect(caption).toHaveClass("sr-only");
  expect(caption).not.toHaveAttribute("aria-hidden", "true");
});

// Owner decisions 2026-09-29: the source box can be switched off, and it cites
// the topic's dataset rather than the Source filter value.
it("leaves out the whole source and notes box when Show source and notes is off", () => {
  const { container } = render(frame({ appearance: { showSource: false } }));
  expect(container.querySelector('[data-frame-part="source"]')).not.toBeInTheDocument();
  expect(screen.queryByText(/Estimates may be revised/)).not.toBeInTheDocument();
});
it("cites the topic's dataset from its source citations", () => {
  render(frame({ sourceCitations: { "DoF P-3": "California Department of Finance (DOF), P-3 Population Projections" } }));
  expect(document.querySelector('[data-frame-part="source"]')).toHaveTextContent("Source: California Department of Finance (DOF), P-3 Population Projections.");
  expect(screen.queryByText(/DoF P-3/)).not.toBeInTheDocument();
});

// Owner decision 2026-09-29: the box matches PPIC's published (Datawrapper)
// standard, measured from ppic.org embeds.
it("formats the source box as PPIC publishes it", () => {
  render(frame({ observations: [...lineRows, { ...lineRows[0], source: "Census cc-est" }] }));
  const box = document.querySelector('[data-frame-part="source"]');
  expect(box).toHaveStyle({ backgroundColor: "#EFF0F2", padding: "15px", marginTop: "20px" });
  const [sourceLine, notesLine] = box.querySelectorAll("p");
  expect(sourceLine).toHaveStyle({ fontSize: "11px", lineHeight: "16px", color: "#6C7075" });
  // Bold uppercase captions, then the text.
  const caption = sourceLine.querySelector("span");
  expect(caption).toHaveTextContent("Source:");
  expect(caption).toHaveStyle({ fontWeight: "700", textTransform: "uppercase" });
  expect(notesLine.querySelector("span")).toHaveTextContent("Notes:");
  expect(notesLine.querySelector("span")).toHaveStyle({ fontWeight: "700", textTransform: "uppercase" });
  // Citations are separated by semicolons and the line ends with a period.
  expect(sourceLine).toHaveTextContent("Source: DoF P-3; Census cc-est.");
});

// Hover on a bar chart focuses one series; the frame's key fades the others.
import { useChartFocus } from "@/components/charts/chartFocus";
function Focuses({ id }) {
  const { setFocusId } = useChartFocus();
  React.useEffect(() => setFocusId(id), [id, setFocusId]);
  return null;
}
it("fades the other series in the frame's key", () => {
  const legend = { position: "top", entries: [{ id: "a", label: "A", color: "#CA4F1A" }, { id: "b", label: "B", color: "#293B54" }] };
  const { container } = render(<ChartFrame legend={legend} height={200}>{() => <Focuses id="b" />}</ChartFrame>);
  expect([...container.querySelectorAll('[data-key-position="top"] li')].map(li => li.hasAttribute("data-faded"))).toEqual([true, false]);
});

// Owner, 2026-10-01: tighter spacing than the guide's 48px, as PPIC publishes.
it("puts 20px below the title block and 12px between a top key and the chart", () => {
  const legend = { position: "top", entries: [{ id: "a", label: "2020", color: "#2D4059" }] };
  const { container } = render(frame({ legend, height: 400 }));
  const body = container.querySelector('[data-frame-part="chart"]').parentElement;
  expect(body).toHaveStyle({ marginTop: "20px", gap: "12px" });
});
it("lets a drawing that sizes itself end where it ends", () => {
  const { container } = render(frame({ height: 400, fitContent: true }));
  const chart = container.querySelector('[data-frame-part="chart"]');
  expect(chart.style.minHeight).toBe("");
  expect(chart.className).not.toMatch(/flex-1/);
});
