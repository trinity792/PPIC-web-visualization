/** Workstream F: editor features are declared by each surface. */

import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EditorCapabilitiesProvider,
  NO_CAPABILITIES,
  STANDALONE_CAPABILITIES,
  WORKBENCH_CAPABILITIES,
  useEditorCapabilities,
} from "@/components/chart-builder/editorCapabilities";

const CAPABILITY_KEYS = [
  "presets",
  "savedViews",
  "layers",
  "activityLog",
  "multiChart",
];

// Hand-written, then asserted against the shipped constants below. Passing
// these into the provider and reading them back would only prove the context
// works; the point is that the real sets say what this table says.
const WORKBENCH = {
  presets: false,
  savedViews: false,
  layers: false,
  activityLog: false,
  multiChart: true,
};

const STANDALONE = {
  presets: true,
  savedViews: true,
  layers: true,
  activityLog: true,
  multiChart: true,
};

function Probe() {
  const capabilities = useEditorCapabilities();
  return <output data-testid="capabilities">{JSON.stringify(capabilities)}</output>;
}

function readCapabilities() {
  return JSON.parse(screen.getByTestId("capabilities").textContent);
}

describe("editor capabilities", () => {
  it("reports every capability false outside a provider", () => {
    render(<Probe />);
    expect(readCapabilities()).toEqual(
      Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, false])),
    );
  });

  it("ships the workbench capability set this test declares", () => {
    expect(WORKBENCH_CAPABILITIES).toEqual(WORKBENCH);
  });

  it("ships the standalone capability set this test declares", () => {
    expect(STANDALONE_CAPABILITIES).toEqual(STANDALONE);
  });

  it("reports the workbench capability set through the provider", () => {
    render(
      <EditorCapabilitiesProvider capabilities={WORKBENCH_CAPABILITIES}>
        <Probe />
      </EditorCapabilitiesProvider>,
    );
    expect(readCapabilities()).toEqual(WORKBENCH);
  });

  it("reports the standalone capability set through the provider", () => {
    render(
      <EditorCapabilitiesProvider capabilities={STANDALONE_CAPABILITIES}>
        <Probe />
      </EditorCapabilitiesProvider>,
    );
    expect(readCapabilities()).toEqual(STANDALONE);
  });

  it("covers exactly the declared capability keys", () => {
    // Both sets and the all-off default must have identical key lists, so a
    // capability added for one surface cannot go silently missing on another.
    for (const set of [NO_CAPABILITIES, WORKBENCH_CAPABILITIES, STANDALONE_CAPABILITIES]) {
      expect(Object.keys(set).sort()).toEqual([...CAPABILITY_KEYS].sort());
    }
    expect(Object.keys(WORKBENCH).sort()).toEqual([...CAPABILITY_KEYS].sort());
    expect(Object.keys(STANDALONE).sort()).toEqual([...CAPABILITY_KEYS].sort());
  });
});
