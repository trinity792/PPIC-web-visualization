/** Cancelled loads must never replace the active preview or its series metadata. */

import React, { useEffect } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChartConfigProvider, useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { PreviewProvider, usePreview } from "@/components/chart-builder/wizard/PreviewContext";
import { getDefaultQuestion } from "@/lib/visualization/defaultQuestions";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";
import { input } from "@/tests/fixtures/visualization-v3/renderer";

const schema = getModuleSchema("pophousing");

function answer(value, label = "Alameda") {
  return {
    status: "ok",
    observations: [{
      ...input("line").observations[0],
      comparisonId: "cmp_locations",
      comparisonLabel: label,
      measureId: "Total Population",
      measureLabel: "Total population",
      geographyId: "06001",
      geographyLabel: label,
      period: 2020,
      value,
    }],
    comparisons: [{ id: "cmp_locations", label, status: "ok" }],
    periods: [2020],
    issues: [],
  };
}

function mount({ strict = true, honorAbort = true } = {}) {
  const pending = [];
  vi.stubGlobal("fetch", vi.fn((_url, { signal }) => new Promise((resolve, reject) => {
    pending.push({ signal, resolve: (body) => resolve({ ok: true, json: async () => body }), reject });
    if (honorAbort) signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  })));
  const initialConfig = getDefaultQuestion("pophousing");
  initialConfig.question.geography = { subset: "Counties", locations: ["Alameda"] };
  const seen = [];
  const view = renderHook(() => {
    const preview = usePreview();
    const { config } = useChartConfig();
    useEffect(() => {
      seen.push({ status: preview.status, message: preview.notice?.message || preview.error?.message });
    }, [preview.status, preview.notice, preview.error]);
    return { ...preview, config };
  }, {
    reactStrictMode: strict,
    wrapper: ({ children }) => {
      const provider = (
        <ChartConfigProvider schema={schema} initialConfig={initialConfig} autoBind={false}>
          <PreviewProvider>{children}</PreviewProvider>
        </ChartConfigProvider>
      );
      return provider;
    },
  });
  return { ...view, pending, seen };
}

describe("preview cancellation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stays loading through Strict Mode's initial cancellation without flashing a failure", async () => {
    const { result, pending, seen } = mount();
    await act(async () => {});
    expect(pending).toHaveLength(2);
    expect(pending[0].signal.aborted).toBe(true);
    expect(result.current.status).toBe("loading");
    expect(seen.every(({ status }) => status === "loading")).toBe(true);

    await act(async () => pending[1].resolve(answer(20)));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.result.observations[0].value).toBe(20);
    expect(seen.some(({ message }) => /aborted/i.test(message || ""))).toBe(false);
  });

  it.each([false, true])("ignores an obsolete success (active request finishes first: %s)", async (activeFirst) => {
    // A cached/queued response can still resolve even after its signal aborts.
    const { result, pending } = mount({ honorAbort: false });
    expect(pending).toHaveLength(2);
    if (activeFirst) await act(async () => pending[1].resolve(answer(20, "Current county")));
    await act(async () => pending[0].resolve(answer(1, "Obsolete county")));
    if (!activeFirst) {
      expect(result.current.status).toBe("loading");
      expect(result.current.result).toBeNull();
      expect(result.current.config.seriesNames || []).toEqual([]);
      await act(async () => pending[1].resolve(answer(20, "Current county")));
    }
    expect(result.current.status).toBe("ready");
    expect(result.current.result.observations[0].value).toBe(20);
    expect(result.current.config.seriesNames).toEqual(["Current county"]);
  });

  it("ignores an obsolete non-abort error after the active request succeeds", async () => {
    const { result, pending } = mount({ honorAbort: false });
    await act(async () => pending[1].resolve(answer(20)));
    await act(async () => pending[0].reject(new TypeError("Old connection failed")));
    expect(result.current.status).toBe("ready");
    expect(result.current.result.observations[0].value).toBe(20);
    expect(result.current.notice).toBeNull();
  });

  it("still displays a genuine failure from the active request", async () => {
    const { result, pending } = mount({ strict: false });
    await act(async () => pending[0].reject(new TypeError("Network unavailable")));
    expect(result.current.status).toBe("invalid");
    expect(result.current.notice.message).toBe("Network unavailable");
  });
});
