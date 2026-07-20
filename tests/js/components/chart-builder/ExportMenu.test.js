/**
 * Tests for components/chart-builder/ExportMenu.js — the two-button export
 * surface: Export image (formats + embed, at a chosen quality) and Export data
 * (chart displayed table / original source table, as CSV or Excel).
 */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exportImageMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const exportCombinedImageMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);
const exportTableMocks = vi.hoisted(() => ({
  displayTable: vi.fn(),
  originalTable: vi.fn(),
  toCsv: vi.fn(),
  toXlsxBlob: vi.fn(),
  tablesToXlsxBlob: vi.fn(),
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
  IMAGE_QUALITIES: [
    { id: "max", label: "Maximum", scale: 4, jpegQuality: 1 },
    { id: "standard", label: "Standard", scale: 2, jpegQuality: 0.85 },
  ],
  exportImage: exportImageMock,
  exportCombinedImage: exportCombinedImageMock,
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

// Two-chart workspace passed via the preview props ExportStep supplies.
function renderMultiMenu() {
  const graphDivs = { c1: { id: "gd-1" }, c2: { id: "gd-2" } };
  const previews = [
    { id: "c1", name: "Chart 1", config: initialConfig, result: loadedResult },
    { id: "c2", name: "Trend", config: initialConfig, result: loadedResult },
  ];
  render(
    <ChartConfigProvider schema={schema} initialConfig={initialConfig}>
      <ExportMenu
        graphDivRef={{ current: graphDivs.c1 }}
        loaded={loadedResult}
        previews={previews}
        graphDivRefs={{ current: graphDivs }}
      />
    </ChartConfigProvider>,
  );
  return { graphDivs, previews };
}

function primeTableMocks() {
  exportTableMocks.displayTable.mockReturnValue({
    filename: "widgets-line.csv",
    columns: [{ name: "Location" }, { name: "Value" }],
    rows: [["Alameda", 100]],
  });
  exportTableMocks.originalTable.mockReturnValue({
    filename: "original-data.csv",
    columns: [{ name: "Location" }, { name: "Year" }, { name: "Value" }],
    rows: [["Alameda", 2020, 100]],
  });
  exportTableMocks.toCsv.mockReturnValue("Location,Value\r\nAlameda,100\r\n");
  exportTableMocks.toXlsxBlob.mockResolvedValue(
    new Blob(["xlsx"], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  exportTableMocks.tablesToXlsxBlob.mockResolvedValue(
    new Blob(["xlsx"], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
}

describe("ExportMenu", () => {
  beforeEach(() => {
    exportImageMock.mockClear();
    exportCombinedImageMock.mockClear();
    for (const fn of Object.values(exportTableMocks)) fn.mockClear();
    primeTableMocks();
  });

  it("exports the mounted chart as an image through exportImage", async () => {
    const user = userEvent.setup();
    const { graphDiv } = renderMenu();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    await user.click(screen.getByRole("menuitem", { name: /png/i }));

    expect(exportImageMock).toHaveBeenCalledWith(
      graphDiv,
      expect.objectContaining({ format: "png" }),
    );
  });

  it("defaults image export to the highest-quality scale", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    await user.click(screen.getByRole("menuitem", { name: /png/i }));

    expect(exportImageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ format: "png", scale: 4 }),
    );
  });

  it("exports at the chosen quality scale when the user lowers it", async () => {
    const user = userEvent.setup();
    renderMenu();

    // The quality control sits above the export buttons, not inside a menu.
    await user.click(screen.getByText("Standard"));
    await user.click(screen.getByRole("button", { name: /export image/i }));
    await user.click(screen.getByRole("menuitem", { name: /png/i }));

    expect(exportImageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ format: "png", scale: 2 }),
    );
  });

  it("exports the displayed chart table as CSV", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export data/i }));
    // First "CSV" item is under "Chart data (as displayed)".
    await user.click(screen.getAllByRole("menuitem", { name: "CSV" })[0]);

    expect(exportTableMocks.displayTable).toHaveBeenCalledWith(
      expect.objectContaining({ chartType: "line" }),
      loadedResult,
    );
    expect(exportTableMocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "widgets-line.csv",
    );
  });

  it("exports the original source table as CSV", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export data/i }));
    // Second "CSV" item is under "Original data (full source)".
    await user.click(screen.getAllByRole("menuitem", { name: "CSV" })[1]);

    expect(exportTableMocks.originalTable).toHaveBeenCalledWith(
      expect.objectContaining({ chartType: "line" }),
      loadedResult,
    );
    expect(exportTableMocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "widgets-original.csv",
    );
  });

  it("disables original-data export when no richer source table exists", async () => {
    const user = userEvent.setup();
    exportTableMocks.originalTable.mockReturnValue(null);
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export data/i }));
    const originalCsv = screen.getAllByRole("menuitem", { name: "CSV" })[1];
    expect(originalCsv).toHaveAttribute("aria-disabled", "true");
  });

  it("embeds the whole workspace as a view payload with an adaptive height", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    await user.click(screen.getByRole("menuitem", { name: /embed code/i }));
    await user.click(screen.getByRole("button", { name: /copy embed code/i }));

    const code = exportTableMocks.copyText.mock.calls.at(-1)[0];
    expect(code).toContain('height="560"'); // 1x1 => one 560px band
    const view = decodeURIComponent(code.match(/view=([^"&]+)/)[1]);
    const payload = JSON.parse(view);
    expect(payload.layout).toBe("1x1");
    expect(payload.charts).toHaveLength(1);
    expect(payload.charts[0].config.chartType).toBe("line");
  });

  it("confirms with 'Copied!' after copying the embed code", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    await user.click(screen.getByRole("menuitem", { name: /embed code/i }));
    await user.click(screen.getByRole("button", { name: /copy embed code/i }));

    expect(await screen.findByRole("button", { name: /copied!/i })).toBeInTheDocument();
  });

  it("shows a live preview iframe and an open-in-new-tab link for the embed", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    await user.click(screen.getByRole("menuitem", { name: /embed code/i }));

    const preview = screen.getByTitle("Embed preview");
    const src = preview.getAttribute("src");
    expect(src).toContain("embed=1");
    expect(src).toContain("view=");

    const openLink = screen.getByRole("link", { name: /open in new tab/i });
    expect(openLink).toHaveAttribute("href", src);
    expect(openLink).toHaveAttribute("target", "_blank");
  });
});

