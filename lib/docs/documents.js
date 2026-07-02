/**
 * documents.js — server-side catalog of the committed docs/ markdown library.
 *
 * Reads every Markdown file under the repo's `docs/` tree, parses its YAML
 * frontmatter (Topic, Content Type, description, Date Published, Last Updated),
 * and normalizes each into a serializable record for the Documents landing page.
 * Filter option lists (content types, topics) are DERIVED from the files here so
 * new documents flow through without code changes.
 *
 * Data sources:
 *   - committed Markdown files under docs/ (with frontmatter)
 *
 * Outputs:
 *   - getDocuments()    — normalized, curated doc records (newest first)
 *   - getContentTypes() — sorted unique Content Type values
 *   - getTopics()       — ["All topics", ...unique topics]
 *   - getDocSlugs()     — slugs for generateStaticParams
 *
 * Notes:
 *   - Server-only (uses fs); import from server components / route handlers.
 *   - Curation excludes index/landing pages, empty placeholders, and any file
 *     missing a Content Type (e.g. the untracked trinitys_notes/primary.md).
 */

/* global process */
import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";

// ── Constants ─────────────────────────────────────────────────────────────────

const DOCS_ROOT = path.join(process.cwd(), "docs");

// Content Types that are navigation/scaffolding rather than real documents.
const EXCLUDED_TYPES = new Set(["landing page"]);

