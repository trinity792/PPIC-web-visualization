import React from "react";
import { notFound } from "next/navigation";
import ModuleWorkbench from "@/components/chart-builder/workbench/ModuleWorkbench";
import { UnderConstruction } from "@/components/ui/under-construction";
import { getBuiltInView } from "@/lib/visualization/builtInViews";
import { getDefaultQuestion } from "@/lib/visualization/defaultQuestions";
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
  const hasBuiltInView = Boolean(builtIn && builtIn.question.dataset.moduleId === module);
  // Every module opens on its v3 default question (an unanswered one: the
  // workbench never chooses a setting for the reader). A built-in deep link
  // is a complete v3 spec for this module and replaces it outright.
  const initialConfig = hasBuiltInView ? builtIn : getDefaultQuestion(module);
  if (!initialConfig) notFound();

  return (
    <ModuleWorkbench
      schema={schema}
      initialConfig={initialConfig}
      viewId={viewId}
      hasBuiltInView={hasBuiltInView}
      embedded={query.embed === "1"}
    />
  );
}
