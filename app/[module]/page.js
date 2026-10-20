import React from "react";
import { notFound } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ModuleWorkbench from "@/components/chart-builder/workbench/ModuleWorkbench";
import { UnderConstruction } from "@/components/ui/under-construction";
import { getBuiltInView } from "@/lib/visualization/builtInViews";
import { getDefaultQuestion } from "@/lib/visualization/defaultQuestions";
import {
  getModuleSchema,
  MODULE_IDS,
} from "@/lib/visualization/moduleRegistry";
import { TOPICS } from "@/lib/visualization/topicRegistry";

// ── Topic banner ─────────────────────────────────────────────────────

/**
 * Title + full topic description above the workbench, styled after the
 * Documents hero band. The landing card clamps the description to two lines;
 * this is where the reader gets the rest. Collapsing keeps the title as a
 * compact strip so the chart gets the room back. Uncontrolled (open on every
 * visit), so it stays a server render: the open/closed styling keys off the
 * data-state Radix puts on the root.
 */
function TopicBanner({ title, description }) {
  return (
    <Collapsible
      defaultOpen
      className="group/banner w-full border-b"
      style={{ background: "var(--ppic-surface)", borderColor: "var(--ppic-border)" }}
    >
      <section className="page-container px-6 py-10 text-center group-data-[state=closed]/banner:py-3">
        <h1
          className="font-serif text-[44px] leading-[1.15] font-normal group-data-[state=closed]/banner:text-2xl"
          style={{ color: "var(--ppic-ink, #0d0d0d)" }}
        >
          {title}
        </h1>
        {description ? (
          <>
            <CollapsibleContent>
              <p
                className="mx-auto mt-3 max-w-2xl"
                style={{ color: "var(--ppic-neutral-400)", fontFamily: "var(--font-sans)" }}
              >
                {description}
              </p>
            </CollapsibleContent>
            <CollapsibleTrigger className="mt-3 inline-flex items-center gap-1 text-sm text-ppic-neutral-main transition-colors hover:text-ppic-neutral-500 group-data-[state=closed]/banner:mt-1">
              <span className="group-data-[state=closed]/banner:hidden">Hide description</span>
              <span className="hidden group-data-[state=closed]/banner:inline">Show description</span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 rotate-180 transition-transform group-data-[state=closed]/banner:rotate-0"
              />
            </CollapsibleTrigger>
          </>
        ) : null}
      </section>
    </Collapsible>
  );
}

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

  const embedded = query.embed === "1";
  const topic = TOPICS.find((entry) => entry.id === module);

  return (
    <>
      {/* An iframe embed is the chart alone, so it gets no banner. */}
      {embedded ? null : (
        <TopicBanner title={schema.label} description={topic?.description} />
      )}
      <ModuleWorkbench
        schema={schema}
        initialConfig={initialConfig}
        viewId={viewId}
        hasBuiltInView={hasBuiltInView}
        embedded={embedded}
      />
    </>
  );
}
