import { expect, it } from "vitest";
import { periodTicks } from "@/lib/visualization/chartLayout/axisScale";
// 2026-09-29: labels stepped from the first year and forced the last one, so
// 1991-2026 read 1991, 1997, ..., 2015, 2026 (an 11-year jump). Owner then
// asked that the latest year (2026) always be labeled: steps now count back
// from the last period, which keeps every gap equal.
const years = (from, to, by = 1) => Array.from({ length: Math.floor((to - from) / by) + 1 }, (_, i) => from + i * by);
it("labels the latest year and steps back from it evenly", () => {
  // 700px fits 10 labels: every 5 years back from 2026.
  expect(periodTicks(years(1991, 2026), { width: 700 })).toEqual([1991, 1996, 2001, 2006, 2011, 2016, 2021, 2026]);
});
it("always labels the latest period", () => {
  for (const width of [330, 650, 950, 1300]) expect(periodTicks(years(1991, 2026), { width }).at(-1)).toBe(2026);
  expect(periodTicks(years(1990, 2023), { width: 700 }).at(-1)).toBe(2023);
});
it("keeps every gap between labels the same", () => {
  for (const width of [330, 650, 950, 1300]) {
    const ticks = periodTicks(years(1990, 2023), { width });
    const gaps = ticks.slice(1).map((t, i) => t - ticks[i]);
    expect(new Set(gaps).size).toBe(1);
  }
});
it("uses a wider step at the guide's smallest width", () => {
  // 330px fits 4 labels: every 10 years back from 2026.
  expect(periodTicks(years(1991, 2026), { width: 330 })).toEqual([1996, 2006, 2016, 2026]);
});
it("never labels finer than the data's own spacing", () => {
  expect(periodTicks([2020, 2025, 2030], { width: 950 })).toEqual([2020, 2025, 2030]);
});
it("uses a saved tick increment, counting back from the latest period", () => {
  expect(periodTicks(years(1991, 2026), { width: 950, increment: 10 })).toEqual([1996, 2006, 2016, 2026]);
});
// 210px fits 3 labels: every 2nd of 5 periods, back from the last.
it("labels every Nth period when periods are not numbers", () => {
  expect(periodTicks(["2019-20", "2020-21", "2021-22", "2022-23", "2023-24"], { width: 210 })).toEqual(["2019-20", "2021-22", "2023-24"]);
});
it("handles one period", () => expect(periodTicks([2020], { width: 950 })).toEqual([2020]));
