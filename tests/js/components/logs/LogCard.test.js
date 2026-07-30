/**
 * Tests for components/logs/LogCard.js — the non-technical run card.
 * Verifies that every card (success / recovered / failed) carries a
 * "Show technical details" toggle that reveals the complete record: Result,
 * Flags, and the full raw record for a clean run, and the error block for a
 * failure.
 */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LogCard from "@/components/logs/LogCard";

const SUCCESS_ENTRY = {
  id: "components-of-change-2026-07-13T12:16:06-07:00",
  module: "components-of-change",
  moduleLabel: "Components of Change",
  severity: "success",
  timestamp: "2026-07-13T12:16:06-07:00",
  phase: { index: 5, total: 5, name: "Phase 5" },
  summary: "Components of Change run completed",
  result: { row_count: 4023, year_range: [1991, 2025], new_census_data_found: false },
  flags: { dof_failed: false, census_failed: false },
  error: null,
};

const ERROR_ENTRY = {
  ...SUCCESS_ENTRY,
  id: "components-of-change-error",
  severity: "error",
  result: null,
  flags: {},
  error: {
    type: "ValueError",
    message: "Census data contains duplicate values",
    file: "census_cleaner.py",
    function: "reshape_census_wide_to_long",
    line: 55,
    traceback: "Traceback (most recent call last): ...",
  },
};

const REVISION_ENTRY = {
  ...SUCCESS_ENTRY,
  id: "components-of-change-revisions",
  result: {
    row_count: 4023,
    revisions: {
      DoF: {
        added_periods: [2024],
        changed_periods: [2023],
        removed_periods: [],
        added_keys: 1,
        removed_keys: 0,
        changed_cells: 1,
        truncated: false,
        sample: [
          { key: "Fresno County|2023|DoF", column: "Births", old: 12400.0, new: 12180.0 },
        ],
      },
    },
  },
};

describe("LogCard revisions", () => {
  it("surfaces restated values on the card face without opening the disclosure", () => {
    render(<LogCard entry={REVISION_ENTRY} mode="nontechnical" />);

    expect(screen.getByText("Revised")).toBeTruthy();
    expect(
      screen.getByText("1 previously published value restated in 2023.")
    ).toBeTruthy();
  });

  it("renders the diff as a table rather than a JSON blob", () => {
    render(<LogCard entry={REVISION_ENTRY} mode="nontechnical" />);

    fireEvent.click(screen.getByText("Show technical details"));

    expect(screen.getByText("Revisions")).toBeTruthy();
    expect(screen.getByText("DoF")).toBeTruthy();
    expect(screen.getByText("1 rows added · 1 values restated")).toBeTruthy();
    // The sample lands in real table cells, not a stringified object.
    expect(screen.getByText("Fresno County|2023|DoF")).toBeTruthy();
    expect(screen.getByText("Births")).toBeTruthy();
    expect(screen.getByText("12400")).toBeTruthy();
    expect(screen.getByText("12180")).toBeTruthy();
  });

  it("omits the Revised row when a run only added new periods", () => {
    const additionsOnly = {
      ...REVISION_ENTRY,
      result: {
        row_count: 4023,
        revisions: {
          DoF: {
            ...REVISION_ENTRY.result.revisions.DoF,
            changed_cells: 0,
            changed_periods: [],
            sample: [],
          },
        },
      },
    };
    render(<LogCard entry={additionsOnly} mode="nontechnical" />);

    expect(screen.queryByText("Revised")).toBeNull();
  });

  it("leaves cards without revisions untouched", () => {
    render(<LogCard entry={SUCCESS_ENTRY} mode="nontechnical" />);

    fireEvent.click(screen.getByText("Show technical details"));

    expect(screen.queryByText("Revisions")).toBeNull();
    expect(screen.queryByText("Revised")).toBeNull();
  });
});

describe("LogCard technical-details toggle", () => {
  it("shows the toggle on a success card and reveals Result, Flags, and the raw record", () => {
    render(<LogCard entry={SUCCESS_ENTRY} mode="nontechnical" />);

    const toggle = screen.getByText("Show technical details");
    expect(toggle).toBeTruthy();

    fireEvent.click(toggle);

    // "Flags" and "Raw record" are unique to the disclosure ("Result" also appears
    // as a card-face row label, so it is intentionally not asserted here).
    expect(screen.getByText("Flags")).toBeTruthy();
    expect(screen.getByText("Raw record")).toBeTruthy();
    // The full record is present verbatim, including a field not on the card face.
    expect(screen.getByText(/"row_count": 4023/)).toBeTruthy();
    expect(screen.getByText("Hide technical details")).toBeTruthy();
  });

  it("shows the error block on a failed card", () => {
    render(<LogCard entry={ERROR_ENTRY} mode="nontechnical" />);

    fireEvent.click(screen.getByText("Show technical details"));

    expect(screen.getByText(/ValueError in census_cleaner\.py/)).toBeTruthy();
    expect(screen.getByText("Census data contains duplicate values")).toBeTruthy();
  });
});
