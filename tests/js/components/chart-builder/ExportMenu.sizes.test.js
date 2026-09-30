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

it("offers the three standard widths", async () => {
  const user = await open();
  for(const width of [950,650,330]) {
    const choice = screen.getByRole("button", { name: new RegExp(`\\b${width}\\b`) });
    await user.click(choice);
    expect(screen.getByLabelText(/width \(px\)/i)).toHaveValue(width);
  }
});
