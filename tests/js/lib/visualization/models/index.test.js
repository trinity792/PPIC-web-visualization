import { expect, it } from "vitest";
import { buildChartModel } from "@/lib/visualization/models";
import { input, VISX_TYPES } from "@/tests/fixtures/visualization-v3/renderer";
it.each(VISX_TYPES)("builds a model for %s", chartType => expect(buildChartModel(input(chartType))).toMatchObject({ chartType }));
it("reports an unregistered chart with the existing No adapter error", () => expect(() => buildChartModel(input("unknown"))).toThrow("No observation adapter is registered for unknown."));
