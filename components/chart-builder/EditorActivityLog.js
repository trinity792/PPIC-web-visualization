"use client";

/**
 * EditorActivityLog.js — collapsible "Activity" drawer listing code-mode Run
 * outcomes (lib/logs/editorLog.js), newest first. Rendered in two places:
 * ChartSidebar's footer (above FooterActions) and at the bottom of
 * CodeEditorPanel, so activity is visible from either editor mode.
 *
 * Props:
 *   className {string} — optional utility classes for the outer wrapper
 *
 * Data sources:
 *   - Editor Run/apply events via useEditorLog() (in-memory ring, never
 *     localStorage — see lib/logs/editorLog.js)
 *
 * UI Kit reference:
 *   - Implements the shared collapsible-disclosure and log-card conventions
 *     (components/logs/SeverityChip.js, CopyButton.js)
 */

/* eslint-disable react/prop-types */

import React, { useState } from "react";

import { ChevronRight, Trash2 } from "lucide-react";

import CopyButton from "@/components/logs/CopyButton";
import SeverityChip from "@/components/logs/SeverityChip";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { toDownloadText, useEditorLog } from "@/lib/logs/editorLog";
import { formatTimestamp } from "@/lib/logs/presentation";

// editorLog severities ("info"|"warn"|"error") don't share SeverityChip's
// pipeline-run vocabulary ("success"|"recovered"|"error"); map onto the
// closest existing color/label rather than editing the shared presentation
// module for an unrelated domain.
const CHIP_SEVERITY = { info: "success", warn: "recovered", error: "error" };

function ActivityRow({ entry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-ppic-border bg-card px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SeverityChip severity={CHIP_SEVERITY[entry.severity] || "error"} />
          <span className="min-w-0 truncate">{entry.summary}</span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatTimestamp(entry.at)}
        </span>
      </div>
      {entry.detail ? (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-1">
          <CollapsibleTrigger className="inline-flex items-center gap-1 text-xs font-medium text-ppic-brand hover:underline">
            <ChevronRight
              className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
            Details
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-ppic-border bg-ppic-neutral-50 p-2 text-xs leading-relaxed text-ppic-neutral-700">
              {entry.detail}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

export default function EditorActivityLog({ className }) {
  const { entries, clear } = useEditorLog();
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger className="inline-flex items-center gap-1.5 text-sm font-medium">
          <ChevronRight
            className={`size-4 transition-transform ${open ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
          Activity ({entries.length})
        </CollapsibleTrigger>
        {entries.length ? (
          <div className="flex items-center gap-2">
            <CopyButton text={toDownloadText(entries)} label="Copy technical details" />
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              <Trash2 aria-hidden="true" className="size-3.5" />
              Clear
            </Button>
          </div>
        ) : null}
      </div>
      <CollapsibleContent className="mt-2 grid gap-2">
        {entries.length ? (
          entries.map((entry) => <ActivityRow key={entry.id} entry={entry} />)
        ) : (
          <p className="text-sm text-muted-foreground">No editor activity yet.</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
