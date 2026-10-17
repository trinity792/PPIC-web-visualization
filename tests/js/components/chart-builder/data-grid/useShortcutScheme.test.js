import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { isMac, useShortcutScheme } from "@/components/chart-builder/data-grid/useShortcutScheme";

afterEach(() => vi.restoreAllMocks());
const key = "visualizationTool.gridShortcutScheme";

it("defaults to Sheets and remembers a change", () => {
  const first = renderHook(() => useShortcutScheme());
  expect(first.result.current[0]).toBe("sheets");
  act(() => first.result.current[1]("excel"));
  expect(first.result.current[0]).toBe("excel");
  expect(localStorage.getItem(key)).toBe("excel");
  first.unmount();
  const second = renderHook(() => useShortcutScheme());
  expect(second.result.current[0]).toBe("excel");
});

it("falls back to Sheets when storage throws", () => {
  vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
  vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
  const { result } = renderHook(() => useShortcutScheme());
  expect(result.current[0]).toBe("sheets");
  expect(() => act(() => result.current[1]("excel"))).not.toThrow();
});

it("ignores an unknown stored scheme", () => {
  localStorage.setItem(key, "old-scheme");
  expect(renderHook(() => useShortcutScheme()).result.current[0]).toBe("sheets");
});

it("detects the platform from userAgentData before navigator.platform", () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  const previous = Object.getOwnPropertyDescriptor(navigator, "userAgentData");
  Object.defineProperty(navigator, "userAgentData", { configurable: true, value: { platform: "Windows" } });
  try {
    expect(isMac()).toBe(false);
    Object.defineProperty(navigator, "userAgentData", { configurable: true, value: undefined });
    expect(isMac()).toBe(true);
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    expect(isMac()).toBe(false);
  } finally {
    if (previous) Object.defineProperty(navigator, "userAgentData", previous);
    else delete navigator.userAgentData;
  }
});
