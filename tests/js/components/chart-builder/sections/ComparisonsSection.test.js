/**
 * Workstream D - the Comparisons section.
 *
 * The section replaces the v2 scalar stratification filters, which could pin
 * exactly one value per dimension and so could never express "Black women
 * beside White men". A draft does not enter the data question until it is
 * complete: the first comparison waits for an explicit Add action, while each
 * later New comparison commits as soon as its final required field is chosen.
 *
 * The rules pinned here are the ones a reader would notice if they broke: an
 * edit that renames someone else's series, an eleventh comparison that appears
 * and is then rejected, and an outcome override that would quietly turn one
 * chart into two.
 */

import React from "react";

import { render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  config: null,
  schema: null,
  options: null,
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));
vi.mock("@/components/chart-builder/useLocationOptions", () => ({
  default: () => state.options,
  useLocationOptions: () => state.options,
}));

import {
  AdvancedModeProvider,
  AdvancedModeToggle,
} from "@/components/chart-builder/advancedMode";
import ComparisonsSection from "@/components/chart-builder/sections/ComparisonsSection";
import { COMPARISON_LIMIT_MESSAGE } from "@/lib/visualization/comparisons";

function render(ui, { advanced = false } = {}) {
  return rtlRender(
    <AdvancedModeProvider defaultAdvanced={advanced}>
      <AdvancedModeToggle id="test-advanced-mode" />
      {ui}
    </AdvancedModeProvider>,
  );
}

const schema = {
  id: "projections",
  apiPath: "/api/projections",
  sources: ["DoF P-3", "Census cc-est"],
  subsets: {
    Counties: ["County"],
    Regions: ["Region"],
    "US States": ["US State"],
  },
  subsetSource: {
    Counties: "DoF P-3",
    Regions: "DoF P-3",
    "US States": "Census cc-est",
  },
  fields: {
    Location: { kind: "dimension", label: "Location", cardinality: "high" },
    "Age Group": {
      kind: "dimension",
      label: "Age group",
      values: ["0-4", "5-9", "All Ages"],
      comparisonDimension: true,
    },
    Sex: {
      kind: "dimension",
      label: "Sex",
      values: ["Female", "Male", "Both Sexes"],
      comparisonDimension: true,
    },
    "Race/Ethnicity": {
      kind: "dimension",
      label: "Race/ethnicity",
      values: ["Hispanic", "White", "Black", "All"],
      comparisonDimension: true,
    },
    Population: { kind: "measure", label: "Population", unit: "people" },
  },
};

const comparison = (id, dimensions, extra = {}) => ({
  id,
  dimensions: { "Age Group": "All Ages", ...dimensions },
  customLabel: null,
  color: null,
  ...extra,
});

function config(overrides = {}) {
  return {
    version: 3,
    question: {
      dataset: { kind: "module", moduleId: "projections" },
      source: "DoF P-3",
      outcome: { measureId: "Population" },
      geography: { subset: "Counties", locations: ["San Francisco"] },
      time: { contract: "range", startYear: 2020, endYear: 2030 },
      calculation: { id: "actual", params: {} },
      comparisons: [comparison("cmp_latina", { "Race/Ethnicity": "Hispanic", Sex: "Female" })],
      ...overrides,
    },
    presentation: { chartType: "line", comparisonPresentation: "combined" },
  };
}

const cards = () => screen.getAllByRole("group", { name: /^comparison \d+$/i });

async function chooseDraftValue(user, draft, label, value) {
  await user.click(within(draft).getByRole("combobox", { name: label }));
  await user.click(screen.getByRole("checkbox", { name: value }));
}

beforeEach(() => {
  state.dispatch.mockClear();
  state.config = config();
  state.schema = schema;
  state.options = { status: "ready", locations: ["San Francisco", "Los Angeles"], error: null };
  Element.prototype.scrollIntoView = vi.fn();
});

