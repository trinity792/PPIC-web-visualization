import React from "react";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  autoBind: true,
  config: {
    data: { source: "module" },
    validation: [],
  },
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({
    autoBind: state.autoBind,
    config: state.config,
    dispatch: vi.fn(),
    schema: { inlineOnly: false },
  }),
}));

import ValidationNotice from "@/components/chart-builder/ValidationNotice";

const missingRole = {
  level: "error",
  code: "MISSING_REQUIRED_ROLE",
  role: "y",
  message: '"y" is required for a Bar chart.',
};

describe("ValidationNotice", () => {
  beforeEach(() => {
    state.autoBind = true;
    state.config = { data: { source: "module" }, validation: [] };
  });

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

  it("stays quiet about unset roles where nothing is auto-bound", () => {
    state.autoBind = false;
    state.config = { data: { source: "module" }, validation: [missingRole] };

    const { container } = render(<ValidationNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("still reports unset roles on an auto-binding surface", () => {
    state.config = { data: { source: "module" }, validation: [missingRole] };

    render(<ValidationNotice />);
    expect(screen.getByText(missingRole.message)).toBeInTheDocument();
  });

  it("reports real errors even where nothing is auto-bound", () => {
    state.autoBind = false;
    state.config = {
      data: { source: "module" },
      validation: [
        missingRole,
        {
          level: "error",
          code: "SOURCE_REQUIRED",
          message: "Choose a source.",
        },
      ],
    };

    render(<ValidationNotice />);
    expect(screen.getByText("Choose a source.")).toBeInTheDocument();
    expect(screen.queryByText(missingRole.message)).not.toBeInTheDocument();
  });
});