describe("ExportMenu — multi-chart workspace", () => {
  beforeEach(() => {
    exportImageMock.mockClear();
    exportCombinedImageMock.mockClear();
    for (const fn of Object.values(exportTableMocks)) fn.mockClear();
    primeTableMocks();
  });

  it("combines all charts into one image via exportCombinedImage", async () => {
    const user = userEvent.setup();
    const { graphDivs } = renderMultiMenu();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    await user.click(screen.getByRole("menuitem", { name: /png/i }));

    expect(exportImageMock).not.toHaveBeenCalled();
    expect(exportCombinedImageMock).toHaveBeenCalledWith(
      [graphDivs.c1, graphDivs.c2],
      expect.objectContaining({ format: "png", filename: "widgets-charts.png" }),
    );
  });

  it("downloads one CSV per chart with distinct filenames", async () => {
    const user = userEvent.setup();
    renderMultiMenu();

    await user.click(screen.getByRole("button", { name: /export data/i }));
    await user.click(screen.getAllByRole("menuitem", { name: "CSV" })[0]);

    expect(exportTableMocks.downloadBlob).toHaveBeenCalledTimes(2);
    const names = exportTableMocks.downloadBlob.mock.calls.map((call) => call[1]);
    expect(names).toEqual(["widgets-chart-1.csv", "widgets-trend.csv"]);
  });

  it("exports one XLSX workbook with a sheet per chart", async () => {
    const user = userEvent.setup();
    renderMultiMenu();

    await user.click(screen.getByRole("button", { name: /export data/i }));
    await user.click(screen.getAllByRole("menuitem", { name: /excel/i })[0]);

    expect(exportTableMocks.tablesToXlsxBlob).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Chart 1" }),
      expect.objectContaining({ name: "Trend" }),
    ]);
    expect(exportTableMocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "widgets-charts.xlsx",
    );
  });
});
