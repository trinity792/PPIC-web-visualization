/** Phase 0 DOM/accessibility contract for extracted sidebar primitives. */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  OptionList,
  Section,
  SectionCard,
  SectionHeading,
} from "@/components/chart-builder/sections/primitives";
import { Accordion } from "@/components/ui/accordion";

function renderSection() {
  return render(
    <Accordion type="multiple" defaultValue={["geography"]}>
      <Section value="geography" label="Geography">
        <p>Counties</p>
      </Section>
    </Accordion>,
  );
}

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

  // Misclick guard: the trigger spans the row for its accessible name, but only
  // the chevron is hit-tested, so the label and the gap beside it no longer
  // collapse the section the reader was reaching into.
  describe("section disclosure hitbox", () => {
    function trigger(container) {
      return container.querySelector("[data-slot='accordion-trigger']");
    }

    it("keeps the label and the gap beside it out of the hitbox", () => {
      const { container } = renderSection();
      const button = trigger(container);

      expect(screen.getByRole("button", { name: "Geography" })).toBe(button);
      expect(button.className).toContain("pointer-events-none");
      expect(button.className).toContain("[&>svg]:pointer-events-auto");
    });

    it("still toggles when the chevron itself is clicked", async () => {
      const user = userEvent.setup();
      const { container } = renderSection();
      const button = trigger(container);
      expect(button).toHaveAttribute("aria-expanded", "true");

      // The click lands on the chevron and bubbles to the button, which is the
      // whole point of the pointer-events split above.
      await user.click(container.querySelector("[data-slot='accordion-trigger'] > svg"));
      expect(button).toHaveAttribute("aria-expanded", "false");
    });
  });
});
