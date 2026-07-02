/**
 * GET /api/doc-asset?file=<docs-relative path>
 *
 * Serves image assets that live under docs/ (e.g. "reference images/…") so that
 * Obsidian embeds (`![[image.png]]`) render. The path is validated to stay
 * within docs/ to prevent traversal.
 *
 * Data sources:
 *   - image files under docs/ (via lib/docs/documents.js guard)
 */

import fs from "node:fs";
import path from "node:path";

import { assetAbsolutePath } from "@/lib/docs/documents";

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

export function GET(request) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");
  if (!file) return new Response("Missing 'file'", { status: 400 });

  const absPath = assetAbsolutePath(file);
  if (!absPath) return new Response("Not found", { status: 404 });

  const ext = path.extname(absPath).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return new Response("Unsupported type", { status: 415 });

  const body = fs.readFileSync(absPath);
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
