/** Test setup only: no inferred expectations or replacement feature logic. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePaste } from "@/lib/tabular/parseTable";
import { createChartConfig, reduceChartConfig } from "@/components/chart-builder/chartConfigStore";
import { getDefaultQuestion } from "@/lib/visualization/defaultQuestions";
import { BYOD_SCHEMA } from "@/lib/visualization/moduleRegistry";
import { withInlineBindings } from "@/lib/visualization/inlineQuestion";
import { executeInlineQuestion } from "@/lib/tabular/toObservations";
import { previewInput } from "@/lib/visualization/previewInput";

export const fixtureText = id => readFileSync(path.resolve("tests/fixtures/byod-shapes", `${id}.txt`), "utf8");
export const fixtureTable = async id => (await parsePaste(fixtureText(id))).value;
export const dispatchInline = (config, action) => reduceChartConfig(config, action, BYOD_SCHEMA, { autoBind: true });
export const freshInline = () => createChartConfig(BYOD_SCHEMA, getDefaultQuestion("byod"), { autoBind: true });
export const importInline = table => dispatchInline(freshInline(), { type: "SET_DATA_SOURCE", source: "inline", inline: table, defaultChart: true });
export function boundInline(table, chartType, bindings, appearance = {}) {
  const spec = freshInline();
  return withInlineBindings({ ...spec, presentation: { ...spec.presentation, chartType, appearance },
    question: { ...spec.question, time: { contract: chartType === "line" ? "range" : "none" }, calculation: { id: "actual", params: {} } },
  }, table, chartType, bindings);
}
export function modelInput(spec, result = executeInlineQuestion(spec)) {
  return previewInput(spec, BYOD_SCHEMA, result);
}
