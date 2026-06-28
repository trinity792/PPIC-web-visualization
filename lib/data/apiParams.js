/**
 * Shared helpers for the visualization API routes: query-param parsing and the
 * standard `{ error, source }` 400 response. Server-side only; `Response` is the
 * Web API global available in the Next.js route runtime.
 */

/** Parse an integer query param, returning null when absent or non-numeric. */
export function integerParam(searchParams, key) {
  const raw = searchParams.get(key);
  if (raw === null || raw === "") return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

/** Parse a comma-separated list param into a trimmed array, or null when absent. */
export function listParam(searchParams, key) {
  const raw = searchParams.get(key);
  return raw
    ? raw.split(",").map((value) => value.trim()).filter(Boolean)
    : null;
}

/** Standard 400 response identifying the failure source. */
export function invalid(message, source) {
  return Response.json({ error: message, source }, { status: 400 });
}
