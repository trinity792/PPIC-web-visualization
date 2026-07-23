"use client";

/**
 * DatasetLastUpdated.js — "Data last updated: …" for a module dataset.
 *
 * Shows the newest successful pipeline run (Pacific time) for the active module,
 * fetched from /api/module-status. Renders nothing for bring-your-own-data (no
 * server dataset) or until the timestamp resolves. Shared by the editor's View
 * Data and Export steps so both read the same freshness signal.
 *
 * Props:
 *   className {string} — optional extra classes on the wrapper <p>
 *
 * Data sources:
 *   - GET /api/module-status?module=<schemaId> (getLatestSuccessfulRun)
 *   - lib/logs/presentation.js (formatTimestamp — Pacific time)
 */

/* eslint-disable react/prop-types */

import React, { useEffect, useState } from "react";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { cn } from "@/components/ui/utils";
import { formatTimestamp } from "@/lib/logs/presentation";

export default function DatasetLastUpdated({ className }) {
  const { config, schema } = useChartConfig();
  const isModule = config.data?.source !== "inline" && Boolean(schema?.apiPath);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (!isModule) {
      setLastUpdated(null);
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    fetch(`/api/module-status?module=${encodeURIComponent(schema.id)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (active) setLastUpdated(body?.lastUpdated || null);
      })
      .catch(() => {
        /* leave it hidden if the status can't be read */
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [isModule, schema?.id]);

  if (!isModule || !lastUpdated) return null;
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Data last updated: {formatTimestamp(lastUpdated)}
    </p>
  );
}
