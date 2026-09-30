import { expect, it } from "vitest";
import { dashedSegments } from "@/lib/visualization/chartLayout/dashedRange";
const periods = [2020, 2025, 2026, 2030];
it("draws nothing dashed when no range is set", () => expect(dashedSegments(periods)).toEqual([false, false, false]));
it("dashes segments whose ends are both inside the range", () => expect(dashedSegments(periods, { from: 2025, to: 2030, label: "Projected" })).toEqual([false, true, true]));
it("leaves the segment into the range solid", () => expect(dashedSegments(periods, { from: 2026, to: 2030 })).toEqual([false, false, true]));
it("compares periods by order, not text", () => expect(dashedSegments(["Wave 2", "Wave 10", "Wave 3", "Wave 1"], { from: "Wave 10", to: "Wave 1" })).toEqual([false, true, true]));
it("ignores a range whose periods are not in the data", () => expect(dashedSegments(periods, { from: 2027, to: 2030 })).toEqual([false, false, false]));
it("does not dash outside a bounded range", () => expect(dashedSegments(periods, { from: 2025, to: 2026 })).toEqual([false, true, false]));
