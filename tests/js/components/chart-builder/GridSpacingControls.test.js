/** Line-spacing controls are independent and preserve Automatic as undefined. */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LineSpacingControls } from "@/components/chart-builder/ChartSidebar";

describe("LineSpacingControls", () => {
  it("renders pixel inputs and updates each axis independently", () => {
    const onChange = vi.fn();
    render(
      <LineSpacingControls
        lineAxes={["horizontal", "vertical"]}
        appearance={{}}
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText("Horizontal spacing (px)")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("Vertical spacing (px)"), {
      target: { value: "12" },
    });

    expect(onChange).toHaveBeenCalledWith("verticalLinePadding", 12);
  });

  it("maps Automatic back to an unset appearance value", () => {
    const onChange = vi.fn();
    render(
      <LineSpacingControls
        lineAxes={["horizontal"]}
        appearance={{ horizontalLinePadding: 16 }}
        onChange={onChange}
      />,
    );

    expect(screen.queryByLabelText("Vertical spacing (px)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));

    expect(onChange).toHaveBeenCalledWith("horizontalLinePadding", undefined);
  });
});
