/**
 * Tests for lib/logs/editorLog.js — bounded in-memory activity ring for the
 * graph editor's code mode.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearEditorLog,
  logEditorEvent,
  MAX_ENTRIES,
  toDownloadText,
  useEditorLog,
} from "@/lib/logs/editorLog";

beforeEach(() => {
  clearEditorLog();
});

describe("logEditorEvent / useEditorLog", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useEditorLog());
    expect(result.current.entries).toEqual([]);
  });

  it("appends entries, newest first", () => {
    const { result } = renderHook(() => useEditorLog());
    act(() => {
      logEditorEvent({ severity: "info", code: "A", summary: "first" });
      logEditorEvent({ severity: "warn", code: "B", summary: "second" });
    });
    expect(result.current.entries.map((entry) => entry.code)).toEqual(["B", "A"]);
  });

  it("caps the ring at MAX_ENTRIES, evicting the oldest", () => {
    act(() => {
      for (let i = 0; i < MAX_ENTRIES + 5; i++) {
        logEditorEvent({ severity: "info", code: `E${i}`, summary: `entry ${i}` });
      }
    });
    const { result } = renderHook(() => useEditorLog());
    expect(result.current.entries).toHaveLength(MAX_ENTRIES);
    // Newest first: the very last logged entry leads, and the oldest 5 evicted.
    expect(result.current.entries[0].code).toBe(`E${MAX_ENTRIES + 4}`);
    expect(result.current.entries.some((entry) => entry.code === "E0")).toBe(false);
  });

  it("clear empties the ring", () => {
    const { result } = renderHook(() => useEditorLog());
    act(() => {
      logEditorEvent({ severity: "error", code: "X", summary: "boom" });
    });
    expect(result.current.entries).toHaveLength(1);
    act(() => {
      result.current.clear();
    });
    expect(result.current.entries).toEqual([]);
  });
});

describe("toDownloadText", () => {
  it("includes the code and summary for each entry", () => {
    const text = toDownloadText([
      {
        severity: "error",
        code: "OOPS",
        summary: "Something failed.",
        at: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(text).toContain("OOPS");
    expect(text).toContain("Something failed.");
  });

  it("reports no activity for an empty list", () => {
    expect(toDownloadText([])).toBe("No activity recorded.");
  });
});
