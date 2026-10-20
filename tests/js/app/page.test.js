/** Behavior tests for the synchronous landing-page topic directory. */

import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";
import { TOPICS } from "@/lib/visualization/topicRegistry";

const INTRO =
  "A data visualization tool for exploring California population and housing data. Select a topic below to chart its data, or choose Custom visualizations at the top of the page to create charts with your own data.";

describe("landing page", () => {
  it("renders the tool's name and the topic subtext", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "PPIC Interactive Visualization Tool",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(INTRO)).toBeInTheDocument();
  });

  it("renders one card per registered topic", () => {
    render(<Home />);

    expect(screen.getAllByRole("link")).toHaveLength(TOPICS.length);
  });

  it("renders no dashboards or coming-soon cards", () => {
    render(<Home />);

    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
    expect(
      screen.queryByText("California Population & Housing Trends"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("California Regional Housing Needs Allocation"),
    ).not.toBeInTheDocument();
  });
});
