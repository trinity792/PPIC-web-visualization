/**
 * Tests for components/charts/GraphTabs.js — the general single-select facet
 * selector (pill buttons) shared by the dashboards and (eventually) the graph
 * editors.
 */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GraphTabs from "@/components/charts/GraphTabs";

describe("GraphTabs", () => {
  it("renders a button per string option, first active by default (uncontrolled)", () => {
    render(<GraphTabs options={["Total", "Very Low", "Low"]} ariaLabel="Income level" />);

    expect(screen.getByRole("button", { name: "Total" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Low" })).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onValueChange and moves the active state when a button is clicked", () => {
    const onValueChange = vi.fn();
    render(
      <GraphTabs options={["Total", "Very Low"]} defaultValue="Total" onValueChange={onValueChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Very Low" }));

    expect(onValueChange).toHaveBeenCalledWith("Very Low");
    expect(screen.getByRole("button", { name: "Very Low" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps one option selected — re-clicking the active button does nothing", () => {
    const onValueChange = vi.fn();
    render(<GraphTabs options={["Total", "Low"]} defaultValue="Total" onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Total" }));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Total" })).toHaveAttribute("aria-pressed", "true");
  });

  it("supports controlled usage and {value,label} options", () => {
    const onValueChange = vi.fn();
    const opts = [
      { value: "t", label: "Total" },
      { value: "vl", label: "Very Low" },
    ];
    const { rerender } = render(
      <GraphTabs options={opts} value="t" onValueChange={onValueChange} label="Income level" />,
    );
    expect(screen.getByRole("button", { name: "Total" })).toHaveAttribute("aria-pressed", "true");

    // Controlled: the active state follows the value prop, not internal clicks.
    fireEvent.click(screen.getByRole("button", { name: "Very Low" }));
    expect(onValueChange).toHaveBeenCalledWith("vl");
    expect(screen.getByRole("button", { name: "Total" })).toHaveAttribute("aria-pressed", "true");

    rerender(<GraphTabs options={opts} value="vl" onValueChange={onValueChange} label="Income level" />);
    expect(screen.getByRole("button", { name: "Very Low" })).toHaveAttribute("aria-pressed", "true");
  });
});
