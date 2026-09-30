/**
 * GET /api/search/documents?q=<text> — title, metadata, and full-text search
 * of the same curated Markdown library shown on /documents.
 * Returns document links and summaries; bodies stay on the server.
 */

import { searchDocuments } from "@/lib/docs/documents";

export async function GET(request) {
  const query = new URL(request.url).searchParams.get("q") || "";
  if (query.length > 200) {
    return Response.json({ error: "Search must be 200 characters or fewer." }, { status: 400 });
  }
  try {
    return Response.json({ results: searchDocuments(query) });
  } catch (error) {
    console.error("Document search failed:", error);
    return Response.json({ error: "Document search is unavailable. Please try again." }, { status: 500 });
  }
}