describe("draft authoring", () => {
  it("adds the first complete comparison only after the reader clicks Add comparison", async () => {
    const user = userEvent.setup();
    state.config = config({ comparisons: [] });
    render(<ComparisonsSection />);

    const draft = screen.getByRole("group", { name: "Comparison draft" });
    const add = within(draft).getByRole("button", { name: "Add comparison" });
    expect(add).toBeDisabled();
    expect(screen.queryByRole("button", { name: /generate comparisons/i })).not.toBeInTheDocument();

    await chooseDraftValue(user, draft, "Race/ethnicity", "Hispanic");
    await chooseDraftValue(user, draft, "Sex", "Female");
    await chooseDraftValue(user, draft, "Age group", "All Ages");

    expect(state.dispatch).not.toHaveBeenCalled();
    expect(add).toBeEnabled();
    await user.click(add);

    const [action] = state.dispatch.mock.calls.at(-1);
    expect(action.type).toBe("SET_COMPARISONS");
    expect(action.comparisons).toHaveLength(1);
    expect(action.comparisons[0].dimensions).toEqual({
      "Race/Ethnicity": "Hispanic",
      Sex: "Female",
      "Age Group": "All Ages",
    });
  });

  it("opens and scrolls to a later draft, then commits it on the final field", async () => {
    const user = userEvent.setup();
    render(<ComparisonsSection />);

    expect(screen.queryByRole("button", { name: "Add comparison" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New comparison" }));

    const draft = screen.getByRole("group", { name: "New comparison draft" });
    expect(
      cards()[0].compareDocumentPosition(draft) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
    });
    expect(state.dispatch).not.toHaveBeenCalled();

    await chooseDraftValue(user, draft, "Race/ethnicity", "White");
    await chooseDraftValue(user, draft, "Sex", "Male");
    expect(state.dispatch).not.toHaveBeenCalled();
    await chooseDraftValue(user, draft, "Age group", "5-9");

    const [action] = state.dispatch.mock.calls.at(-1);
    expect(action.type).toBe("SET_COMPARISONS");
    expect(action.comparisons[0].id).toBe("cmp_latina");
    expect(action.comparisons).toHaveLength(2);
    expect(action.comparisons[1].dimensions).toEqual({
      "Race/Ethnicity": "White",
      Sex: "Male",
      "Age Group": "5-9",
    });
    expect(screen.queryByRole("group", { name: "New comparison draft" })).not.toBeInTheDocument();
  });

  it("can cancel a later draft without changing the question", async () => {
    const user = userEvent.setup();
    render(<ComparisonsSection />);

    await user.click(screen.getByRole("button", { name: "New comparison" }));
    await user.click(screen.getByRole("button", { name: "Cancel new comparison" }));

    expect(state.dispatch).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "New comparison draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New comparison" })).toBeInTheDocument();
  });

  it("puts aggregate choices first", async () => {
    const user = userEvent.setup();
    state.config = config({ comparisons: [] });
    render(<ComparisonsSection />);

    const draft = screen.getByRole("group", { name: "Comparison draft" });
    const race = within(draft).getByRole("combobox", { name: "Race/ethnicity" });
    await user.click(race);
    expect(
      screen.getAllByRole("checkbox").map((checkbox) => checkbox.closest("label")?.textContent),
    ).toEqual(["All", "Hispanic", "White", "Black"]);
  });
});

