/** Document search uses the curated catalog, including body-only matches. */
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => {
  const files = {
    "population.md": "---\nContent Type: Guide\nStatus: Finalized\ndescription: County forecasts\n---\n# Population guide\nMigration assumptions include cohort survival.",
    "migration.md": "---\nContent Type: Guide\n---\n# Migration methods\nCounty projections.",
    "archive.md": "---\nContent Type: Guide\nStatus: Archive\n---\n# Old migration\nObsolete migration methods.",
    "private.md": "# Private notes\nMigration notes without catalog metadata.",
  };
  return { default: {
    existsSync: () => true,
    readdirSync: () => Object.keys(files).map((name) => ({ name, isDirectory: () => false, isFile: () => true })),
    readFileSync: (filename) => files[path.basename(filename)],
  } };
});

import { searchDocuments } from "@/lib/docs/documents";
import { GET } from "@/app/api/search/documents/route";

describe("document search", () => {
  it("finds body text and summary terms case-insensitively", () => {
    expect(searchDocuments(" COHORT forecasts ")).toEqual([
      { href: "/documents/population", label: "Population guide", summary: "County forecasts", kind: "Document" },
    ]);
  });

  it("prioritizes title matches and excludes archived and uncataloged files", () => {
    expect(searchDocuments("migration").map((doc) => doc.href)).toEqual([
      "/documents/migration", "/documents/population",
    ]);
  });

  it("returns no results for an empty or unmatched query", () => {
    expect(searchDocuments("  ")).toEqual([]);
    expect(searchDocuments("unmatched")).toEqual([]);
  });

  it("serves document links without raw contents or filesystem paths", async () => {
    const response = await GET(new Request("http://localhost/api/search/documents?q=cohort"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: searchDocuments("cohort") });
  });

  it("rejects queries longer than the search field allows", async () => {
    const response = await GET(new Request(`http://localhost/api/search/documents?q=${"x".repeat(201)}`));
    expect(response.status).toBe(400);
  });
});
