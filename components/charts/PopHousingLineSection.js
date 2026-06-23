"use client";

import { useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import LineChart from "@/components/charts/LineChart";

// UI-facing constants kept client-side. The data module (lib/data/pop_housing.js)
// is server-only (node:fs), so it must not be imported here; these mirror the
// curated parameter list and the subset names that module accepts.
const PARAMETERS = [
  "Total Population",
  "Total Housing Units",
  "Vacancy Rate (%)",
  "Persons Per Household",
  "Single Family Units",
  "Multiple Family Units",
];

// Each preset maps to a single-subset API query (optionally pinned to locations).
const PRESETS = {
  Regions: { label: "California Regions", subset: "Regions", locations: null },
  "Major Counties": {
    label: "Major Counties",
    subset: "Counties",
    locations: [
      "Los Angeles",
      "San Diego",
      "Orange",
      "Riverside",
      "San Bernardino",
      "Santa Clara",
      "Alameda",
      "Sacramento",
    ],
  },
};

export default function PopHousingLineSection() {
  const [parameter, setParameter] = useState("Total Population");
  const [presetKey, setPresetKey] = useState("Regions");
  const [series, setSeries] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error | empty
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const preset = PRESETS[presetKey];
    const params = new URLSearchParams({ parameter, subset: preset.subset });
    if (preset.locations) params.set("locations", preset.locations.join(","));

    let cancelled = false;
    setStatus("loading");

    fetch(`/api/pophousing?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Request failed");
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        if (!body.series.length) {
          setStatus("empty");
          return;
        }
        setSeries(body.series);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err.message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [parameter, presetKey]);

  return (
    <section
      style={{
        backgroundColor: COLORS.white,
        borderRadius: "6px",
        padding: "24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}
    >
      {/* Controls */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "24px",
          alignItems: "flex-end",
          marginBottom: "20px",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "0.85rem", color: COLORS.gray5 }}>Metric</span>
          <select
            value={parameter}
            onChange={(e) => setParameter(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: "4px",
              border: `1px solid ${COLORS.gray3}`,
              fontSize: "0.95rem",
              minWidth: "220px",
            }}
          >
            {PARAMETERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "0.85rem", color: COLORS.gray5 }}>Locations</span>
          <div style={{ display: "flex", gap: "8px" }}>
            {Object.entries(PRESETS).map(([key, preset]) => {
              const active = key === presetKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPresetKey(key)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "4px",
                    border: `1px solid ${active ? COLORS.primaryOrange : COLORS.gray3}`,
                    backgroundColor: active ? COLORS.primaryOrange : COLORS.white,
                    color: active ? COLORS.white : COLORS.gray6,
                    fontSize: "0.9rem",
                    cursor: "pointer",
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chart / states */}
      {status === "loading" && (
        <p style={{ color: COLORS.gray5, padding: "40px 0" }}>Loading chart…</p>
      )}
      {status === "empty" && (
        <p style={{ color: COLORS.gray5, padding: "40px 0" }}>
          No data available for this selection.
        </p>
      )}
      {status === "error" && (
        <p style={{ color: COLORS.burntOrange, padding: "40px 0" }}>
          Could not load chart: {errorMessage}
        </p>
      )}
      {status === "ready" && (
        <LineChart
          series={series}
          title={`${parameter} Over Time (${PRESETS[presetKey].label})`}
          yTitle={parameter}
        />
      )}
    </section>
  );
}
