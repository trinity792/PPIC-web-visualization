/* global process */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listSettings } from "../lib/visualization/settingsRegistry.js";

export const GENERATED_START = "<!-- settings-reference:start -->";
export const GENERATED_END = "<!-- settings-reference:end -->";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const DEFAULT_DOCUMENT = path.join(
  ROOT,
  "docs/PPIC Summer 2026/specifications/visualization-specification.md",
);

function display(value) {
  if (Array.isArray(value)) return value.join(", ");
  return value === "all" ? "All" : String(value);
}

export function generateFactualRows(settings) {
  return [...settings]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((setting) => ({
      id: setting.id,
      setting: setting.label,
      section: setting.section,
      appliesTo: `Charts: ${display(setting.charts)}; datasets: ${display(setting.datasets)}`,
      values: display(setting.values),
      configKey: setting.configPath,
      consumer: setting.consumer,
      mode: setting.mode,
    }));
}

export function renderReferenceBlock(rows) {
  const header = "| ID | Setting | Section | Mode | Applies to | Values or limits | Config key | Consumer |\n|---|---|---|---|---|---|---|---|";
  return [
    header,
    ...rows.map((row) =>
      `| ${row.id} | ${row.setting} | ${row.section} | ${row.mode} | ${row.appliesTo} | ${row.values} | ${row.configKey} | ${row.consumer} |`,
    ),
  ].join("\n");
}

function bounds(document) {
  const start = document.indexOf(GENERATED_START);
  const end = document.indexOf(GENERATED_END);
  return { start, end };
}

export function writeReferenceBlock(document, block) {
  const { start, end } = bounds(document);
  if (start < 0 || end < 0 || end < start) {
    throw new Error("Settings reference markers are missing or out of order.");
  }
  const before = document.slice(0, start + GENERATED_START.length);
  const after = document.slice(end);
  return `${before}\n${block}\n${after}`;
}

export function checkDocument(document, expectedBlock) {
  const { start, end } = bounds(document);
  if (start < 0 || end < 0 || end < start) {
    return { stale: true, message: "The settings reference marker is missing." };
  }
  const current = document.slice(start + GENERATED_START.length, end).trim();
  const expected = expectedBlock.trim();
  return current === expected
    ? { stale: false, message: "The settings reference is current." }
    : { stale: true, message: `The settings reference is stale. Expected:\n${expected}` };
}

function run(argv = process.argv.slice(2)) {
  const check = argv.includes("--check");
  const explicitPath = argv.find((argument) => !argument.startsWith("--"));
  const documentPath = explicitPath ? path.resolve(explicitPath) : DEFAULT_DOCUMENT;
  const document = fs.readFileSync(documentPath, "utf8");
  const block = renderReferenceBlock(generateFactualRows(listSettings()));

  if (check) {
    const result = checkDocument(document, block);
    if (result.stale) {
      console.error(result.message);
      process.exitCode = 1;
      return;
    }
    console.log(result.message);
    return;
  }

  const next = writeReferenceBlock(document, block);
  if (next !== document) fs.writeFileSync(documentPath, next);
  console.log(
    next === document
      ? "The settings reference is already current."
      : "The settings reference was updated.",
  );
}

if (path.resolve(process.argv[1] || "") === SCRIPT_PATH) run();
