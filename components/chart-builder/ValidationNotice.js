"use client";

/**
 * ValidationNotice.js — actionable chart-configuration errors and help codes.
 *
 * Clicking any finding copies the full list of visible errors to
 * the clipboard, so a user can paste them into a bug report or a message
 * without transcribing each one.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Validation findings from ChartConfigProvider
 *
 * UI Kit reference:
 *   - Implements the configuration-error alert pattern
 */

import React, { useState } from "react";

import { AlertCircle, CircleHelp, Check, Copy } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { roleLabel } from "@/components/chart-builder/EncodingSection";
import { getChartType } from "@/lib/visualization/chartRegistry";
import { inlineColumnKind } from "@/lib/visualization/inlineMapping";

const NONE = "__none__";

/**
 * "Map your columns" prompt — shown for bring-your-own-data when a required
 * role isn't bound to a real column yet. Auto-map pre-fills its best guesses;
 * this lets the user correct them in place, without opening the Encodings
 * section, so pasted CSVs resolve without hunting across the editor.
 */
function InlineBindingPrompt() {
  const { config, dispatch, schema } = useChartConfig();
  const inline =
    schema.inlineOnly && config.data?.source === "inline" ? config.data.inline : null;
  const chart = getChartType(config.chartType);
  if (!inline || !chart) return null;

  const columns = inline.columns || [];
  const names = new Set(columns.map((column) => column.name));
  const required = chart.requiredRoles;
  const anyUnmapped = required.some(
    (role) => !config.bindings[role] || !names.has(config.bindings[role]),
  );
  if (!anyUnmapped) return null;

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-3">
      <div>
        <p className="text-sm font-medium">Map your columns</p>
        <p className="text-xs text-muted-foreground">
          Choose which column feeds each part of the chart. We auto-filled our
          best guesses — adjust any that are wrong.
        </p>
      </div>
      {required.map((role) => {
        const accepted = chart.roleConstraints[role] || [];
        const options = columns.filter(
          (column) => !accepted.length || accepted.includes(inlineColumnKind(column.type)),
        );
        return (
          <div key={role} className="grid gap-1">
            <Label htmlFor={`map-${role}`} className="text-xs">
              {roleLabel(role, config.chartType)}
              <span className="text-destructive"> *</span>
            </Label>
            <Select
              value={config.bindings[role] || NONE}
              onValueChange={(value) =>
                dispatch({
                  type: "SET_BINDING",
                  role,
                  field: value === NONE ? null : value,
                })
              }
            >
              <SelectTrigger id={`map-${role}`}>
                <SelectValue placeholder="Choose a column" />
              </SelectTrigger>
              <SelectContent>
                {options.length ? (
                  options.map((column) => (
                    <SelectItem key={column.name} value={column.name}>
                      {column.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={NONE} disabled>
                    No matching column — try another chart type
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}

/** All findings as one plain-text block, numbered, with codes and suggestions. */
function findingsToText(findings) {
  const lines = findings.map((finding, index) => {
    const kind = finding.level === "error" ? "Error" : "Recommendation";
    const head = `${index + 1}. [${kind}] ${finding.code}: ${finding.message}`;
    return finding.suggestion ? `${head}\n   Suggestion: ${finding.suggestion}` : head;
  });
  return `Chart configuration findings (${findings.length}):\n${lines.join("\n")}`;
}

export default function ValidationNotice() {
  const { config } = useChartConfig();
  const [copied, setCopied] = useState(false);
  // Recommendations are advisory and no longer belong in the editor UI. Keep
  // them in the validation model for diagnostics/compatibility, while showing
  // only errors that require the user's attention before rendering.
  const findings = (config.validation || []).filter(
    (finding) => finding.level === "error",
  );

  if (!findings.length) return null;

  async function copyAll() {
    const text = findingsToText(findings);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked (e.g. insecure context): fall back to a temp textarea.
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {
        /* nothing more we can do; the user can still read the cards */
      }
      document.body.removeChild(area);
    }
    setCopied(true);
    window.clearTimeout(copyAll._t);
    copyAll._t = window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid gap-2">
      <InlineBindingPrompt />
      {findings.map((finding, index) => {
        return (
          <Alert
            key={`${finding.code}-${index}`}
            variant="destructive"
            role="button"
            tabIndex={0}
            aria-label="Copy all configuration findings"
            title="Click to copy all findings"
            onClick={copyAll}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                copyAll();
              }
            }}
            className="cursor-pointer transition-colors hover:brightness-[0.98]"
          >
            <AlertCircle aria-hidden="true" />
            <AlertTitle className="flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5">
                Configuration error
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    aria-label={finding.code}
                    // Don't trigger the card's copy when opening the help tooltip.
                    onClick={(event) => event.stopPropagation()}
                  >
                    <CircleHelp aria-hidden="true" className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>{finding.code}</TooltipContent>
                </Tooltip>
              </span>
              <span className="flex items-center gap-1 text-xs font-normal opacity-80">
                {copied ? (
                  <>
                    <Check aria-hidden="true" className="size-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy aria-hidden="true" className="size-3.5" />
                    Copy all
                  </>
                )}
              </span>
            </AlertTitle>
            <AlertDescription>
              <p>{finding.message}</p>
              {finding.suggestion ? <p>{finding.suggestion}</p> : null}
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
