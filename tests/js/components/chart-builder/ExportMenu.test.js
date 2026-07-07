/**
 * Tests for components/chart-builder/ExportMenu.js - Phase 5's single export
 * surface for image, data, and config export.
 */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exportImageMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const exportTableMocks = vi.hoisted(() => ({
  displayTable: vi.fn(),
  toCsv: vi.fn(),
  toXlsxBlob: vi.fn(),
  downloadBlob: vi.fn(),
  copyText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/export/exportImage", () => ({
  IMAGE_FORMATS: [
    { id: "png", label: "PNG", supportsAlpha: true, vector: false },
    { id: "svg", label: "SVG", supportsAlpha: true, vector: true },
    { id: "jpeg", label: "JPG", supportsAlpha: false, vector: false },
    { id: "pdf", label: "PDF", supportsAlpha: false, vector: true },
  ],
  exportImage: exportImageMock,
}));

vi.mock("@/lib/export/exportTable", () => exportTableMocks);

import ExportMenu from "@/components/chart-builder/ExportMenu";
import { ChartConfigProvider } from "@/components/chart-builder/chartConfigStore";

const schema = {
  id: "widgets",
  label: "Widgets",
  sources: null,
  subsets: { Counties: ["County"] },
  fields: {
    Year: { kind: "temporal" },
    Location: { kind: "dimension" },
    "Total Widgets": {
      kind: "measure",
      unit: "count",
      comparisonGroup: "widgets",
      transforms: ["actual", "indexed", "percentChange"],
      chartRoles: ["yMeasure"],
    },
  },
};

const initialConfig = {
  version: 2,
  module: "widgets",
  preset: "trend-over-time",
  chartType: "line",
  data: { source: "module" },
  bindings: { x: "Year", y: "Total Widgets", series: "Location" },
  period: {},
  filters: { subset: "Counties" },
  transform: "actual",
  comparisonMode: "places",
  labels: { title: "Widgets over time" },
  format: {},
  appearance: {},
  annotations: [],
  layers: [],
  referenceLines: [],
  tier: "moderate",
};

const loadedResult = {
  series: [{ location: "Alameda", years: [2020], values: [100] }],
};

function renderMenu() {
  const graphDiv = { id: "graph-div" };
  render(
    <ChartConfigProvider schema={schema} initialConfig={initialConfig}>
      <ExportMenu graphDivRef={{ current: graphDiv }} loaded={loadedResult} />
    </ChartConfigProvider>,
  );
  return { graphDiv };
}

describe("ExportMenu", () => {
  beforeEach(() => {
    exportImageMock.mockClear();
    for (const fn of Object.values(exportTableMocks)) fn.mockClear();
    exportTableMocks.displayTable.mockReturnValue({
      filename: "widgets-line.csv",
      columns: [{ name: "Location" }, { name: "Year" }, { name: "Total Widgets" }],
      rows: [["Alameda", 2020, 100]],
    });
    exportTableMocks.toCsv.mockReturnValue(
      "Location,Year,Total Widgets\r\nAlameda,2020,100\r\n",
    );
    exportTableMocks.toXlsxBlob.mockResolvedValue(
      new Blob(["xlsx"], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
  });

  it("exports the mounted chart as an image through exportImage", async () => {
    const user = userEvent.setup();
    const { graphDiv } = renderMenu();

    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(screen.getByRole("menuitem", { name: /png/i }));

    expect(exportImageMock).toHaveBeenCalledWith(
      graphDiv,
      expect.objectContaining({ format: "png" }),
    );
  });

  it("exports displayed data as CSV using displayTable's canonical table", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(screen.getByRole("menuitem", { name: /csv/i }));

    expect(exportTableMocks.displayTable).toHaveBeenCalledWith(
      expect.objectContaining({ chartType: "line" }),
      loadedResult,
    );
    expect(exportTableMocks.toCsv).toHaveBeenCalled();
    expect(exportTableMocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "widgets-line.csv",
    );
  });

  it("copies the current config JSON from the same export surface", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(screen.getByRole("menuitem", { name: /copy config/i }));

    expect(exportTableMocks.copyText).toHaveBeenCalledWith(
      expect.stringContaining('"version":2'),
    );
  });
});
