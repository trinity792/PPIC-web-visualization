"use client";

/**
 * UpdateDataButton.js — triggers a server-side data refresh for a module and
 * points the user at the Logs page to watch the outcome.
 *
 * Props:
 *   endpoint {string} — POST route that starts the refresh (e.g. "/api/pophousing/update")
 *   label    {string} — button text (default: "Update data")
 *
 * Data sources:
 *   - POSTs to `endpoint`; the pipeline records its own outcome to logs/*.jsonl,
 *     which the /logs page reads. This button does not wait for completion.
 *
 * UI Kit reference:
 *   - Uses the standard Button pattern; unique to the data-source panel otherwise
 */

/* eslint-disable react/prop-types */

import React, { useState } from "react";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

// ── Component ────────────────────────────────────────────────────────

export default function UpdateDataButton({ endpoint, label = "Update data" }) {
  const [status, setStatus] = useState("idle"); // idle | starting | started | running | error
  const [message, setMessage] = useState("");

  async function handleClick() {
    setStatus("starting");
    setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 202) {
        setStatus("started");
      } else if (response.status === 409) {
        setStatus("running");
      } else {
        setStatus("error");
      }
      setMessage(body.message || body.error || "");
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  const isBusy = status === "starting";
  const showLogsLink = status === "started" || status === "running";

  return (
    <div className="grid gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isBusy}
        className="justify-start gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${isBusy ? "animate-spin" : ""}`} aria-hidden="true" />
        {isBusy ? "Starting…" : label}
      </Button>
      {message ? (
        <p
          className={`text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message}
          {showLogsLink ? (
            <>
              {" "}
              <Link href="/logs" className="underline underline-offset-2">
                View Logs
              </Link>
            </>
          ) : null}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Fetches the latest DoF release and rebuilds this dataset. Runs in the background.
        </p>
      )}
    </div>
  );
}
