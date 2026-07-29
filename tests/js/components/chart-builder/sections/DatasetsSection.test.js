/**
 * Dataset-toggle acceptance tests.
 *
 * Provenance (Data vintage) and stratification used to live here. The vintage
 * control was removed in July 2026 and the stratification pins moved to
 * TransformSection, so their tests moved with them.
 */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  config: null,
  schema: null,
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import DatasetsSection from "@/components/chart-builder/sections/DatasetsSection";

const multiSchema = {
  id: "components-of-change",
  label: "Components of Change",
  sources: ["DoF", "Census"],
  fields: {},
  filterDimensions: [],
};

describe("DatasetsSection", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.schema = multiSchema;
    state.config = { filters: { source: "DoF" } };
  });

  it("does not render for a single-dataset module", () => {
    state.schema = { ...multiSchema, sources: ["Only source"] };
    render(<DatasetsSection />);
    expect(screen.queryByRole("heading", { name: "Datasets" })).not.toBeInTheDocument();
    expect(screen.queryByText("Only source")).not.toBeInTheDocument();
  });

  it("maps raw source ids to public dataset labels", () => {
    render(<DatasetsSection />);
    expect(screen.getByText("CA Department of Finance")).toBeInTheDocument();
    expect(screen.getByText("US Census")).toBeInTheDocument();
  });

  it("selects exactly one dataset with one SET_FILTER dispatch", async () => {
    const user = userEvent.setup();
    render(<DatasetsSection />);
    const dof = screen.getByRole("checkbox", { name: "CA Department of Finance" });
    const census = screen.getByRole("checkbox", { name: "US Census" });
    expect(dof).toBeChecked();
    expect(census).not.toBeChecked();

    await user.click(census);
    expect(state.dispatch).toHaveBeenCalledTimes(1);
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_FILTER",
      key: "source",
      value: "Census",
    });
  });

  it("does not allow the active dataset to be unchecked", async () => {
    const user = userEvent.setup();
    render(<DatasetsSection />);
    await user.click(
      screen.getByRole("checkbox", { name: "CA Department of Finance" }),
    );
    expect(state.dispatch).not.toHaveBeenCalled();
  });

  it("renders nothing for a provenance-only module", () => {
    // Population & Housing: one dataset, and `Source` is per-row provenance.
    // The vintage multi-select was removed, so there is no dataset question left
    // to ask and the section is gone entirely.
    state.schema = {
      id: "pophousing",
      label: "Population & Housing",
      sources: null,
      provenanceFilter: true,
      fields: { Source: { values: ["E-5", "E-8", "Aggregated"] } },
      filterDimensions: [],
    };
    state.config = { filters: { source: ["E-5", "E-8"] } };
    const { container } = render(<DatasetsSection />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Data vintage")).not.toBeInTheDocument();
  });

  it("renders nothing for a stratification-only module", () => {
    // Housing Stress and RHNA Progress: pins, but never a dataset choice. The
    // pins now render in TransformSection.
    state.schema = {
      id: "housing-stress",
      label: "Housing Stress",
      sources: null,
      fields: {},
      filterDimensions: [
        { column: "Tenure", label: "Tenure", values: ["Owner", "Renter"], default: "Total" },
      ],
    };
    state.config = { filters: {} };
    const { container } = render(<DatasetsSection />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when a schema withdraws its toggle with datasets: []", () => {
    // Age, Sex & Race Projections: two real sources, but geography pins which
    // one, so the toggle is withdrawn rather than offered.
    state.schema = { ...multiSchema, datasets: [], sources: ["DoF P-3", "Census cc-est"] };
    state.config = { filters: { source: "DoF P-3" } };
    const { container } = render(<DatasetsSection />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Census/)).not.toBeInTheDocument();
  });
});