describe("irregular cards", () => {
  it("edits a card without changing its identity", async () => {
    const user = userEvent.setup();
    state.config = config({
      comparisons: [
        comparison(
          "cmp_latina",
          { "Race/Ethnicity": "Hispanic", Sex: "Female" },
          { customLabel: "SF Latinas", color: "Violet" },
        ),
      ],
    });
    render(<ComparisonsSection />);

    const card = cards()[0];
    await user.click(within(card).getByRole("combobox", { name: /sex/i }));
    await user.click(screen.getByRole("checkbox", { name: "Male" }));

    const [action] = state.dispatch.mock.calls.at(-1);
    const edited = action.comparisons[0];

    // The id is what the colour, the legend entry, the saved view, and the
    // returned observations are keyed by. An edit that regenerates it moves
    // another series' colour onto this one.
    expect(edited.id).toBe("cmp_latina");
    expect(edited.customLabel).toBe("SF Latinas");
    expect(edited.color).toBe("Violet");
    expect(edited.dimensions.Sex).toBe("Male");
  });

  it("shows the derived label on each card", () => {
    state.config = config({
      comparisons: [comparison("cmp_latina", { "Race/Ethnicity": "Hispanic", Sex: "Female" })],
    });
    render(<ComparisonsSection />);
    expect(screen.getByText("Latina Women")).toBeInTheDocument();
    expect(screen.queryByText("San Francisco Latina Women")).not.toBeInTheDocument();
    expect(cards()[0]).toHaveClass("rounded-lg", "border", "bg-card");
    expect(within(cards()[0]).queryByLabelText(/custom label/i)).not.toBeInTheDocument();
  });

  it("removes one card without disturbing the others", async () => {
    const user = userEvent.setup();
    state.config = config({
      comparisons: [
        comparison("cmp_latina", { "Race/Ethnicity": "Hispanic", Sex: "Female" }),
        comparison("cmp_white_men", { "Race/Ethnicity": "White", Sex: "Male" }),
      ],
    });
    render(<ComparisonsSection />);

    await user.click(within(cards()[0]).getByRole("button", { name: /remove/i }));
    const [action] = state.dispatch.mock.calls.at(-1);
    expect(action.comparisons.map((entry) => entry.id)).toEqual(["cmp_white_men"]);
  });
});

describe("the ten-comparison limit", () => {
  const ten = Array.from({ length: 10 }, (_, index) =>
    comparison(`cmp_${index}`, { "Race/Ethnicity": "Hispanic", Sex: "Female" }),
  );

  it("prevents an eleventh comparison before mutation", async () => {
    const user = userEvent.setup();
    state.config = config({ comparisons: ten });
    render(<ComparisonsSection />);

    const next = screen.getByRole("button", { name: "New comparison" });
    expect(next).toBeDisabled();
    expect(screen.getByText(COMPARISON_LIMIT_MESSAGE)).toBeInTheDocument();

    await user.click(next);
    // Creating eleven and then complaining is the behaviour being replaced:
    // the reader never sees a draft that cannot become a card.
    expect(state.dispatch).not.toHaveBeenCalled();
    expect(cards()).toHaveLength(10);
    expect(screen.queryByRole("group", { name: "New comparison draft" })).not.toBeInTheDocument();
  });
});

