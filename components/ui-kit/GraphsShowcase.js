"use client";
/* eslint-disable react/prop-types */
import React from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Section } from "./Section";
import { COLORS, BASE_PLOTLY_COLORS } from "@/lib/constants";

const tooltipStyle = {
  borderRadius: 12,
  border: `1px solid ${COLORS.gray2}`,
  fontFamily: "Inter",
  fontSize: 13,
};
const axisTick = { fontSize: 12, fontFamily: "Inter", fill: COLORS.gray5 };

/* ---------- shared card + property primitives ---------- */

function GraphCard({ title, chart, properties, responsive = true }) {
  return (
    <div
      className="rounded-2xl border bg-white p-6 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)]"
      style={{ borderColor: COLORS.gray2 }}
    >
      <h3 className="text-neutral-900" style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>
        {title}
      </h3>
      <div className="mt-3 h-64 w-full">
        {responsive ? (
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        ) : (
          chart
        )}
      </div>
      <dl className="mt-4 space-y-1.5 border-t pt-4" style={{ borderColor: COLORS.gray1 }}>
        {properties.map((p) => (
          <div key={p.label} className="flex items-start gap-3 text-[13px]" style={{ fontFamily: "var(--font-sans)" }}>
            <dt className="w-32 shrink-0 uppercase tracking-[0.1em] text-neutral-500">{p.label}</dt>
            <dd className="flex flex-wrap items-center gap-2 text-neutral-800">{p.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Swatch({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-3.5 rounded-[3px]" style={{ backgroundColor: color }} />
      {label && <span className="text-neutral-700">{label}</span>}
    </span>
  );
}

/* ---------- data ---------- */

const donutData = [
  { name: "Bay Area", value: 7.7 },
  { name: "Southern California", value: 23.8 },
  { name: "Central Valley", value: 4.3 },
  { name: "Sacramento", value: 2.5 },
  { name: "Other", value: 1.2 },
];

const lineData = [
  { year: "2018", owners: 54.9, renters: 45.1 },
  { year: "2019", owners: 55.3, renters: 44.7 },
  { year: "2020", owners: 55.9, renters: 44.1 },
  { year: "2021", owners: 56.0, renters: 44.0 },
  { year: "2022", owners: 55.6, renters: 44.4 },
  { year: "2023", owners: 55.8, renters: 44.2 },
  { year: "2024", owners: 56.4, renters: 43.6 },
];

const scatterA = [
  { income: 62, cost: 410 }, { income: 71, cost: 520 }, { income: 80, cost: 610 },
  { income: 88, cost: 690 }, { income: 95, cost: 760 }, { income: 104, cost: 880 },
  { income: 112, cost: 940 },
];
const scatterB = [
  { income: 58, cost: 360 }, { income: 66, cost: 440 }, { income: 74, cost: 500 },
  { income: 83, cost: 560 }, { income: 90, cost: 640 }, { income: 99, cost: 700 },
];

const dumbbellData = [
  { region: "Bay Area", start: 712, end: 1180 },
  { region: "Southern CA", start: 540, end: 860 },
  { region: "Central Valley", start: 290, end: 470 },
  { region: "Sacramento", start: 360, end: 590 },
];

/* ---------- dumbbell (custom) ---------- */

function Dumbbell() {
  const min = 200;
  const max = 1200;
  const pct = (v) => ((v - min) / (max - min)) * 100;
  return (
    <div className="flex h-full flex-col justify-center gap-6 px-2">
      {dumbbellData.map((d) => (
        <div key={d.region} className="grid grid-cols-[110px_1fr] items-center gap-3">
          <span className="text-[13px] text-neutral-700" style={{ fontFamily: "var(--font-sans)" }}>
            {d.region}
          </span>
          <div className="relative h-4">
            {/* track */}
            <div className="absolute top-1/2 h-[3px] w-full -translate-y-1/2 rounded-full" style={{ backgroundColor: COLORS.gray1 }} />
            {/* connecting segment */}
            <div
              className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
              style={{ left: `${pct(d.start)}%`, width: `${pct(d.end) - pct(d.start)}%`, backgroundColor: COLORS.gray3 }}
            />
            {/* start dot */}
            <span
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{ left: `${pct(d.start)}%`, backgroundColor: COLORS.blue3 }}
              title={`2014 · ${d.start}k`}
            />
            {/* end dot */}
            <span
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{ left: `${pct(d.end)}%`, backgroundColor: COLORS.orange3 }}
              title={`2024 · ${d.end}k`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- section ---------- */

export function GraphsShowcase() {
  return (
    <Section
      id="graphs"
      eyebrow="Components"
      title="Example Graphs"
      description="Chart types styled with the PPIC data palette. Categorical series cycle through BASE_PLOTLY_COLORS; comparison pairs lead with blue (baseline) and orange (current)."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Donut */}
        <GraphCard
          title="Donut · Population share by region"
          chart={
            <PieChart>
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}M`} />
              <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="none">
                {donutData.map((_, i) => (
                  <Cell key={i} fill={BASE_PLOTLY_COLORS[i % BASE_PLOTLY_COLORS.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontFamily: "Inter", fontSize: 12 }} />
            </PieChart>
          }
          properties={[
            { label: "Type", value: "Donut / arc" },
            { label: "Inner radius", value: "55px" },
            { label: "Slice colors", value: "BASE_PLOTLY_COLORS" },
            { label: "Padding angle", value: "2°" },
          ]}
        />

        {/* Dumbbell */}
        <GraphCard
          title="Dumbbell · Median cost 2014 → 2024"
          responsive={false}
          chart={<Dumbbell />}
          properties={[
            { label: "Type", value: "Dumbbell / range" },
            {
              label: "Endpoints",
              value: (
                <>
                  <Swatch color={COLORS.blue3} label="2014" />
                  <Swatch color={COLORS.orange3} label="2024" />
                </>
              ),
            },
            { label: "Connector", value: <Swatch color={COLORS.gray3} label="gray3" /> },
            { label: "Track", value: <Swatch color={COLORS.gray1} label="gray1" /> },
          ]}
        />

        {/* Line */}
        <GraphCard
          title="Line · Owner vs renter share"
          chart={
            <LineChart data={lineData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={COLORS.gray2} vertical={false} />
              <XAxis dataKey="year" tick={axisTick} tickLine={false} axisLine={{ stroke: COLORS.gray3 }} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} unit="%" />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontFamily: "Inter", fontSize: 12 }} />
              <Line type="monotone" dataKey="owners" name="Owners" stroke={COLORS.blue3} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="renters" name="Renters" stroke={COLORS.orange3} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          }
          properties={[
            { label: "Type", value: "Multi-series line" },
            {
              label: "Series",
              value: (
                <>
                  <Swatch color={COLORS.blue3} label="Owners" />
                  <Swatch color={COLORS.orange3} label="Renters" />
                </>
              ),
            },
            { label: "Stroke", value: "2.5px · monotone" },
            { label: "Grid", value: "Horizontal only" },
          ]}
        />

        {/* Scatter */}
        <GraphCard
          title="Scatter · Income vs housing cost"
          chart={
            <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
              <CartesianGrid stroke={COLORS.gray2} />
              <XAxis type="number" dataKey="income" name="Income" unit="k" tick={axisTick} tickLine={false} axisLine={{ stroke: COLORS.gray3 }} />
              <YAxis type="number" dataKey="cost" name="Cost" unit="k" tick={axisTick} tickLine={false} axisLine={false} width={40} />
              <ZAxis range={[60, 60]} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
              <Legend wrapperStyle={{ fontFamily: "Inter", fontSize: 12 }} />
              <Scatter name="Coastal" data={scatterA} fill={COLORS.blue3} />
              <Scatter name="Inland" data={scatterB} fill={COLORS.orange3} />
            </ScatterChart>
          }
          properties={[
            { label: "Type", value: "Scatter / XY" },
            {
              label: "Series",
              value: (
                <>
                  <Swatch color={COLORS.blue3} label="Coastal" />
                  <Swatch color={COLORS.orange3} label="Inland" />
                </>
              ),
            },
            { label: "Axes", value: "Income (k) × Cost (k)" },
            { label: "Point size", value: "60" },
          ]}
        />
      </div>
    </Section>
  );
}
