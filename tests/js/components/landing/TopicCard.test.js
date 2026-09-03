/** Tests for the single-link topic card used by the landing directory. */

import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import TopicCard from "@/components/landing/TopicCard";
import { COLORS } from "@/lib/constants";

const TOPIC = {
  id: "demographic-projections",
  title: "Demographic projections",
  description:
    "Population by 5-year age group, sex, and race/ethnicity out to 2070 - who a population is made of and how its composition is expected to shift.",
  accent: COLORS.officialViolet,
};

describe("TopicCard", () => {
  it("links the whole card to the topic route", () => {
    render(<TopicCard topic={TOPIC} />);

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/visualization-v3-review?module=demographic-projections",
    );
  });

  it("names the topic in the link's accessible label", () => {
    render(<TopicCard topic={TOPIC} />);

    expect(screen.getByRole("link")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Age, Sex & Race Projections"),
    );
  });

  it("shows the schema label, title, and description", () => {
    render(<TopicCard topic={TOPIC} />);

    expect(screen.getByText("Age, Sex & Race Projections")).toBeInTheDocument();
    expect(screen.getByText("Demographic projections")).toBeInTheDocument();
    expect(screen.getByText(TOPIC.description)).toBeInTheDocument();
  });

  it("renders no route path text", () => {
    render(<TopicCard topic={TOPIC} />);

    expect(screen.queryByText("/demographic-projections")).not.toBeInTheDocument();
  });

  it("offers a single Explore topic affordance", () => {
    render(<TopicCard topic={TOPIC} />);

    const link = screen.getByRole("link");
    const affordances = screen.getAllByText("Explore topic");

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(affordances).toHaveLength(1);
    expect(link).toContainElement(affordances[0]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