// H1 headings too generic to serve as a document title — fall back to filename.
const GENERIC_HEADINGS = new Set([
  "introduction",
  "overview",
  "summary",
  "executive summary",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Recursively collect absolute paths of every .md file under `dir`. */
function walkMarkdown(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

/** "ACS Housing Stress.md" → "acs-housing-stress". */
function slugify(basename) {
  return basename
    .replace(/\.md$/i, "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Prettify a filename into a title, preserving already-uppercase tokens (UI, ACS). */
function prettifyFilename(basename) {
  return basename
    .replace(/\.md$/i, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) =>
      word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

/** Prefer a meaningful first H1; otherwise a prettified filename. */
function deriveTitle(body, basename) {
  const match = body.match(/^#\s+(.+)$/m);
  if (match) {
    const heading = match[1].trim();
    const normalized = heading.toLowerCase().replace(/\.md$/i, "");
    const isFilename = normalized === basename.replace(/\.md$/i, "").toLowerCase();
    if (!GENERIC_HEADINGS.has(normalized) && !isFilename) return heading;
  }
  return prettifyFilename(basename);
}

/** The file's direct parent folder, used as the byline (e.g. "Human", "Technical"). */
function deriveCategory(absPath) {
  return prettifyFilename(path.basename(path.dirname(absPath)));
}

/** "06/25/2026 - 12:41 PM" → "06/25/2026"; passthrough otherwise. */
function updatedLabel(raw) {
  if (!raw) return null;
  return String(raw).split(" - ")[0].trim();
}

/** Recursively collect absolute paths of image assets under `dir`. */
function walkAssets(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkAssets(full));
    else if (entry.isFile() && /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(entry.name))
      out.push(full);
  }
  return out;
}

// ── Catalog ───────────────────────────────────────────────────────────────────

/**
 * Read + normalize every curated document. Memoized for the process lifetime.
 * `_cache` holds the lean, serializable records exposed to the client, while the
 * side maps keep server-only lookups (absolute paths, wikilink + asset resolution).
 */
let _cache = null;
const _slugToPath = new Map(); // slug → absolute .md path
const _basenameToSlug = new Map(); // lowercased filename (no ext) → slug
const _assetIndex = new Map(); // lowercased image filename → repo-relative path

function loadDocuments() {
  if (_cache) return _cache;
  if (!fs.existsSync(DOCS_ROOT)) return (_cache = []);

  const docs = [];
  const seenSlugs = new Set();

  for (const absPath of walkMarkdown(DOCS_ROOT)) {
    const raw = fs.readFileSync(absPath, "utf-8");
    let parsed;
    try {
      parsed = matter(raw);
    } catch {
      continue; // malformed frontmatter — skip rather than crash the page
    }
    const fm = parsed.data || {};
    const body = (parsed.content || "").trim();
    const type = typeof fm["Content Type"] === "string" ? fm["Content Type"].trim() : "";

    // Curation: real documents only.
    if (!type || EXCLUDED_TYPES.has(type.toLowerCase())) continue;
    if (!body) continue;

    const basename = path.basename(absPath);
    let slug = slugify(basename);
    if (seenSlugs.has(slug)) slug = `${slug}-${slugify(deriveCategory(absPath))}`;
    seenSlugs.add(slug);

    _slugToPath.set(slug, absPath);
    _basenameToSlug.set(basename.replace(/\.md$/i, "").toLowerCase(), slug);

    const publishedRaw = fm["Date Published"] ? String(fm["Date Published"]).trim() : null;
    const publishedTime = publishedRaw ? Date.parse(publishedRaw) : NaN;

    docs.push({
      slug,
      title: deriveTitle(body, basename),
      type,
      pinned: fm.pinned === true,
      topic: fm.Topic ? String(fm.Topic).trim() : "tbd",
      summary: fm.description ? String(fm.description).trim() : "",
      category: deriveCategory(absPath),
      publishedRaw,
      publishedISO: Number.isNaN(publishedTime) ? null : new Date(publishedTime).toISOString(),
      updatedLabel: updatedLabel(fm["Last Updated"]),
      sortTime: Number.isNaN(publishedTime) ? 0 : publishedTime,
    });
  }

  // Index image assets (e.g. "reference images/…") for ![[embed]] resolution.
  for (const absPath of walkAssets(DOCS_ROOT)) {
    _assetIndex.set(
      path.basename(absPath).toLowerCase(),
      path.relative(DOCS_ROOT, absPath)
    );
  }

  // Pinned docs first, then newest-first within each group.
  docs.sort((a, b) => (b.pinned - a.pinned) || (b.sortTime - a.sortTime));
  return (_cache = docs);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getDocuments() {
  return loadDocuments();
}

export function getContentTypes() {
  return [...new Set(loadDocuments().map((d) => d.type))].sort((a, b) =>
    a.localeCompare(b)
  );
}

export function getTopics() {
  const topics = [...new Set(loadDocuments().map((d) => d.topic))].sort((a, b) =>
    a.localeCompare(b)
  );
  return ["All topics", ...topics];
}

export function getDocSlugs() {
  return loadDocuments().map((d) => d.slug);
}

export function getDocBySlug(slug) {
  return loadDocuments().find((d) => d.slug === slug) || null;
}

/** Full record + raw Markdown body for a slug, or null. Server-only. */
export function getDocContent(slug) {
  const doc = getDocBySlug(slug);
  const absPath = _slugToPath.get(slug);
  if (!doc || !absPath) return null;
  const content = matter(fs.readFileSync(absPath, "utf-8")).content;
  return { ...doc, content };
}

/**
 * Resolve an Obsidian wikilink target (filename, no extension) to a document
 * slug, or null when it points at an excluded/landing/non-doc file.
 */
export function resolveWikilink(target) {
  loadDocuments();
  const key = String(target || "")
    .trim()
    .replace(/\.md$/i, "")
    .toLowerCase();
  return _basenameToSlug.get(key) || null;
}

/**
 * Resolve an embedded asset (image) filename to its docs-relative path for the
 * /api/doc-asset route, or null when not found.
 */
export function resolveAsset(filename) {
  loadDocuments();
  const key = path.basename(String(filename || "").trim()).toLowerCase();
  return _assetIndex.get(key) || null;
}

/** Guard for the asset route: absolute path for a docs-relative asset, if valid. */
export function assetAbsolutePath(relPath) {
  const resolved = path.resolve(DOCS_ROOT, relPath);
  if (resolved !== DOCS_ROOT && !resolved.startsWith(DOCS_ROOT + path.sep)) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}

/** Plain object (filename→slug) for the client wikilink plugin. */
export function getWikilinkMap() {
  loadDocuments();
  return Object.fromEntries(_basenameToSlug);
}

/** Plain object (filename→docs-relative path) for the client wikilink plugin. */
export function getAssetMap() {
  loadDocuments();
  return Object.fromEntries(_assetIndex);
}
