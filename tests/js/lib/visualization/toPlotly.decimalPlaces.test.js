/** Typography's decimal setting reaches hover, ticks, and visible values. */

import { describe, expect, it } from "vitest";

import { toPlotly } from "@/lib/visualization/toPlotly";

describe("decimalPlaces output coverage", () => {
  it("applies the clamped setting to hover, value-axis ticks, and value labels", () => {
    const { data, layout } = toPlotly({
      chartType: "bar",
      bindings: { category: "Location", y: "Rate" },
      series: [
        { Location: "Alameda", Rate: 1.2345 },
        { Location: "Butte", Rate: 2.3456 },
      ],
      field: { kind: "measure", unit: "percent" },
      appearance: { decimalPlaces: 3, showValueLabels: true },
      labels: {},
    });
    expect(layout.yaxis.hoverformat).toBe(",.3f");
    expect(data[0].texttemplate).toContain(",.3f");
    expect(layout.yaxis.tickformat).toBe(",.3f");
  });
});
