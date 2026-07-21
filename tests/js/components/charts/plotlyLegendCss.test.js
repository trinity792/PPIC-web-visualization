import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

describe("Plotly legend CSS", () => {
  it("does not override Plotly's translated marker positions", () => {
    const css = readFileSync(path.join(rootDir, "app", "globals.css"), "utf8");
    expect(css).not.toMatch(
      /\.ppic-plotly-chart\s+\.legend\s+\.legendpoints\s+path\s*\{[^}]*\btransform\s*:/s,
    );
  });
});
