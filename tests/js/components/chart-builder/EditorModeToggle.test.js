/**
 * Tests for components/chart-builder/EditorModeToggle.js — the GUI/Code mode
 * switch + Advanced Mode toggle. Fully controlled by props (no
 * ChartConfigProvider dependency), so it renders without CodeMirror or any
 * chart-config context — kept intentionally light per the "no RTL tests
 * mounting CodeMirror" rule (this component never touches CodeMirror).
 */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import EditorModeToggle from "@/components/chart-builder/EditorModeToggle";

describe("EditorModeToggle", () => {
  it("shows the Code tab at the moderate tier and reports mode changes", async () => {
    const onModeChange = vi.fn();
    render(
      <EditorModeToggle
        mode="gui"
        onModeChange={onModeChange}
        tier="moderate"
        onTierChange={vi.fn()}
      />,
    );
    const codeTab = screen.getByRole("tab", { name: "Code" });
    expect(codeTab).toBeInTheDocument();
    await userEvent.click(codeTab);
    expect(onModeChange).toHaveBeenCalledWith("code");
  });

  it("hides the Code tab at the basic tier (codeEditor gates at moderate)", () => {
    render(
      <EditorModeToggle mode="gui" onModeChange={vi.fn()} tier="basic" onTierChange={vi.fn()} />,
    );
    expect(screen.queryByRole("tab", { name: "Code" })).not.toBeInTheDocument();
  });

  it("defaults Advanced Mode to off and enables the advanced tier", async () => {
    const onTierChange = vi.fn();
    render(
      <EditorModeToggle
        mode="gui"
        onModeChange={vi.fn()}
        tier="moderate"
        onTierChange={onTierChange}
      />,
    );
    const advancedMode = screen.getByRole("switch", { name: "Advanced Mode" });
    expect(advancedMode).not.toBeChecked();
    await userEvent.click(advancedMode);
    expect(onTierChange).toHaveBeenCalledWith("advanced");
  });

  it("returns to the standard moderate tier when Advanced Mode is disabled", async () => {
    const onTierChange = vi.fn();
    render(
      <EditorModeToggle
        mode="gui"
        onModeChange={vi.fn()}
        tier="advanced"
        onTierChange={onTierChange}
      />,
    );
    const advancedMode = screen.getByRole("switch", { name: "Advanced Mode" });
    expect(advancedMode).toBeChecked();
    await userEvent.click(advancedMode);
    expect(onTierChange).toHaveBeenCalledWith("moderate");
  });
});
