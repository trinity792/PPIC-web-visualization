"use client";

import React, { useMemo, useState } from "react";

import { expandCrossProduct, resolveLabels } from "@/lib/visualization/comparisons";
import {
  UNSUPPORTED_VERSION_MESSAGE,
  readQuestion,
  serializeQuestion,
} from "@/lib/visualization/questionSpec";

const BASE_COMPARISONS = Object.freeze([
  {
    id: "cmp_latina",
    dimensions: {
      "Race/Ethnicity": "Hispanic",
      Sex: "Female",
      "Age Group": "All Ages",
    },
  },
  {
    id: "cmp_white",
    dimensions: {
      "Race/Ethnicity": "White",
      Sex: "Female",
      "Age Group": "All Ages",
    },
  },
]);

const LABEL_SCHEMA = Object.freeze({
  labelMeta: {
    dimensionOrder: ["geography", "Race/Ethnicity", "Sex", "Age Group"],
    omitValues: { "Age Group": ["All Ages"] },
    valueLabels: {
      "Race/Ethnicity": { Hispanic: { default: "Latino", bySex: { Female: "Latina" } } },
      Sex: { Female: "Women", Male: "Men" },
    },
  },
});

function initialSpec() {
  return {
    version: 3,
    question: {
      dataset: { kind: "module", moduleId: "projections" },
      source: "DoF P-3",
      outcome: { measureId: "Population" },
      geography: { subset: "Counties", locations: ["San Francisco"] },
      time: { contract: "selectedSnapshots", years: [2020, 2025, 2030] },
      calculation: { id: "actual", params: {} },
      comparisons: BASE_COMPARISONS,
    },
    presentation: { chartType: "line", comparisonPresentation: "combined" },
  };
}

function exportFixture(comparisons) {
  const rows = ["comparison,status,value"];
  for (const comparison of comparisons) {
    rows.push(`${comparison.label},available,50000`);
  }
  const href = URL.createObjectURL(new Blob([`${rows.join("\n")}\n`], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = "visualization-v3.csv";
  link.click();
  URL.revokeObjectURL(href);
}

/** Deterministic interaction surface used only by Playwright's full-flow suite. */
export default function VisualizationV3FlowFixture() {
  const [spec, setSpec] = useState(initialSpec);
  const [average, setAverage] = useState(false);
  const [topN, setTopN] = useState(5);
  const [showImport, setShowImport] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [needsTime, setNeedsTime] = useState(false);

  const comparisons = useMemo(
    () =>
      resolveLabels(
        spec.question.comparisons.map((entry) => ({
          ...entry,
          geography: "San Francisco",
        })),
        LABEL_SCHEMA,
      ),
    [spec.question.comparisons],
  );
  const questionSignature = JSON.stringify(spec.question);

  function generate() {
    const generated = expandCrossProduct(
      { "Race/Ethnicity": ["Hispanic", "White"], Sex: ["Female"] },
      {
        existing: spec.question.comparisons,
        fixed: { "Age Group": "All Ages" },
      },
    );
    setSpec((current) => ({
      ...current,
      question: { ...current.question, comparisons: generated.comparisons },
    }));
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-5 p-8">
      <h1 className="font-heading text-2xl">Visualization v3 flow fixture</h1>
      <div data-testid="question-signature" className="sr-only">
        {questionSignature}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Comparisons">
        {comparisons.map((comparison, index) => (
          <button
            key={comparison.id}
            type="button"
            role="tab"
            aria-selected={index === 0}
          >
            {comparison.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={generate}>Generate comparisons</button>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem("ppic.savedViews.v3", JSON.stringify(serializeQuestion(spec)));
          }}
        >
          Save view
        </button>
        <button type="button" onClick={() => setShowImport(true)}>Import config</button>
        <button type="button" onClick={() => setNeedsTime(true)}>Donut</button>
        <button type="button" role="menuitem" onClick={() => exportFixture(comparisons)}>
          Export CSV
        </button>
      </div>

      <label>
        Transformation
        <select
          aria-label="Transformation"
          value={spec.question.calculation.id}
          onChange={(event) =>
            setSpec((current) => ({
              ...current,
              question: {
                ...current.question,
                calculation: { id: event.target.value, params: {} },
              },
            }))
          }
        >
          <option value="actual">Actual value</option>
          <option value="percentChange">Percent change</option>
        </select>
      </label>

      <label>
        Top
        <input
          aria-label="Top"
          type="number"
          min="1"
          max="10"
          value={topN}
          onChange={(event) => setTopN(Number(event.target.value))}
        />
      </label>
      <div aria-label="Ranked bar categories">
        {Array.from({ length: topN }, (_, index) => (
          <span key={index} data-testid="bar-category-labels" className="mr-2">
            Category {index + 1}
          </span>
        ))}
      </div>

      <label>
        <input
          type="radio"
          name="comparison-presentation"
          checked={spec.presentation.comparisonPresentation === "tabs"}
          onChange={() =>
            setSpec((current) => ({
              ...current,
              presentation: { ...current.presentation, comparisonPresentation: "tabs" },
            }))
          }
        />
        Show each comparison in tabs
      </label>
      <label>
        <input
          type="radio"
          name="year-presentation"
          checked={average}
          onChange={() => setAverage(true)}
        />
        Show the average of selected years
      </label>
      {average ? <p>Average of 2020, 2025, and 2030.</p> : null}

      <div className="flex gap-4">
        <span>Not available</span>
        <span>Suppressed</span>
      </div>
      {needsTime ? <p>Select time to show this chart.</p> : null}

      {showImport ? (
        <label>
          Configuration JSON
          <textarea
            aria-label="Configuration JSON"
            onChange={(event) => {
              try {
                const result = readQuestion(JSON.parse(event.target.value));
                setImportMessage(result.ok ? "Configuration loaded." : result.message);
              } catch {
                setImportMessage("Enter valid JSON.");
              }
            }}
          />
        </label>
      ) : null}
      {importMessage === UNSUPPORTED_VERSION_MESSAGE ? <p>{importMessage}</p> : null}
    </main>
  );
}
