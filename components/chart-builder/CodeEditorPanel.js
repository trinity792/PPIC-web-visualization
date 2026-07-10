"use client";

/**
 * CodeEditorPanel.js — the code-mode surface (Spec / R / Stata tabs),
 * replacing ChartSidebar's controls when the editor is in code mode. The
 * chart canvas keeps rendering the last good config throughout.
 *
 * Props:
 *   none — reads/writes the chart config via useChartConfig()
 *
 * Data sources:
 *   - Live chart config + schema via ChartConfigProvider
 *   - Generated R/Stata via lib/visualization/codebridge/*
 *
 * UI Kit reference:
 *   - Implements the shared "Tabs" pattern; findings lists mirror
 *     ValidationNotice's Alert styling
 */

/* eslint-disable react/prop-types */

import React, { useRef, useState } from "react";

import dynamic from "next/dynamic";

import { json } from "@codemirror/lang-json";
import { StreamLanguage } from "@codemirror/language";
import { r as rMode } from "@codemirror/legacy-modes/mode/r";

import { evaluateSpecDraft, runCodeDraft } from "@/components/chart-builder/codePanelController";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import EditorActivityLog from "@/components/chart-builder/EditorActivityLog";
import CopyButton from "@/components/logs/CopyButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { logEditorEvent } from "@/lib/logs/editorLog";
import { printSpec } from "@/lib/visualization/chartSpec";
import { toRCode } from "@/lib/visualization/codebridge/toRCode";
import { toStataCode } from "@/lib/visualization/codebridge/toStataCode";

// CodeMirror bundles the full editor view/state/commands — load it only on
// the client, and only once code mode actually renders, so it never enters
// the default bundle. Language extensions (lang-json, the R legacy mode) are
// small, DOM-free definitions, so they're imported normally above.
const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => (
    <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
      Loading editor…
    </p>
  ),
});

const JSON_EXTENSIONS = [json()];
const R_EXTENSIONS = [StreamLanguage.define(rMode)];
const STATA_EXTENSIONS = [];

/**
 * Findings (chartSpec/grammar-shaped `{ level, code, message }` or codegen's
 * `{ code, feature, message }`) rendered as a compact Alert list — the same
 * visual language as ValidationNotice, without needing its store dependency.
 */
