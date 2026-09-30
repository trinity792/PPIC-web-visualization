import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { config, schema } from "@/tests/fixtures/visualization-v3/renderer";
const mocks = vi.hoisted(() => ({ copyText: vi.fn().mockResolvedValue(undefined), preview: vi.fn().mockResolvedValue("data:image/png;base64,cHJldmlldw==") }));
vi.mock("@/lib/export/exportImage", async original => ({ ...(await original()), renderImagePreview: mocks.preview, renderCombinedImagePreview: mocks.preview }));
vi.mock("@/lib/export/exportTable", async original => ({ ...(await original()), copyText: mocks.copyText }));
import { ChartConfigProvider } from "@/components/chart-builder/chartConfigStore";
import ExportMenu from "@/components/chart-builder/ExportMenu";
async function open() {
  const graphDiv = { _fullLayout: { width: 650, height: 520 } };
  render(<ChartConfigProvider schema={schema} initialConfig={config()}><ExportMenu graphDivRef={{ current: graphDiv }} loaded={{ observations: [] }} /></ChartConfigProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /export image/i }));
  await screen.findByRole("img", { name: /export preview/i });
  return user;
}
afterEach(() => { window.history.replaceState({}, "", "/"); mocks.copyText.mockClear(); mocks.preview.mockClear(); });

it.each(["visx", "plotly"])("embed code never includes a renderer value: %s", async renderer => {
  window.history.replaceState({}, "", `/?renderer=${renderer}`);
  const user = await open();
  await user.click(screen.getByRole("button", { name: /embed chart/i }));
  await user.click(screen.getByRole("button", { name: /copy embed code/i }));
  const code = mocks.copyText.mock.calls.at(-1)[0];
  const frame = new DOMParser().parseFromString(code, "text/html").querySelector("iframe");
  const url = new URL(frame.getAttribute("src"));
  expect(url.searchParams.has("renderer")).toBe(false);
  expect(url.searchParams.get("view")).not.toContain('"renderer"');
  expect(screen.getByTitle("Embed preview").getAttribute("src")).not.toContain("renderer");
});
it("embed height fits a chart with a source box", async () => {
  const user = await open();
  await user.click(screen.getByRole("button", { name: /embed chart/i }));
  await user.click(screen.getByRole("button", { name: /copy embed code/i }));
  const code = mocks.copyText.mock.calls.at(-1)[0];
  const height = Number(code.match(/height="(\d+)"/)[1]);
  // Current 520px drawing + 48px separation + two 11px source/notes lines.
  // Browser coverage below also checks the frame's actual bottom edge.
  expect(height).toBeGreaterThanOrEqual(590);
});
