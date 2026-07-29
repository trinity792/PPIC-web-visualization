/** Phase 10 keeps the standalone card gallery as its own reachable step. */

/* eslint-disable react/prop-types */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const dispatch = vi.hoisted(() => vi.fn());
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({
    config: { module: "byod", chartType: "line" },
    dispatch,
  }),
}));
vi.mock("@/components/chart-builder/wizard/PreviewPane", () => ({
  default: () => <div>Preview</div>,
}));
vi.mock("@/components/chart-builder/wizard/StepShell", () => ({
  default: ({ title, children }) => <section aria-label={title}>{children}</section>,
}));
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }) => <div>{children}</div>,
}));

import ChartTypeStep from "@/components/chart-builder/wizard/steps/ChartTypeStep";

describe("standalone Chart Type step", () => {
  it("retains the purpose-card gallery and selection action", async () => {
    const user = userEvent.setup();
    render(<ChartTypeStep />);
    const line = screen.getByRole("button", { name: /line.*change across/i });
    expect(line).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /bar.*compare/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_CHART_TYPE",
      chartType: "bar",
    });
  });
});
