/* global process */

import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import ModuleWorkbench from "@/components/chart-builder/workbench/ModuleWorkbench";
import {
  V3_REVIEW_MODULE_IDS,
  getV3DevelopmentReviewSpec,
  isV3DevelopmentReviewEnabled,
} from "@/lib/visualization/developmentReview";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";

export const metadata = {
  title: "Visualization v3 Review | PPIC Data Explorer",
};

export const dynamic = "force-dynamic";

export default async function VisualizationV3ReviewPage({ searchParams }) {
  if (!isV3DevelopmentReviewEnabled(process.env)) notFound();

  const query = await searchParams;
  const requested = query?.module;
  const moduleId = V3_REVIEW_MODULE_IDS.includes(requested)
    ? requested
    : V3_REVIEW_MODULE_IDS[0];
  const schema = getModuleSchema(moduleId);
  const initialConfig = getV3DevelopmentReviewSpec(moduleId);
  if (!schema || !initialConfig) notFound();

  return (
    <>
      <aside className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="page-container flex flex-wrap items-center justify-between gap-3">
          <p>
            <strong>New visualization editor:</strong> the selected topics now
            open in this editor. The previous editor remains available for
            comparison.{" "}
            <Link
              href={`/${moduleId}`}
              className="font-medium underline underline-offset-2"
            >
              Open the previous editor
            </Link>
            .
          </p>
          <nav aria-label="New editor topics" className="flex flex-wrap gap-2">
            {V3_REVIEW_MODULE_IDS.map((id) => {
              const option = getModuleSchema(id);
              const active = id === moduleId;
              return (
                <Link
                  key={id}
                  href={`/visualization-v3-review?module=${id}`}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded-full bg-amber-900 px-3 py-1 font-medium text-white"
                      : "rounded-full border border-amber-700 px-3 py-1 font-medium text-amber-950"
                  }
                >
                  {option.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <ModuleWorkbench
        schema={schema}
        initialConfig={initialConfig}
        deferInitialRender={false}
      />
    </>
  );
}
