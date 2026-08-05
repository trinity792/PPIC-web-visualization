/** Phase 3 named-export contract for independently placed export buttons. */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exportImage = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const renderImagePreview = vi.hoisted(() =>
  vi.fn().mockResolvedValue("data:image/png;base64,cHJldmlldw=="),
);
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
  renderImagePreview,
  renderCombinedImagePreview: vi.fn(),
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
    for (const mock of [exportImage, renderImagePreview, ...Object.values(tables)]) {
      mock.mockClear();
    }
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
    await screen.findByRole("img", { name: /export preview/i });
    await user.click(screen.getByRole("button", { name: /download png/i }));
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

  // A module workbench now opens on a skeleton with no loaded result, so "the
  // preview is not ready" must not stand between the reader and the dataset.
  describe("with no chart configured", () => {
    it("keeps the Export data trigger open and exports the original dataset", async () => {
      const user = userEvent.setup();
      renderButton(<ExportDataButton loaded={null} disabled />);

      const trigger = screen.getByRole("button", { name: /export data/i });
      expect(trigger).toBeEnabled();

      await user.click(trigger);
      const fullDatasetGroup = screen.getByText(/entire cleaned dataset/i).parentElement;
      await user.click(fullDatasetGroup.querySelector('[role="menuitem"]'));
      expect(tables.originalTable).toHaveBeenCalledWith(
        expect.objectContaining({ chartType: "line" }),
        null,
      );
      expect(tables.downloadBlob).toHaveBeenCalled();
    });

    it("still withholds the as-displayed items, which need a rendered chart", async () => {
      const user = userEvent.setup();
      renderButton(<ExportDataButton loaded={null} disabled />);

      await user.click(screen.getByRole("button", { name: /export data/i }));
      const displayedGroup = screen.getByText(/as displayed/i).parentElement;
      for (const item of displayedGroup.querySelectorAll('[role="menuitem"]')) {
        expect(item).toHaveAttribute("aria-disabled", "true");
      }
      expect(tables.displayTable).not.toHaveBeenCalled();
    });

    it("still greys out Export chart, which has no figure to write", () => {
      renderButton(<ExportChartButton graphDivRef={{ current: null }} loaded={null} disabled />);
      expect(screen.getByRole("button", { name: /export (chart|image)/i })).toBeDisabled();
    });

    it("closes the trigger only when neither source has anything to write", () => {
      tables.originalTable.mockReturnValue(null);
      renderButton(<ExportDataButton loaded={null} disabled />);
      expect(screen.getByRole("button", { name: /export data/i })).toBeDisabled();
    });
  });
});
