"use client";

/**
 * useLocationOptions.js — the location list behind the geographic multi-select.
 *
 * Wraps the `view=locations` API view (see lib/data/query_shapes.js
 * `buildLocationList`) in the same `{ status, locations, error }` envelope the
 * preview uses, so the section renders loading / error / empty explicitly rather
 * than showing an empty checkbox list and hoping.
 *
 * Two behaviors matter and are tested directly:
 *   • Cached per module + subset in a module-level Map. The list changes only
 *     when the cleaned dataset is rebuilt, so re-opening a level (or remounting
 *     the sidebar) must not re-fetch.
 *   • Aborts in flight. Dragging through levels fires several requests; only the
 *     newest may apply, or a slow earlier response would overwrite a newer list.
 *
 * Props/params:
 *   schema  {Object} — module schema (reads `id` and `apiPath`)
 *   filters {Object} — the chart's filters (reads `subset`)
 *
 * Returns:
 *   { status: "idle"|"loading"|"ready"|"error", locations: string[], error }
 *
 * Data sources:
 *   - GET <schema.apiPath>?view=locations&subset=<subset>
 */

import { useEffect, useRef, useState } from "react";

// Module-level so the cache survives unmounts, not just re-renders. Keyed on
// module + subset; nothing else changes the answer.
const cache = new Map();

const IDLE = { status: "idle", locations: [], error: null };

function cacheKey(schema, subset) {
  return `${schema?.id || "unknown"}|${subset || ""}`;
}

export function useLocationOptions(schema, filters) {
  const subset = filters?.subset || "";
  const key = cacheKey(schema, subset);
  const canFetch = Boolean(schema?.apiPath && subset);
  const [state, setState] = useState(() =>
    cache.has(key)
      ? { status: "ready", locations: cache.get(key), error: null }
      : IDLE,
  );
  // Guards against a resolved-but-stale response applying after an abort: the
  // AbortController only stops the request, not a promise already in flight.
  const requestRef = useRef(0);

  useEffect(() => {
    if (!canFetch) {
      setState(IDLE);
      return undefined;
    }
    if (cache.has(key)) {
      setState({ status: "ready", locations: cache.get(key), error: null });
      return undefined;
    }

    const controller = new AbortController();
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setState({ status: "loading", locations: [], error: null });

    fetch(`${schema.apiPath}?view=locations&subset=${encodeURIComponent(subset)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || "The location list could not be loaded.");
        }
        return body;
      })
      .then((body) => {
        if (requestRef.current !== requestId) return;
        const locations = Array.isArray(body.locations) ? body.locations : [];
        cache.set(key, locations);
        setState({ status: "ready", locations, error: null });
      })
      .catch((error) => {
        if (requestRef.current !== requestId || error.name === "AbortError") return;
        setState({ status: "error", locations: [], error });
      });

    return () => controller.abort();
  }, [canFetch, key, schema?.apiPath, subset]);

  return state;
}

export default useLocationOptions;
