/**
 * Tests for components/chart-builder/ExportMenu.js — the two-button export
 * surface: Export image (formats + embed, at a chosen quality) and Export data
 * (chart displayed table / original source table, as CSV or Excel).
 */

import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exportImageMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const exportCombinedImageMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);
const renderImagePreviewMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue("data:image/png;base64,cHJldmlldw=="),
);
const renderCombinedImagePreviewMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue("data:image/png;base64,Y29tYmluZWQ="),
);
const chartDataMocks = vi.hoisted(() => ({
  loadChartExportData: vi.fn(),
}));
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
    { id: "png", label: "PNG", supportsAlpha: true, vector: false, ext: "png" },
    { id: "svg", label: "SVG", supportsAlpha: true, vector: true, ext: "svg" },
    { id: "jpeg", label: "JPG", supportsAlpha: false, vector: false, ext: "jpg" },
    { id: "pdf", label: "PDF", supportsAlpha: false, vector: true, ext: "pdf" },
  ],
  IMAGE_QUALITIES: [
    { id: "max", label: "Maximum", scale: 4, jpegQuality: 1 },
    { id: "standard", label: "Standard", scale: 2, jpegQuality: 0.85 },
  ],
  exportImage: exportImageMock,
  exportCombinedImage: exportCombinedImageMock,
  renderImagePreview: renderImagePreviewMock,
  renderCombinedImagePreview: renderCombinedImagePreviewMock,
}));

vi.mock("@/lib/export/exportTable", () => exportTableMocks);
vi.mock("@/components/chart-builder/chartData", async (importOriginal) => ({
  ...(await importOriginal()),
  loadChartExportData: chartDataMocks.loadChartExportData,
}));

import ExportMenu, { ExportDataButton } from "@/components/chart-builder/ExportMenu";
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
  const graphDiv = {
    id: "graph-div",
    _fullLayout: { width: 960, height: 520 },
  };
  render(
    <ChartConfigProvider schema={schema} initialConfig={initialConfig}>
      <ExportMenu graphDivRef={{ current: graphDiv }} loaded={loadedResult} />
    </ChartConfigProvider>,
  );
  return { graphDiv };
}

