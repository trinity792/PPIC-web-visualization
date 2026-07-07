/**
 * Guard test for the palette single-owner build step: the generated
 * `--ppic-*` ramp in app/globals.css must always match lib/constants.js
 * COLORS. If this fails, someone edited the CSS block by hand — run
 * `npm run build:palette`.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("generate-palette-css --check", () => {
  it("reports the globals.css ramp is in sync with COLORS", () => {
    expect(() =>
      execFileSync("node", [path.join(rootDir, "tools", "generate-palette-css.mjs"), "--check"], {
        cwd: rootDir,
      }),
    ).not.toThrow();
  });
});
