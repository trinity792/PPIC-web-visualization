/** Import overhaul, phase 4: the Edit step's View Chart / Edit Data toggle. */

import React from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

// The chart renderer is covered elsewhere; this checks its view and export shell.
vi.mock("@/components/chart-builder/wizard/PreviewPane", () => ({
  default: () => <div data-testid="chart-preview">Chart</div>,
}));
vi.mock("@/components/chart-builder/wizard/PreviewContext", () => ({
  usePreview: () => ({ status: "ready", result: null, graphDivRef: { current: null } }),
}));

import { ChartConfigProvider, useChartConfig } from "@/components/chart-builder/chartConfigStore";
import EditPreview from "@/components/chart-builder/wizard/EditPreview";
import { EditDataProvider, useEditData } from "@/components/chart-builder/wizard/EditDataContext";
import { BYOD_SCHEMA } from "@/lib/visualization/moduleRegistry";
import { roleLabel } from "@/lib/visualization/roleLabels";
import { fixtureTable, importInline } from "@/tests/fixtures/byod-shapes/helpers";

function Probe() {
  const { config } = useChartConfig();
  return (
    <pre data-testid="state">
      {JSON.stringify({ chartType: config.presentation.chartType, rows: config.question.dataset.inline.rows })}
    </pre>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent);

function FixLink() {
  const edit = useEditData();
  return <button type="button" onClick={() => edit.openData({ column: "Job" })}>Fix Job</button>;
}

async function mount() {
  const table = await fixtureTable("two-labels-shares");
  render(
    <ChartConfigProvider schema={BYOD_SCHEMA} initialConfig={importInline(table)} autoBind>
      <EditDataProvider>
        <FixLink />
        <EditPreview />
        <Probe />
      </EditDataProvider>
    </ChartConfigProvider>,
  );
}

it("switches between the chart and its editable data", async () => {
  const user = userEvent.setup();
  await mount();
  const toggle = screen.getByRole("group", { name: "Chart or data view" });
  expect(screen.getByTestId("chart-preview")).toBeInTheDocument();
  expect(within(toggle).getByRole("button", { name: "View Chart" })).toHaveAttribute("aria-pressed", "true");
  await user.click(within(toggle).getByRole("button", { name: "Edit Data" }));
  // The hidden chart stays mounted so the footer can export it from Edit Data.
  expect(screen.getByTestId("chart-preview").closest('[aria-hidden="true"]')).toBeInTheDocument();
  expect(screen.getByRole("grid", { name: "Editable imported data" })).toBeInTheDocument();
  await user.click(within(toggle).getByRole("button", { name: "View Chart" }));
  expect(screen.getByTestId("chart-preview")).toBeInTheDocument();
  expect(screen.getByTestId("chart-preview").closest('[aria-hidden="true"]')).toBeNull();
});

it("offers the topic editor's image and data exports beside the view switcher", async () => {
  const user = userEvent.setup();
  await mount();
  expect(screen.getByRole("button", { name: "Export image", exact: true })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Export data", exact: true })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Edit Data", exact: true }));
  expect(screen.getByRole("button", { name: "Export image", exact: true })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Export data", exact: true }));
  expect(screen.getAllByRole("menuitem", { name: "CSV", exact: true }).length).toBeGreaterThan(0);
});

it("shows what the chart uses each column for", async () => {
  const user = userEvent.setup();
  await mount();
  await user.click(screen.getByRole("button", { name: "Edit Data" }));
  expect(screen.getByText(roleLabel("category", "bar"))).toBeInTheDocument();
});

it("sends data edits to the chart without changing its type", async () => {
  const user = userEvent.setup();
  await mount();
  await user.click(screen.getByRole("button", { name: "Edit Data" }));
  const target = screen.getAllByRole("gridcell").find((node) => node.textContent === "Britain");
  await user.click(target);
  const bar = screen.getByRole("textbox", { name: "Cell B2" });
  await user.clear(bar);
  await user.type(bar, "UK{Enter}");
  expect(state().rows[0][1]).toBe("UK");
  expect(state().chartType).toBe("bar");
});

it("opens the data at a named column from a Fix in data link", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Fix Job" }));
  expect(await screen.findByRole("textbox", { name: "Cell A2" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit Data" })).toHaveAttribute("aria-pressed", "true");
});
