/** Behavior tests for the synchronous landing-page topic directory. */

import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";
import { TOPICS } from "@/lib/visualization/topicRegistry";

const INTRO =
  "Each topic is a self-contained dataset with interactive charts and downloadable tables. Pick a topic below to open its dashboard and start exploring.";

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
