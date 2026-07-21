import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  config: {
    data: { source: "module" },
    validation: [],
  },
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({
    config: state.config,
    dispatch: vi.fn(),
    schema: { inlineOnly: false },
  }),
}));

import ValidationNotice from "@/components/chart-builder/ValidationNotice";

describe("ValidationNotice", () => {
  it("does not render advisory chart recommendations", () => {
    state.config = {
      data: { source: "module" },
      validation: [
        {
          level: "warn",
          code: "RECOMMEND_TOP_N",
          message: "This chart has many categories.",
          suggestion: "Use a smaller subset.",
        },
      ],
    };

    const { container } = render(<ValidationNotice />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Recommendation")).not.toBeInTheDocument();
  });
});
