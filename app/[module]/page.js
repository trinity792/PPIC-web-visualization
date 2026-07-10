/* eslint-disable react/prop-types */
import React from "react";
import { notFound } from "next/navigation";
import ModuleEditor from "@/components/chart-builder/ModuleEditor";
import { UnderConstruction } from "@/components/ui/under-construction";
import { getBuiltInView } from "@/lib/visualization/categoryRegistry";
import {
  getModuleSchema,
  MODULE_IDS,
} from "@/lib/visualization/moduleRegistry";

export function generateStaticParams() {
  return MODULE_IDS.map((module) => ({ module }));
}

export async function generateMetadata({ params }) {
  const { module } = await params;
  const schema = getModuleSchema(module);
  return {
    title: schema ? `${schema.label} | PPIC Data Explorer` : "PPIC Data Explorer",
  };
}

export default async function DetailedModulePage({ params, searchParams }) {
  const { module } = await params;
  const query = await searchParams;
  const schema = getModuleSchema(module);
  if (!schema) notFound();

  // Modules whose editor presets aren't built yet render a placeholder instead
  // of the chart editor (which would otherwise error). See schema flag.
  if (schema.underConstruction) {
    return (
      <UnderConstruction
        title={schema.label}
        message="This module is under construction. Check back soon."
      />
    );
  }

  const viewId = query.view || null;
  const builtIn = viewId ? getBuiltInView(viewId) : null;
  const initialConfig =
    builtIn?.module === module ? builtIn : { module: schema.id };

  return (
    <ModuleEditor
      moduleId={module}
      initialConfig={initialConfig}
      viewId={viewId}
      hasBuiltInView={Boolean(builtIn?.module === module)}
      embedded={query.embed === "1"}
    />
  );
}
