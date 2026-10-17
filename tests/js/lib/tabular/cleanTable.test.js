import { describe, expect, it } from "vitest";
// Intentionally isolated: this Stage 2 module does not exist yet.
import { cleanGrid } from "@/lib/tabular/cleanTable";

const clean = [["Region", "Jobs"], ["North", "12"], ["South", "14"]];
describe("dataset range: cleanGrid", () => {
  it("moves a title line above the header into meta.title", () => {
    const result = cleanGrid([["Regional jobs", ""], ...clean]);
    expect(result.rows).toEqual(clean);
    expect(result.meta.title).toBe("Regional jobs");
  });
  it("moves Source and Note lines under the data into meta", () => {
    const result = cleanGrid([...clean, ["Source: Survey", ""], ["Note: Provisional", ""]]);
    expect(result.rows).toEqual(clean);
    expect(result.meta).toMatchObject({ source: "Survey", notes: "Provisional" });
  });
  it("joins a two-row header with merged cells into one name per column", () => {
    const result = cleanGrid([["Region", "Employment", ""], ["Name", "Jobs", "Vacancies"], ["North", "12", "4"]]);
    expect(result.rows).toEqual([["Region - Name", "Employment - Jobs", "Employment - Vacancies"], ["North", "12", "4"]]);
  });
  it("records every change as a finding", () => {
    const raw = [["Regional jobs", ""], ...clean, ["Source: Survey", ""], ["Note: Provisional", ""]];
    const snapshot = structuredClone(raw);
    const result = cleanGrid(raw);
    expect(result.findings).toHaveLength(3);
    for (const finding of result.findings) expect(finding.message).toEqual(expect.any(String));
    expect(result.findings.map(f => f.message).join(" ")).toMatch(/title/i);
    expect(result.findings.map(f => f.message).join(" ")).toMatch(/source/i);
    expect(result.findings.map(f => f.message).join(" ")).toMatch(/note/i);
    expect(raw).toEqual(snapshot);
  });
  it("leaves a clean table untouched", () => {
    expect(cleanGrid(clean)).toMatchObject({ rows: clean, findings: [] });
  });
});
