import React from "react";
import { ColorPalette } from "@/components/ui-kit/ColorPalette";
import { TypographyShowcase } from "@/components/ui-kit/TypographyShowcase";
import { ButtonsShowcase } from "@/components/ui-kit/ButtonsShowcase";
import { FormControls } from "@/components/ui-kit/FormControls";
import { CardsShowcase } from "@/components/ui-kit/CardsShowcase";
import { GraphsShowcase } from "@/components/ui-kit/GraphsShowcase";
import { PatternsShowcase } from "@/components/ui-kit/PatternsShowcase";

export const metadata = {
  title: "UI Kit · PPIC Data Explorer",
  description:
    "The shared design system behind PPIC's population and housing dashboards — color, type, buttons, controls, cards, and editor patterns.",
};

const toc = [
  { id: "color", label: "Color" },
  { id: "type", label: "Typography" },
  { id: "buttons", label: "Buttons" },
  { id: "forms", label: "Form & Controls" },
  { id: "cards", label: "Cards & Charts" },
  { id: "graphs", label: "Example Graphs" },
  { id: "patterns", label: "Patterns" },
];

export default function UiKitPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--ppic-surface)" }}>
      {/* Hero */}
      <div className="border-b" style={{ borderColor: "var(--ppic-border)" }}>
        <div className="mx-auto max-w-[1600px] px-6 py-12">
          <p
            className="mb-2 text-[13px] uppercase tracking-[0.24em]"
            style={{ fontFamily: "var(--font-sans)", color: "var(--ppic-orange-300)" }}
          >
            Design System
          </p>
          <h1
            className="max-w-3xl text-neutral-900"
            style={{ fontFamily: "var(--font-serif)", fontSize: 52, lineHeight: 1.1 }}
          >
            PPIC Data Visualization UI Kit
          </h1>
          <p
            className="mt-4 max-w-2xl text-[17px] leading-relaxed text-neutral-600"
            style={{ fontFamily: "var(--font-body)" }}
          >
            The shared foundations and components behind California&apos;s population and
            housing dashboards — color, type, buttons, controls, cards, and editor
            patterns in one reference.
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-[1600px] gap-10 px-6 py-12 lg:grid lg:grid-cols-[200px_1fr]">
        {/* TOC */}
        <aside className="hidden lg:block">
          <nav className="sticky top-28 space-y-1">
            <p
              className="mb-3 text-[12px] uppercase tracking-[0.18em] text-neutral-500"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Contents
            </p>
            {toc.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="block rounded-lg px-3 py-1.5 text-[15px] text-neutral-700 transition-colors hover:bg-white hover:text-[var(--ppic-orange-300)]"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {t.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 space-y-16">
          <ColorPalette />
          <TypographyShowcase />
          <ButtonsShowcase />
          <FormControls />
          <CardsShowcase />
          <GraphsShowcase />
          <PatternsShowcase />
        </main>
      </div>

      <footer
        className="border-t py-8 text-center text-[13px] text-neutral-500"
        style={{ borderColor: "var(--ppic-border)", fontFamily: "var(--font-sans)" }}
      >
        Public Policy Institute of California · UI Kit
      </footer>
    </div>
  );
}
