/** Phase 2: saved/local/workspace/deep-link hydration is shell-independent. */

import React from "react";

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  getView: vi.fn(),
  deserialize: vi.fn(),
  deserializeWorkspace: vi.fn(),
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({ dispatch: state.dispatch, schema: { id: "widgets" } }),
}));
vi.mock("@/components/chart-builder/savedViews", () => ({
  getView: state.getView,
  deserialize: state.deserialize,
  deserializeWorkspace: state.deserializeWorkspace,
}));

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

  it("does not overwrite a built-in view already used as initial config", () => {
    render(<ViewHydrator viewId="built-in" hasBuiltInView />);
    expect(state.dispatch).not.toHaveBeenCalled();
  });
});
