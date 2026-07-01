"use client";

/**
 * ValidationNotice.js — actionable chart-configuration findings and help codes.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Validation findings from ChartConfigProvider
 *
 * UI Kit reference:
 *   - Implements error and recommendation alert patterns
 */

import React from "react";

import { AlertCircle, AlertTriangle, CircleHelp } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";

export default function ValidationNotice() {
  const { config } = useChartConfig();
  if (!config.validation?.length) return null;

  return (
    <div className="grid gap-2">
      {config.validation.map((finding, index) => {
        const destructive = finding.level === "error";
        const Icon = destructive ? AlertCircle : AlertTriangle;
        return (
          <Alert
            key={`${finding.code}-${index}`}
            variant={destructive ? "destructive" : "default"}
            className={destructive ? undefined : "border-amber-400/60"}
          >
            <Icon aria-hidden="true" />
            <AlertTitle className="flex items-center gap-1.5">
              {destructive ? "Configuration error" : "Recommendation"}
              <Tooltip>
                <TooltipTrigger type="button" aria-label={finding.code}>
                  <CircleHelp aria-hidden="true" className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>{finding.code}</TooltipContent>
              </Tooltip>
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
