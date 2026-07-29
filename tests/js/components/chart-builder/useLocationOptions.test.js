/** Phase 6 cached/abortable async location-options hook. */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useLocationOptions from "@/components/chart-builder/useLocationOptions";

function response(locations, subset) {
  return {
    ok: true,
    json: async () => ({ locations, subset }),
  };
}

describe("useLocationOptions", () => {
  it("caches success by module and subset across mounts", async () => {
    const fetchMock = vi.fn(async () => response(["Alameda", "Butte"], "Counties"));
    vi.stubGlobal("fetch", fetchMock);
    const schema = { id: "cache-module", apiPath: "/api/cache", subsets: {} };

    const first = renderHook(() => useLocationOptions(schema, { subset: "Counties" }));
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    first.unmount();
    const second = renderHook(() =>
      useLocationOptions(schema, { subset: "Counties" }),
    );
    await waitFor(() => expect(second.result.current.status).toBe("ready"));

    expect(second.result.current.locations).toEqual(["Alameda", "Butte"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts a stale subset request and never applies its result", async () => {
    const pending = [];
    const fetchMock = vi.fn((url, options = {}) => {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      pending.push({ url, signal: options.signal, resolve });
      return promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const schema = { id: "abort-module", apiPath: "/api/abort", subsets: {} };
    const { result, rerender } = renderHook(
      ({ subset }) => useLocationOptions(schema, { subset }),
      { initialProps: { subset: "Counties" } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ subset: "Regions" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(pending[0].signal.aborted).toBe(true);

    pending[1].resolve(response(["Bay Area"], "Regions"));
    await waitFor(() => expect(result.current.locations).toEqual(["Bay Area"]));
    pending[0].resolve(response(["Alameda"], "Counties"));
    await Promise.resolve();
    expect(result.current.locations).toEqual(["Bay Area"]);
  });
});
