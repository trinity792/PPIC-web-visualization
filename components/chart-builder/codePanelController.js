/**
 * codePanelController.js — pure controller logic for the code-mode editor
 * panel (CodeEditorPanel.js), kept free of React/CodeMirror so it is
 * testable without jsdom/CodeMirror rendering pain.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   evaluateSpecDraft(text, liveConfig, schema) → { classification, errors, spec }
 *   runCodeDraft(lang, text, liveConfig, schema) → { spec, warnings, errors }
 *
 * Data sources:
 *   - none (pure functions over the live config + editor text)
 */

import { diffSpec, parseSpec } from "@/lib/visualization/chartSpec";
import { parseRCode } from "@/lib/visualization/codebridge/parseRCode";
import { parseStataCode } from "@/lib/visualization/codebridge/parseStataCode";

/**
 * Parse a Spec-tab draft and classify it against the live config: "none" (no
 * change, or the draft doesn't parse), "small" (auto-applies), or
 * "structural" (waits for Run). `errors` are `parseSpec`'s findings (mixed
 * error/warn level, as elsewhere in the editor).
 */
export function evaluateSpecDraft(text, liveConfig, schema) {
  const { spec, errors } = parseSpec(text, schema);
  if (!spec) return { classification: "none", errors, spec: null };
  const { classification } = diffSpec(liveConfig, spec, schema);
  return { classification, errors, spec };
}

/**
 * Run a code-mode draft for the given tab language ("spec" | "r" | "stata"),
 * overlaying onto `liveConfig` as the base spec for the R/Stata parsers.
 * Returns a consistent `{ spec, warnings, errors }` shape across all three
 * languages: `spec` is null whenever any error-level finding exists. Never
 * throws — parse failures come back as `errors`.
 */
export function runCodeDraft(lang, text, liveConfig, schema) {
  if (lang === "r") return parseRCode(text, { schema, baseSpec: liveConfig });
  if (lang === "stata") return parseStataCode(text, { schema, baseSpec: liveConfig });

  const { spec, errors: findings } = parseSpec(text, schema);
  const errors = findings.filter((finding) => finding.level === "error");
  const warnings = findings.filter((finding) => finding.level === "warn");
  return { spec: errors.length ? null : spec, warnings, errors };
}
