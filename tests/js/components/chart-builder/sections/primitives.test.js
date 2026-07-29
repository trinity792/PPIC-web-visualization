/** Phase 0 DOM/accessibility contract for extracted sidebar primitives. */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  OptionList,
  SectionCard,
  SectionHeading,
} from "@/components/chart-builder/sections/primitives";

describe("sidebar section primitives", () => {
  it("renders headings and cards without changing their semantic content", () => {
    render(
      <SectionCard>
        <SectionHeading>Datasets</SectionHeading>
        <p>Choose one</p>
      </SectionCard>,
    );

    expect(screen.getByRole("heading", { name: "Datasets" })).toBeInTheDocument();
    expect(screen.getByText("Choose one")).toBeInTheDocument();
  });

  it("exposes listbox/option state and reports the selected value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OptionList
        ariaLabel="Dataset"
        value="DoF"
        onChange={onChange}
        options={[
          { value: "DoF", label: "CA Department of Finance" },
          { value: "Census", label: "US Census" },
        ]}
      />,
    );

    expect(screen.getByRole("listbox", { name: "Dataset" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "CA Department of Finance" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "US Census" })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    await user.click(screen.getByRole("option", { name: "US Census" }));
    expect(onChange).toHaveBeenCalledWith("Census");
  });
});
