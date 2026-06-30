"use client";
/* eslint-disable react/prop-types */
import React from "react";
import { ArrowRight } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Section } from "./Section";
import { COLORS } from "@/lib/constants";

const stats = [
  { label: "Median House Cost", value: "873.5k" },
  { label: "Total State Population", value: "39.5M" },
  { label: "Median Household Size", value: "2.9" },
];

const trend = [
  { year: "2018", housing: 14.1, population: 39.4 },
  { year: "2019", housing: 14.2, population: 39.5 },
  { year: "2020", housing: 14.3, population: 39.5 },
  { year: "2021", housing: 14.4, population: 39.2 },
  { year: "2022", housing: 14.5, population: 39.0 },
  { year: "2023", housing: 14.6, population: 38.9 },
  { year: "2024", housing: 14.7, population: 39.1 },
  { year: "2025", housing: 14.8, population: 39.3 },
  { year: "2026", housing: 14.9, population: 39.5 },
];

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl bg-ppic-card px-7 py-8 text-center shadow-[0px_4px_4px_0px_rgba(0,0,0,0.12)]">
      <p className="text-[18px] text-neutral-700" style={{ fontFamily: "var(--font-heading)" }}>
        {label}
      </p>
      <p className="mt-2 text-neutral-900" style={{ fontFamily: "var(--font-serif)", fontSize: 56, lineHeight: 1 }}>
        {value}
      </p>
    </div>
  );
}

function SeeMore() {
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-full border px-4 py-1 text-[13px] hover:brightness-95"
      style={{
        backgroundColor: "var(--ppic-blue-50)",
        borderColor: "#000",
        color: "#0d0d0d",
        fontFamily: "var(--font-heading)",
      }}
    >
      See More <ArrowRight className="size-3.5" />
    </button>
  );
}

export function CardsShowcase() {
  return (
    <Section
      id="cards"
      eyebrow="Components"
      title="Cards & Charts"
      description="Big-number stat cards surface headline figures, while chart cards pair a Georgia title, a 'See More' pill, and a data visualization built on the blue/orange data colors."
    >
      <div className="grid gap-5 sm:grid-cols-3">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <div className="mt-6 rounded-2xl border bg-white p-6 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)]" style={{ borderColor: "var(--ppic-border)" }}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-neutral-900" style={{ fontFamily: "var(--font-serif)", fontSize: 24 }}>
              Population & Housing Trends
            </h3>
            <div className="mt-2 flex items-center gap-5 text-[13px] text-neutral-600" style={{ fontFamily: "var(--font-sans)" }}>
              <span className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-5 rounded-full" style={{ backgroundColor: "var(--ppic-orange-300)" }} />
                Total Housing Units
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-5 rounded-full" style={{ backgroundColor: "var(--ppic-blue-400)" }} />
                Total Population
              </span>
            </div>
          </div>
          <SeeMore />
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="#D1D1D1" strokeDasharray="0" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 12, fontFamily: "Inter" }} tickLine={false} axisLine={{ stroke: "#A1A1A1" }} />
              <YAxis
                yAxisId="housing"
                domain={[14, 15]}
                tick={{ fontSize: 12, fontFamily: "Inter", fill: COLORS.orange3 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <YAxis
                yAxisId="population"
                orientation="right"
                domain={[38.5, 40]}
                tick={{ fontSize: 12, fontFamily: "Inter", fill: COLORS.blue5 }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: `1px solid ${COLORS.gray2}`, fontFamily: "Inter", fontSize: 13 }}
              />
              <Area yAxisId="housing" type="monotone" dataKey="housing" stroke={COLORS.orange3} strokeWidth={2} fill={COLORS.orange2} fillOpacity={0.4} />
              <Area yAxisId="population" type="monotone" dataKey="population" stroke={COLORS.blue5} strokeWidth={2} fill={COLORS.blue2} fillOpacity={0.4} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}
