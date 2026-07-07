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

const YEAR_PATTERN = /^\d{4}$/;
const YEAR_MONTH_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Parse a period query param that may be a bare year ("YYYY") or an explicit
 * month ("YYYY-MM"). Building Permits is the only monthly module — this lets
 * its route accept the same coarse-year input the yearly modules use while
 * still supporting an explicit month.
 *
 * @returns {null|undefined|{year: number, month: string|null}} `null` when the
 *   param is absent; `undefined` when it matches neither shape (a bad-format
 *   signal, mirroring integerParam/listParam's "absent vs invalid" contract);
 *   otherwise `{ year, month }` where `month` is the "YYYY-MM" string (or null
 *   for a bare year).
 */
export function periodParam(searchParams, key) {
  const raw = searchParams.get(key);
  if (raw === null || raw === "") return null;
  if (YEAR_MONTH_PATTERN.test(raw)) {
    return { year: Number.parseInt(raw.slice(0, 4), 10), month: raw };
  }
  if (YEAR_PATTERN.test(raw)) {
    return { year: Number.parseInt(raw, 10), month: null };
  }
  return undefined;
}

/** Standard 400 response identifying the failure source. */
export function invalid(message, source) {
  return Response.json({ error: message, source }, { status: 400 });
}
