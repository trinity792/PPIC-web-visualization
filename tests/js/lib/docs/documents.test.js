/** Documents catalog curation contracts. */

import { describe, expect, it } from "vitest";

import { getDocuments, getStatuses } from "@/lib/docs/documents";

describe("documents catalog", () => {
  it("excludes every document marked Archive", () => {
    const documents = getDocuments();

    expect(documents.length).toBeGreaterThan(0);
    expect(documents.every((document) => document.status?.toLowerCase() !== "archive")).toBe(
      true,
    );
    expect(getStatuses()).not.toContain("Archive");
  });

  it("does not publish known archived documents from docs/archive", () => {
    const slugs = getDocuments().map((document) => document.slug);

    for (const archivedSlug of [
      "pophouse-unit-tests-guide",
      "ui-ux-upgrades-and-codebase-cleanup",
      "grapheditor-overhaul",
      "todo-notes",
      "automations",
      "shared-archive-and-save-refractor",
      "grapheditor-overhaul-redirect",
    ]) {
      expect(slugs).not.toContain(archivedSlug);
    }
  });
});
