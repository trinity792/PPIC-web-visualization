/**
 * Vitest configuration for the JavaScript test suite (tests/js/**).
 *
 * Mirrors the backend pytest conventions: tests mirror the source tree under
 * tests/js/, no real network calls (see tests/js/setup.js), and the `@/` path
 * alias matches jsconfig.json.
 *
 * Two environment quirks are handled explicitly:
 *   - Components write JSX inside .js files, so the oxc transformer (Vitest 4 /
 *     rolldown-vite; esbuild options are ignored) is told to parse .js as JSX.
 *   - jsdom needs a real URL, otherwise its origin is opaque and
 *     window.localStorage is a non-functional stub (savedViews tests need it).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformWithOxc } from "vite";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Project components write JSX inside .js files, which Vite only transforms
 * for .jsx. This pre-plugin runs the oxc transformer with the JSX language
 * forced for first-party .js modules (node_modules excluded), before Vite's
 * import analysis sees them. (@vitejs/plugin-react is deliberately not used:
 * it only adds dev-time fast refresh and overrides this setting.)
 */
function jsxInJs() {
  return {
    name: "ppic:jsx-in-js",
    enforce: "pre",
    async transform(code, id) {
      if (!id.endsWith(".js") || id.includes("/node_modules/")) return null;
      if (!code.includes("<")) return null;
      return transformWithOxc(code, id, { lang: "jsx", jsx: { runtime: "automatic" } });
    },
  };
}

export default defineConfig({
  plugins: [jsxInJs()],
  resolve: {
    alias: { "@": rootDir },
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
    include: ["tests/js/**/*.test.{js,jsx}"],
    setupFiles: ["tests/js/setup.js"],
    globals: false,
  },
});
