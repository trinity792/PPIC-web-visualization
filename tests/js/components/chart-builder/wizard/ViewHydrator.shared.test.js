/** Phase 2: saved/local/workspace/deep-link hydration is shell-independent. */

import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  getView: vi.fn(),
  deserialize: vi.fn(),
  deserializeWorkspace: vi.fn(),
  logEditorEvent: vi.fn(),
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({ dispatch: state.dispatch, schema: { id: "widgets" } }),
}));
vi.mock("@/components/chart-builder/savedViews", () => ({
  getView: state.getView,
  deserialize: state.deserialize,
  deserializeWorkspace: state.deserializeWorkspace,
  isRejectedView: (result) => Boolean(result) && result.ok === false,
}));
vi.mock("@/lib/logs/editorLog", () => ({ logEditorEvent: state.logEditorEvent }));

import ViewHydrator from "@/components/chart-builder/wizard/ViewHydrator";

describe("shared ViewHydrator", () => {
  beforeEach(() => {
    for (const mock of Object.values(state)) mock.mockReset();
    state.getView.mockReturnValue(null);
    state.deserializeWorkspace.mockReturnValue(null);
  });

  it("hydrates a locally saved view through LOAD_VIEW", async () => {
    const saved = { module: "widgets", chartType: "bar" };
    state.getView.mockReturnValue(saved);
    render(<ViewHydrator viewId="local-id" hasBuiltInView={false} />);
    await waitFor(() =>
      expect(state.dispatch).toHaveBeenCalledWith({ type: "LOAD_VIEW", config: saved }),
    );
  });

  it("hydrates a serialized workspace through LOAD_WORKSPACE", async () => {
    const workspace = { layout: "1x2", charts: [] };
    state.deserializeWorkspace.mockReturnValue(workspace);
    render(<ViewHydrator viewId={encodeURIComponent("workspace")} />);
    await waitFor(() =>
      expect(state.dispatch).toHaveBeenCalledWith({
        type: "LOAD_WORKSPACE",
        workspace,
      }),
    );
  });

  it("falls back to a serialized single-view deep link", async () => {
    const imported = { module: "widgets", chartType: "line" };
    state.deserialize.mockReturnValue(imported);
    render(<ViewHydrator viewId={encodeURIComponent("single-view")} />);
    await waitFor(() =>
      expect(state.dispatch).toHaveBeenCalledWith({
        type: "LOAD_VIEW",
        config: imported,
      }),
    );
  });

  it("reports a declined view and leaves the default question in place", async () => {
    // A v3 module reader answers an older-format or foreign-dataset view with
    // `{ ok: false, message }`. That is a message for the reader, not a config:
    // dispatching it would hand the store a rejection object to render.
    const declined = { ok: false, reason: "unsupported-version", message: "Too old." };
    state.deserialize.mockReturnValue(declined);
    render(<ViewHydrator viewId={encodeURIComponent("old-link")} />);
    await waitFor(() =>
      expect(state.logEditorEvent).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "error", detail: "Too old." }),
      ),
    );
    expect(state.dispatch).not.toHaveBeenCalled();
    // The module workbench has no activity log, so the reason is shown here.
    expect(screen.getByRole("status")).toHaveTextContent("Too old.");

    state.logEditorEvent.mockClear();
    state.getView.mockReturnValue(declined);
    render(<ViewHydrator viewId="local-old" />);
    await waitFor(() => expect(state.logEditorEvent).toHaveBeenCalled());
    expect(state.dispatch).not.toHaveBeenCalled();
  });

  it("does not overwrite a built-in view already used as initial config", () => {
    render(<ViewHydrator viewId="built-in" hasBuiltInView />);
    expect(state.dispatch).not.toHaveBeenCalled();
  });
});
