/** Desktop height contract for the standalone wizard's shared two-column shell. */

import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import StepShell from "@/components/chart-builder/wizard/StepShell";

describe("StepShell desktop height", () => {
  it("lets the chart set the row height and clamps the sidebar to it", () => {
    const { container } = render(
      <StepShell title="Edit" preview={<div>Chart preview</div>}>
        Sidebar controls
      </StepShell>,
    );
    const cards = container.querySelectorAll('[data-slot="card"]');
    const shell = screen.getByText("Chart preview").closest("[data-slot='card']")
      .parentElement.parentElement;

    expect(shell).toHaveClass("lg:items-stretch");
    expect(shell).not.toHaveClass("lg:items-start");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveClass(
      "lg:absolute",
      "lg:inset-0",
      "lg:min-h-0",
      "lg:overflow-y-auto",
    );
    expect(cards[1]).not.toHaveClass("lg:absolute", "lg:h-full");
  });
});
