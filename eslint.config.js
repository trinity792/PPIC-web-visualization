import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs,jsx}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
  pluginReact.configs.flat.recommended,
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    // Read the installed React version from react/package.json at lint time.
    // Without this, eslint-plugin-react warns on every run and falls back to
    // ULTIMATE_LATEST_SEMVER (999.999.999), so the five rules that branch on the
    // version (no-deprecated, no-string-refs, no-render-return-value,
    // no-unknown-property, display-name) would lint against a React that is not
    // installed. "detect" tracks the dependency and cannot drift; a literal
    // version string would go stale at the next upgrade.
    settings: { react: { version: "detect" } },
    rules: {
      // Props are documented in each component's JSDoc header (see
      // docs/agent/frontend-conventions.md), not with runtime PropTypes. The
      // rule was previously opted out of file by file, which meant a new file
      // that forgot the pragma failed lint for a convention the project does
      // not follow. Turned off once here instead.
      "react/prop-types": "off",
    },
  },
]);
