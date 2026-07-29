/** Phase 3 named-export contract for independently placed export buttons. */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exportImage = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const tables = vi.hoisted(() => ({
  displayTable: vi.fn(),
  originalTable: vi.fn(),
  toCsv: vi.fn(() => "Location,Value\r\nAlameda,1\r\n"),
  toXlsxBlob: vi.fn(),
  tablesToXlsxBlob: vi.fn(),
  downloadBlob: vi.fn(),
  copyText: vi.fn(),
}));

vi.mock("@/lib/export/exportImage", () => ({
  IMAGE_FORMATS: [{ id: "png", label: "PNG", supportsAlpha: true, vector: false }],
  IMAGE_QUALITIES: [{ id: "max", label: "Maximum", scale: 4, jpegQuality: 1 }],
  exportImage,
  exportCombinedImage: vi.fn(),
}));
vi.mock("@/lib/export/exportTable", () => tables);

import {
  ExportChartButton,
  ExportDataButton,
} from "@/components/chart-builder/ExportMenu";
import { ChartConfigProvider } from "@/components/chart-builder/chartConfigStore";

const schema = {
  id: "widgets",
  label: "Widgets",
  subsets: { Counties: ["County"] },
  fields: {
    Year: { kind: "temporal", label: "Year" },
    Location: { kind: "dimension", label: "Location" },
    Value: {
      kind: "measure",
      label: "Value",
      transforms: ["actual"],
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
  bindings: { x: "Year", y: "Value", series: "Location" },
  period: {},
  filters: { subset: "Counties", locations: [] },
  transform: "actual",
  comparisonMode: "places",
  labels: {},
  format: {},
  appearance: {},
  annotations: [],
  layers: [],
  referenceLines: [],
};
const loaded = { series: [{ location: "Alameda", years: [2025], values: [1] }] };

function renderButton(button) {
  render(
    <ChartConfigProvider schema={schema} initialConfig={initialConfig}>
      {button}
    </ChartConfigProvider>,
  );
}

describe("ExportMenu named buttons", () => {
  beforeEach(() => {
    for (const mock of [exportImage, ...Object.values(tables)]) mock.mockClear();
    tables.displayTable.mockReturnValue({
      filename: "widgets.csv",
      columns: [{ name: "Location" }],
      rows: [["Alameda"]],
    });
    tables.originalTable.mockReturnValue({
      filename: "widgets-entire.csv",
      columns: [{ name: "Location" }],
      rows: [["Alameda"]],
    });
  });

  it("mounts ExportChartButton alone and invokes the existing image exporter", async () => {
    const user = userEvent.setup();
    const graphDiv = { id: "plot" };
    renderButton(
      <ExportChartButton graphDivRef={{ current: graphDiv }} loaded={loaded} />,
    );

    await user.click(screen.getByRole("button", { name: /export (chart|image)/i }));
    await user.click(screen.getByRole("menuitem", { name: "PNG" }));
    expect(exportImage).toHaveBeenCalledWith(
      graphDiv,
      expect.objectContaining({ format: "png" }),
    );
  });

  it("mounts ExportDataButton alone and invokes displayed-table export", async () => {
    const user = userEvent.setup();
    renderButton(<ExportDataButton loaded={loaded} />);

    await user.click(screen.getByRole("button", { name: /export data/i }));
    await user.click(screen.getAllByRole("menuitem", { name: "CSV" })[0]);
    expect(tables.displayTable).toHaveBeenCalledWith(
      expect.objectContaining({ chartType: "line" }),
      loaded,
    );
  });

  it("retains the entire cleaned dataset export item", async () => {
    const user = userEvent.setup();
    renderButton(<ExportDataButton loaded={loaded} />);
    await user.click(screen.getByRole("button", { name: /export data/i }));

    expect(screen.getByText(/entire cleaned dataset/i)).toBeInTheDocument();
    const fullDatasetGroup = screen.getByText(/entire cleaned dataset/i).parentElement;
    await user.click(fullDatasetGroup.querySelector('[role="menuitem"]'));
    expect(tables.originalTable).toHaveBeenCalledWith(
      expect.objectContaining({ chartType: "line" }),
      loaded,
    );
  });
});
