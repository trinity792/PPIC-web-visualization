/**
 * DataTablesShowcase.js — the guide's data-table guidance and a rendered example
 * following its alignment, divider, and header rules.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Official PPIC Data Visualization Style Guide v1.0 (Data Tables, p.30)
 *
 * UI Kit reference:
 *   - Documents the "Data Tables" component
 */

import React from "react";

import { Section } from "@/components/ui-kit/Section";

const RULES = [
  "Right-align numeric columns; left-align text columns; align headers to their content.",
  "Line spacing of 115% for entries.",
  "1px vertical (row divider) lines only, hex #EFF0F2.",
  "One color for the header row.",
  "Tables don't always need an eyebrow figure heading.",
];

// Example modeled on the guide's "Approval of State Elected Officials" table.
const ROWS = [
  { group: null, label: "All Adults", cols: ["57%", "41%", "3%"], head: true },
  { group: null, label: "Likely voters", cols: ["58", "40", "1"] },
  { group: "Party", label: "Democrats", cols: ["79", "19", "2"] },
  { group: null, label: "Republicans", cols: ["22", "78", "—"] },
  { group: null, label: "Independents", cols: ["52", "42", "6"] },
  { group: "Region", label: "Central Valley", cols: ["46", "50", "4"] },
  { group: null, label: "Los Angeles", cols: ["64", "35", "1"] },
  { group: null, label: "SF Bay Area", cols: ["62", "35", "3"] },
];

export function DataTablesShowcase() {
  return (
    <Section
      id="tables"
      eyebrow="Charts"
      title="Data Tables"
      description="Use a table when readers need to find the row that applies to them — their location, age, or income — or to compare data in two or more directions, often faster than a chart can."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <ul className="space-y-2.5">
          {RULES.map((rule) => (
            <li
              key={rule}
              className="flex gap-2.5 font-body text-[14px] leading-relaxed text-neutral-800"
            >
              <span aria-hidden="true" className="mt-[3px] text-ppic-brand">
                •
              </span>
              {rule}
            </li>
          ))}
        </ul>

        <div className="overflow-hidden rounded-2xl border border-ppic-border bg-white shadow-[0_4px_4px_rgba(0,0,0,0.06)]">
          <div className="border-b border-ppic-border px-5 py-3">
            <h3 className="font-heading text-[15px] font-semibold text-neutral-900">
              Approval of State Elected Officials and Policy Direction
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse text-neutral-800"
              style={{ lineHeight: 1.15 }}
            >
              <thead>
                <tr className="text-neutral-500">
                  <th className="px-5 py-2.5 text-left font-sans text-[13px] font-semibold" />
                  <th className="px-5 py-2.5 text-left font-sans text-[13px] font-semibold" />
                  <th className="px-3 py-2.5 text-right font-sans text-[13px] font-semibold">
                    Approve
                  </th>
                  <th className="px-3 py-2.5 text-right font-sans text-[13px] font-semibold">
                    Disapprove
                  </th>
                  <th className="px-5 py-2.5 text-right font-sans text-[13px] font-semibold">
                    Don&apos;t know
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr
                    key={row.label}
                    className="border-t"
                    style={{
                      borderColor: "#EFF0F2",
                      backgroundColor: row.head ? "#EAF3EE" : "transparent",
                    }}
                  >
                    <td className="px-5 py-2.5 font-sans text-[13px] text-neutral-500">
                      {row.group || ""}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[13px]">{row.label}</td>
                    {row.cols.map((c, j) => (
                      <td
                        key={j}
                        className={`py-2.5 text-right font-sans text-[13px] tabular-nums ${
                          j === row.cols.length - 1 ? "px-5" : "px-3"
                        }`}
                      >
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Section>
  );
}
