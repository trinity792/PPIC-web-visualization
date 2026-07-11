/**
 * Tests for the Changelog tab of the /logs page (components/logs/ChangelogBrowser.js
 * and its ChangelogCard). Verifies that changelog records render as cards with the
 * expected fields (title, intensity chip, audited badge, area/module/commit rows)
 * and that the area / intensity / audited filters narrow the list.
 */

import React from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ChangelogBrowser from "@/components/logs/ChangelogBrowser";

const ENTRIES = [
  {
    id: "aaa1111",
    commit: "aaa1111",
    timestamp: "2026-07-11T10:00:00-07:00",
    date: "2026-07-11",
    title: "Rewrote the refactor guides",
    description: "Turned planning docs into as-built guides.",
    area: "Documentation",
    intensity: "low",
    audited: false,
    contributor: "Trinity Jones",
    module: null,
  },
  {
    id: "bbb2222",
    commit: "bbb2222",
    timestamp: "2026-07-10T09:00:00-07:00",
    date: "2026-07-10",
    title: "Graph editor UI overhaul",
    description: "Major restructuring of the graph editor.",
    area: "Front-end components",
    intensity: "high",
    audited: true,
    contributor: "Trinity Jones",
    module: "Building Permits",
  },
];

const AREAS = ["All areas", "Documentation", "Front-end components"];
const INTENSITIES = ["All intensities", "low", "high"];

function renderBrowser() {
  return render(
    <ChangelogBrowser entries={ENTRIES} areas={AREAS} intensities={INTENSITIES} />,
  );
}

describe("ChangelogBrowser", () => {
  it("renders each changelog entry as a card with its fields", () => {
    renderBrowser();

    expect(screen.getByText("2 changes")).toBeInTheDocument();

    // Titles + descriptions.
    expect(screen.getByText("Rewrote the refactor guides")).toBeInTheDocument();
    expect(screen.getByText("Graph editor UI overhaul")).toBeInTheDocument();

    // Intensity chips.
    expect(screen.getByText(/Low impact/)).toBeInTheDocument();
    expect(screen.getByText(/High impact/)).toBeInTheDocument();

    // Audited badges — one audited, one not.
    expect(screen.getByText("Audited")).toBeInTheDocument();
    expect(screen.getByText("Not yet audited")).toBeInTheDocument();

    // Area + commit values.
    expect(screen.getByText("Documentation")).toBeInTheDocument();
    expect(screen.getByText("Front-end components")).toBeInTheDocument();
    expect(screen.getByText("aaa1111")).toBeInTheDocument();
    expect(screen.getByText("Building Permits")).toBeInTheDocument();
  });

  it("filters by intensity via the sidebar select", () => {
    renderBrowser();

    // Open the Intensity select (second combobox: area, intensity, audit status).
    const [, intensitySelect] = screen.getAllByRole("combobox");
    fireEvent.click(intensitySelect);

    // Choose "High" from the listbox.
    const highOption = screen.getByRole("option", { name: "High" });
    fireEvent.click(highOption);

    expect(screen.getByText("1 change")).toBeInTheDocument();
    expect(screen.getByText("Graph editor UI overhaul")).toBeInTheDocument();
    expect(screen.queryByText("Rewrote the refactor guides")).not.toBeInTheDocument();
  });

  it("shows an empty state when filters match nothing", () => {
    render(
      <ChangelogBrowser
        entries={[]}
        areas={["All areas"]}
        intensities={["All intensities"]}
      />,
    );
    expect(screen.getByText("No changes match your filters.")).toBeInTheDocument();
  });
});
