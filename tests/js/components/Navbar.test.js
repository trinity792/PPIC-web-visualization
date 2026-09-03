import React from "react";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Navbar from "@/components/Navbar";

describe("Navbar", () => {
  it("provides logo and Home links to the landing page", () => {
    render(<Navbar />);

    expect(screen.getByRole("link", { name: "PPIC home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("lists every topic in the Topic menu", () => {
    render(<Navbar />);

    const topicMenu = screen.getByRole("menu", { name: "Topic" });

    expect(
      within(topicMenu)
        .getAllByRole("menuitem")
        .map((link) => link.textContent),
    ).toEqual([
      "Population & Housing",
      "Components of Change",
      "Age, Sex & Race Projections",
      "ACS Housing Stress",
      "Building Permits",
      "RHNA Progress Report",
    ]);
  });

  it("points the two review-ready topics at v3 and preserves the other module routes", () => {
    render(<Navbar />);

    const topicMenu = screen.getByRole("menu", { name: "Topic" });

    expect(
      within(topicMenu)
        .getAllByRole("menuitem")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/pophousing",
      "/visualization-v3-review?module=components-of-change",
      "/visualization-v3-review?module=demographic-projections",
      "/housing-stress",
      "/building-permits",
      "/rhna-progress",
    ]);
  });

  it("keeps the non-topic links", () => {
    render(<Navbar />);

    for (const [label, href] of [
      ["Custom visualizations", "/visualization-tool"],
      ["Documents", "/documents"],
      ["Logs", "/logs"],
      ["UI Kit", "/ui-kit"],
    ]) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href,
      );
    }
  });
});