function FindingsList({ findings, tone }) {
  if (!findings?.length) return null;
  return (
    <div className="grid gap-2">
      {findings.map((finding, index) => (
        <Alert
          key={`${finding.code}-${index}`}
          variant={tone === "error" ? "destructive" : "default"}
          className={tone === "error" ? undefined : "border-amber-400/60"}
        >
          <AlertTitle>{finding.code || (tone === "error" ? "Error" : "Warning")}</AlertTitle>
          <AlertDescription>
            <p>{finding.message}</p>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

export default function CodeEditorPanel() {
  const { config, dispatch, schema } = useChartConfig();
  const [tab, setTab] = useState("spec");

  const [specText, setSpecText] = useState(() => printSpec(config, schema));
  const [specClassification, setSpecClassification] = useState("none");
  const [specFindings, setSpecFindings] = useState([]);
  const specDebounce = useRef(null);

  const [rState, setRState] = useState(() => {
    const generated = toRCode(config, null);
    return { text: generated.code, genWarnings: generated.warnings, runFindings: { errors: [], warnings: [] } };
  });
  const [stataState, setStataState] = useState(() => {
    const generated = toStataCode(config, null);
    return { text: generated.code, genWarnings: generated.warnings, runFindings: { errors: [], warnings: [] } };
  });

  // A successful Run from ANY tab applies the new config, then regenerates
  // every tab's view from it — the "round-trip is visible" requirement,
  // keyed on the config's normalized JSON (the cache key the R/Stata tabs
  // are generated against).
  function applySpec(spec, { source, extraWarnings = [] }) {
    dispatch({ type: "LOAD_SPEC", spec });
    logEditorEvent({
      severity: extraWarnings.length ? "warn" : "info",
      code: `${source}_RUN_APPLIED`,
      summary: `Applied ${source === "SPEC" ? "the edited spec" : `${source} code`} to the chart.`,
      detail: extraWarnings.map((finding) => finding.message).join("\n") || undefined,
      source: `${source} tab`,
    });
    setSpecText(printSpec(spec, schema));
    setSpecClassification("none");
    setSpecFindings([]);
    const rGenerated = toRCode(spec, null);
    setRState((prev) => ({ ...prev, text: rGenerated.code, genWarnings: rGenerated.warnings }));
    const stataGenerated = toStataCode(spec, null);
    setStataState((prev) => ({ ...prev, text: stataGenerated.code, genWarnings: stataGenerated.warnings }));
  }

  function onSpecChange(value) {
    setSpecText(value);
    if (specDebounce.current) clearTimeout(specDebounce.current);
    specDebounce.current = setTimeout(() => {
      const result = evaluateSpecDraft(value, config, schema);
      setSpecClassification(result.classification);
      setSpecFindings(result.errors);
      const blocking = result.errors.some((finding) => finding.level === "error");
      if (result.classification === "small" && !blocking && result.spec) {
        applySpec(result.spec, { source: "SPEC" });
      }
    }, 400);
  }

  function runSpec() {
    const { spec, warnings, errors } = runCodeDraft("spec", specText, config, schema);
    setSpecFindings([...errors, ...warnings]);
    if (!spec) {
      logEditorEvent({
        severity: "error",
        code: "SPEC_RUN_ERROR",
        summary: "The edited spec could not be applied.",
        detail: errors.map((finding) => finding.message).join("\n"),
        source: "Spec tab",
      });
      return;
    }
    applySpec(spec, { source: "SPEC", extraWarnings: warnings });
  }

  function runR() {
    const { spec, warnings, errors } = runCodeDraft("r", rState.text, config, schema);
    setRState((prev) => ({ ...prev, runFindings: { errors, warnings } }));
    if (!spec) {
      logEditorEvent({
        severity: "error",
        code: "R_RUN_ERROR",
        summary: "The R code could not be applied.",
        detail: errors.map((finding) => finding.message).join("\n"),
        source: "R tab",
      });
      return;
    }
    applySpec(spec, { source: "R", extraWarnings: warnings });
  }

  function runStata() {
    const { spec, warnings, errors } = runCodeDraft("stata", stataState.text, config, schema);
    setStataState((prev) => ({ ...prev, runFindings: { errors, warnings } }));
    if (!spec) {
      logEditorEvent({
        severity: "error",
        code: "STATA_RUN_ERROR",
        summary: "The Stata code could not be applied.",
        detail: errors.map((finding) => finding.message).join("\n"),
        source: "Stata tab",
      });
      return;
    }
    applySpec(spec, { source: "STATA", extraWarnings: warnings });
  }

  const specBlockingErrors = specFindings.filter((finding) => finding.level === "error");
  const specOtherFindings = specFindings.filter((finding) => finding.level !== "error");
  const specRunDisabled = specClassification !== "structural" || specBlockingErrors.length > 0;

  return (
    <div className="grid gap-4 p-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Code language">
          <TabsTrigger value="spec">Spec</TabsTrigger>
          <TabsTrigger value="r">R</TabsTrigger>
          <TabsTrigger value="stata">Stata</TabsTrigger>
        </TabsList>

        <TabsContent value="spec" className="mt-3 grid gap-3">
          <p className="text-xs text-muted-foreground">
            Label, format, and appearance edits apply automatically. Structural
            edits (chart type, bindings, data, period, filters, layers) wait
            for Run.
          </p>
          <CodeMirror
            value={specText}
            height="360px"
            width="100%"
            extensions={JSON_EXTENSIONS}
            onChange={onSpecChange}
          />
          <FindingsList findings={specBlockingErrors} tone="error" />
          <FindingsList findings={specOtherFindings} tone="warn" />
          <div className="flex items-center justify-between gap-2">
            <CopyButton text={specText} label="Copy spec" />
            <Button type="button" onClick={runSpec} disabled={specRunDisabled}>
              Run
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="r" className="mt-3 grid gap-3">
          <p className="text-xs text-muted-foreground">
            Recognized ggplot2 subset — unrecognized lines are reported, not
            run.
          </p>
          <FindingsList findings={rState.genWarnings} tone="warn" />
          <CodeMirror
            value={rState.text}
            height="360px"
            width="100%"
            extensions={R_EXTENSIONS}
            onChange={(value) => setRState((prev) => ({ ...prev, text: value }))}
          />
          <FindingsList findings={rState.runFindings.errors} tone="error" />
          <FindingsList findings={rState.runFindings.warnings} tone="warn" />
          <div className="flex items-center justify-between gap-2">
            <CopyButton text={rState.text} label="Copy R code" />
            <Button type="button" onClick={runR}>
              Run
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="stata" className="mt-3 grid gap-3">
          <p className="text-xs text-muted-foreground">
            Recognized twoway/graph subset — unrecognized lines are reported,
            not run.
          </p>
          <FindingsList findings={stataState.genWarnings} tone="warn" />
          <CodeMirror
            value={stataState.text}
            height="360px"
            width="100%"
            extensions={STATA_EXTENSIONS}
            onChange={(value) => setStataState((prev) => ({ ...prev, text: value }))}
          />
          <FindingsList findings={stataState.runFindings.errors} tone="error" />
          <FindingsList findings={stataState.runFindings.warnings} tone="warn" />
          <div className="flex items-center justify-between gap-2">
            <CopyButton text={stataState.text} label="Copy Stata code" />
            <Button type="button" onClick={runStata}>
              Run
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <EditorActivityLog />
    </div>
  );
}

// Decision: full CodeMirror lint-diagnostic gutter markers
// (@codemirror/lint's linter/setDiagnostics) are not wired up. The inline
// FindingsList above covers every error/warning the parsers and validators
// produce; a second, redundant presentation in the gutter was judged not
// worth the added complexity for v1.
