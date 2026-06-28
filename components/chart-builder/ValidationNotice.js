"use client";

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
import { useChartConfig } from "./chartConfigStore";

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
            <Icon />
            <AlertTitle className="flex items-center gap-1.5">
              {destructive ? "Configuration error" : "Recommendation"}
              <Tooltip>
                <TooltipTrigger type="button" aria-label={finding.code}>
                  <CircleHelp className="size-3.5" />
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