// Two-chart workspace passed via the preview props ExportStep supplies.
function renderMultiMenu() {
  const graphDivs = {
    c1: { id: "gd-1", _fullLayout: { width: 600, height: 380 } },
    c2: { id: "gd-2", _fullLayout: { width: 600, height: 380 } },
  };
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
    renderImagePreviewMock.mockClear();
    renderCombinedImagePreviewMock.mockClear();
    for (const fn of Object.values(exportTableMocks)) fn.mockClear();
    chartDataMocks.loadChartExportData.mockReset().mockResolvedValue(loadedResult);
    primeTableMocks();
  });

  it("opens an image preview before exporting the mounted chart", async () => {
    const user = userEvent.setup();
    const { graphDiv } = renderMenu();

    expect(
      screen.queryByRole("radiogroup", { name: /image export quality/i }),
    ).not.toBeInTheDocument();
    expect(renderImagePreviewMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    const preview = await screen.findByRole("img", { name: /export preview/i });

    expect(
      screen.getByRole("radiogroup", { name: /image export quality/i }),
    ).toBeInTheDocument();
    expect(preview).toHaveAttribute("src", expect.stringContaining("image/png"));
    expect(renderImagePreviewMock).toHaveBeenCalledWith(
      graphDiv,
      expect.objectContaining({ scale: 1, width: 960, height: 520 }),
    );
    expect(
      screen.getByRole("button", { name: /match editor dimensions/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(exportImageMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /download png/i }));

    expect(exportImageMock).toHaveBeenCalledWith(
      graphDiv,
      expect.objectContaining({ format: "png" }),
    );
  });

  it("defaults image export to the highest-quality scale", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    await screen.findByRole("img", { name: /export preview/i });
    await user.click(screen.getByRole("button", { name: /download png/i }));

    expect(exportImageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        format: "png",
        scale: 4,
        width: 960,
        height: 520,
      }),
    );
  });

  it("exports at the chosen quality scale when the user lowers it", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    await screen.findByRole("img", { name: /export preview/i });
    await user.click(screen.getByRole("radio", { name: "Standard" }));
    await screen.findByRole("img", { name: /export preview/i });
    expect(screen.getByText(/standard quality downloads at/i)).toHaveTextContent(
      "1920 × 1040 px",
    );
    await user.click(screen.getByRole("button", { name: /download png/i }));

    expect(exportImageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        format: "png",
        scale: 2,
        width: 960,
        height: 520,
      }),
    );
  });

  it("updates the preview for device presets and custom pixel dimensions", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    await screen.findByRole("img", { name: /export preview/i });
    await user.click(
      screen.getByRole("button", {
        name: /phone responsive chart at 390 pixels wide/i,
      }),
    );

    await waitFor(() =>
      expect(renderImagePreviewMock).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ scale: 1, width: 390, height: 520 }),
      ),
    );
    expect(screen.getByText("390 × 520 px chart layout")).toBeInTheDocument();

    const width = screen.getByLabelText(/width \(px\)/i);
    const height = screen.getByLabelText(/height \(px\)/i);
    await user.clear(width);
    await user.type(width, "780");

    await waitFor(() => expect(height).toHaveValue(1040));
    expect(
      screen.getByText(/width and height are linked to preserve/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /unlock aspect ratio/i }));
    await user.clear(width);
    await user.type(width, "1200");
    await user.clear(height);
    await user.type(height, "700");

    await waitFor(() =>
      expect(renderImagePreviewMock).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ scale: 1, width: 1200, height: 700 }),
      ),
    );
    expect(
      await screen.findByText("1200 × 700 px chart layout"),
    ).toBeInTheDocument();
  });

  it("downloads the format selected beside the preview", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    await screen.findByRole("img", { name: /export preview/i });
    await user.click(screen.getByRole("radio", { name: /jpg format/i }));
    await user.click(screen.getByRole("button", { name: /download jpg/i }));

    expect(exportImageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        format: "jpeg",
        filename: "widgets-line.jpg",
      }),
    );
  });

  it("exports the displayed chart table as CSV", async () => {
    const user = userEvent.setup();
    const untruncatedResult = {
      series: [
        ...loadedResult.series,
        { location: "Butte", years: [2020], values: [90] },
      ],
    };
    chartDataMocks.loadChartExportData.mockResolvedValueOnce(untruncatedResult);
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export data/i }));
    // First "CSV" item is under "Chart data (as displayed)".
    await user.click(screen.getAllByRole("menuitem", { name: "CSV" })[0]);

    expect(exportTableMocks.displayTable).toHaveBeenCalledWith(
      expect.objectContaining({ chartType: "line" }),
      untruncatedResult,
    );
    expect(chartDataMocks.loadChartExportData).toHaveBeenCalledWith(
      expect.objectContaining({ chartType: "line" }),
      schema,
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
    await screen.findByRole("img", { name: /export preview/i });
    await user.click(screen.getByRole("button", { name: /embed chart/i }));
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
    await screen.findByRole("img", { name: /export preview/i });
    await user.click(screen.getByRole("button", { name: /embed chart/i }));
    await user.click(screen.getByRole("button", { name: /copy embed code/i }));

    expect(await screen.findByRole("button", { name: /copied!/i })).toBeInTheDocument();
  });

  it("shows a live preview iframe and an open-in-new-tab link for the embed", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    await screen.findByRole("img", { name: /export preview/i });
    await user.click(screen.getByRole("button", { name: /embed chart/i }));

    const preview = screen.getByTitle("Embed preview");
    const src = preview.getAttribute("src");
    expect(src).toContain("embed=1");
    expect(src).toContain("view=");

    const openLink = screen.getByRole("link", { name: /open in new tab/i });
    expect(openLink).toHaveAttribute("href", src);
    expect(openLink).toHaveAttribute("target", "_blank");
  });

  it("returns from embed to the export preview without losing its options", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    await screen.findByRole("img", { name: /export preview/i });
    await user.click(screen.getByRole("radio", { name: /jpg format/i }));
    await user.click(screen.getByRole("radio", { name: "Standard" }));
    await user.click(screen.getByRole("button", { name: /embed chart/i }));

    expect(screen.getByRole("heading", { name: /embed chart/i })).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /back to export options/i }),
    );

    await screen.findByRole("img", { name: /export preview/i });
    expect(screen.getByRole("radio", { name: /jpg format/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Standard" })).toBeChecked();
  });
});