describe("mode boundaries", () => {
  it("shows geography and time overrides only in Advanced Mode", async () => {
    const user = userEvent.setup();
    render(<ComparisonsSection />);

    // Standard Mode: every comparison shares the question's geography and time.
    expect(
      within(cards()[0]).queryByRole("button", { name: /override geography/i }),
    ).not.toBeInTheDocument();
    expect(
      within(cards()[0]).queryByRole("button", { name: /override time/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: /advanced mode/i }));

    expect(
      within(cards()[0]).getByRole("button", { name: /override geography/i }),
    ).toBeInTheDocument();
    expect(
      within(cards()[0]).getByRole("button", { name: /override time/i }),
    ).toBeInTheDocument();
  });

  it("lets an advanced geography override select its jurisdictions", async () => {
    const user = userEvent.setup();
    state.config = config({
      comparisons: [comparison(
        "cmp_latina",
        { "Race/Ethnicity": "Hispanic", Sex: "Female" },
        {
          geography: { subset: "Regions", locations: ["Bay Area"] },
          source: "DoF P-3",
        },
      )],
    });
    state.options = {
      status: "ready",
      locations: ["Bay Area", "Central Coast"],
      error: null,
    };
    render(<ComparisonsSection />, { advanced: true });

    const card = cards()[0];
    await user.click(within(card).getByRole("button", { name: /override geography/i }));
    expect(
      within(card).getByRole("combobox", { name: /geographic level for this comparison/i }),
    ).toHaveTextContent("Regions");
    const locations = within(card).getByRole("combobox", { name: /comparison locations/i });
    expect(locations).toHaveTextContent("Bay Area");

    await user.click(locations);
    await user.click(screen.getByRole("checkbox", { name: "Central Coast" }));

    const [action] = state.dispatch.mock.calls.at(-1);
    expect(action.type).toBe("SET_COMPARISONS");
    expect(action.comparisons[0]).toMatchObject({
      id: "cmp_latina",
      source: "DoF P-3",
      geography: { subset: "Regions", locations: ["Bay Area", "Central Coast"] },
    });
  });

  it("updates the source and clears jurisdictions when an override changes level", async () => {
    const user = userEvent.setup();
    render(<ComparisonsSection />, { advanced: true });

    const card = cards()[0];
    await user.click(within(card).getByRole("button", { name: /override geography/i }));
    await user.click(
      within(card).getByRole("combobox", { name: /geographic level for this comparison/i }),
    );
    await user.click(screen.getByRole("option", { name: "US States" }));

    const [action] = state.dispatch.mock.calls.at(-1);
    expect(action.comparisons[0]).toMatchObject({
      id: "cmp_latina",
      source: "Census cc-est",
      geography: { subset: "US States", locations: [] },
    });
  });

  it("can return an advanced comparison to the shared geography", async () => {
    const user = userEvent.setup();
    state.config = config({
      comparisons: [comparison(
        "cmp_latina",
        { "Race/Ethnicity": "Hispanic", Sex: "Female" },
        {
          geography: { subset: "Regions", locations: ["Bay Area"] },
          source: "DoF P-3",
        },
      )],
    });
    render(<ComparisonsSection />, { advanced: true });

    const card = cards()[0];
    await user.click(within(card).getByRole("button", { name: /override geography/i }));
    await user.click(within(card).getByRole("button", { name: /use shared geography/i }));

    expect(state.dispatch.mock.calls.at(-1)[0].comparisons[0]).toMatchObject({
      id: "cmp_latina",
      geography: null,
      source: null,
    });
  });

  it("never shows an outcome override", async () => {
    const user = userEvent.setup();
    render(<ComparisonsSection />, { advanced: true });

    // Multiple outcomes are deferred in both modes. One shared outcome is what
    // makes a comparison a comparison: two measures on one chart is a different
    // product decision, not a hidden setting.
    expect(within(cards()[0]).queryByLabelText(/outcome/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: /advanced mode/i }));
    expect(within(cards()[0]).queryByLabelText(/outcome/i)).not.toBeInTheDocument();
  });

  it("explains an overlapping aggregate rather than blocking it", () => {
    state.config = config({
      comparisons: [
        comparison("cmp_total", { "Race/Ethnicity": "All", Sex: "Both Sexes" }),
        comparison("cmp_latina", { "Race/Ethnicity": "Hispanic", Sex: "Female" }),
      ],
    });
    render(<ComparisonsSection />);

    // Comparing a subgroup with its own total is intentional and valid. The
    // overlap is stated so a reader does not read the two marks as peers.
    expect(screen.getByText(/included in/i)).toBeInTheDocument();
    expect(cards()).toHaveLength(2);
  });
});

describe("modules without demographic comparison dimensions", () => {
  it("renders no comparison editor because place series belong to Geography", () => {
    state.schema = { ...schema, comparisonDimensions: [], fields: {} };
    state.config = config({
      comparisons: [{ id: "cmp_places", dimensions: {}, customLabel: null, color: null }],
    });
    render(<ComparisonsSection />);

    expect(
      screen.queryByText(/select one or more locations in Geographic Level/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add comparison/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new comparison/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate comparisons/i })).not.toBeInTheDocument();
  });
});