// A schema with an apiPath triggers the full-dataset fetch path (real modules).
const moduleSchema = { ...schema, apiPath: "/api/widgets" };

function renderModuleMenu() {
  render(
    <ChartConfigProvider schema={moduleSchema} initialConfig={initialConfig}>
      <ExportMenu graphDivRef={{ current: { id: "graph-div" } }} loaded={loadedResult} />
    </ChartConfigProvider>,
  );
}

describe("ExportMenu — module full-source export", () => {
  beforeEach(() => {
    exportImageMock.mockClear();
    exportCombinedImageMock.mockClear();
    renderImagePreviewMock.mockClear();
    renderCombinedImagePreviewMock.mockClear();
    for (const fn of Object.values(exportTableMocks)) fn.mockClear();
    chartDataMocks.loadChartExportData.mockReset().mockResolvedValue(loadedResult);
    primeTableMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ view: "table", records: [{ Location: "Alameda", Year: 2020, Value: 100 }] }),
    });
  });

  it("fetches the entire cleaned dataset (full=1) for the original-data export", async () => {
    const user = userEvent.setup();
    renderModuleMenu();

    await user.click(screen.getByRole("button", { name: /export data/i }));
    await user.click(screen.getAllByRole("menuitem", { name: "CSV" })[1]);

    // Full-table URL: ignores the chart's row filters, keeps subset, full=1.
    const url = globalThis.fetch.mock.calls.at(-1)[0];
    expect(url).toContain("/api/widgets?");
    expect(url).toContain("view=table");
    expect(url).toContain("full=1");
    expect(url).toContain("subset=Counties");

    // The fetched records — not the filtered loaded result — build the table.
    expect(exportTableMocks.originalTable).toHaveBeenCalledWith(
      expect.objectContaining({ chartType: "line" }),
      { response: { records: [{ Location: "Alameda", Year: 2020, Value: 100 }] } },
    );
    expect(chartDataMocks.loadChartExportData).not.toHaveBeenCalled();
    expect(exportTableMocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "widgets-original.csv",
    );
  });

  it("exports the dataset from an unarmed workbench, with no loaded chart", async () => {
    const user = userEvent.setup();
    render(
      <ChartConfigProvider schema={moduleSchema} initialConfig={initialConfig}>
        <ExportDataButton loaded={null} disabled />
      </ChartConfigProvider>,
    );

    await user.click(screen.getByRole("button", { name: /export data/i }));
    await user.click(screen.getAllByRole("menuitem", { name: "CSV" })[1]);

    // The request is built from config + schema, so it needs no rendered chart.
    const url = globalThis.fetch.mock.calls.at(-1)[0];
    expect(url).toContain("view=table");
    expect(url).toContain("full=1");
    expect(exportTableMocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "widgets-original.csv",
    );
  });
});

describe("ExportMenu — multi-chart workspace", () => {
  beforeEach(() => {
    exportImageMock.mockClear();
    exportCombinedImageMock.mockClear();
    renderImagePreviewMock.mockClear();
    renderCombinedImagePreviewMock.mockClear();
    for (const fn of Object.values(exportTableMocks)) fn.mockClear();
    chartDataMocks.loadChartExportData.mockReset().mockResolvedValue(loadedResult);
    primeTableMocks();
  });

  it("combines all charts into one image via exportCombinedImage", async () => {
    const user = userEvent.setup();
    const { graphDivs } = renderMultiMenu();

    await user.click(screen.getByRole("button", { name: /export image/i }));
    await screen.findByRole("img", { name: /export preview/i });

    expect(renderCombinedImagePreviewMock).toHaveBeenCalledWith(
      [graphDivs.c1, graphDivs.c2],
      expect.objectContaining({
        layout: "1x1",
        responsive: false,
        scale: 1,
        width: 600,
        height: 760,
      }),
    );

    await user.click(screen.getByRole("button", { name: /download png/i }));

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
