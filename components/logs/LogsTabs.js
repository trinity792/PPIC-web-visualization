"use client";

/**
 * LogsTabs.js — page shell for /logs: shared header plus Pipeline Logs / Changelog tabs.
 *
 * Owns the hero band (title + subtitle) and the two-tab switcher that used to be
 * folded into LogsBrowser. The Pipeline Logs tab renders LogsBrowser (pipeline run
 * records); the Changelog tab renders ChangelogBrowser (curated changes derived
 * from commit history). Pipeline Logs is the default tab. Each browser owns its own
 * filter/sort state, so tab state lives here and the data arrives as prop bundles.
 *
 * Props:
 *   logProps       {Object} — { entries, modules, severities } for LogsBrowser
 *   changelogProps {Object} — { entries, areas, intensities } for ChangelogBrowser
 *
 * UI Kit reference:
 *   - Reuses the shared "Tabs" pattern (@/components/ui/tabs).
 */

/* eslint-disable react/prop-types */

import React from "react";

import ChangelogBrowser from "./ChangelogBrowser";
import LogsBrowser from "./LogsBrowser";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LogsTabs({ logProps, changelogProps }) {
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--background)" }}>
      {/* Hero band */}
      <section
        className="w-full border-b"
        style={{ background: "var(--ppic-surface)", borderColor: "var(--ppic-border)" }}
      >
        <div className="page-container px-6 py-14 text-center">
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 44,
              fontWeight: 400,
              lineHeight: 1.15,
              color: "var(--ppic-ink, #0d0d0d)",
            }}
          >
            Logs
          </h1>
          <p
            className="mx-auto mt-3 max-w-xl"
            style={{ color: "var(--ppic-neutral-400)", fontFamily: "var(--font-sans)" }}
          >
            Two histories in one place: the pipeline run logs — what succeeded, fell back to
            saved data, or failed — and a changelog of what changed in the tool, where, and why.
          </p>
        </div>
      </section>

      {/* Tabs */}
      <Tabs defaultValue="pipeline" className="w-full">
        <div className="page-container flex justify-center px-6 pt-8">
          <TabsList aria-label="Logs view">
            <TabsTrigger value="pipeline">Pipeline Logs</TabsTrigger>
            <TabsTrigger value="changelog">Changelog</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="pipeline">
          <LogsBrowser
            entries={logProps.entries}
            modules={logProps.modules}
            severities={logProps.severities}
          />
        </TabsContent>

        <TabsContent value="changelog">
          <ChangelogBrowser
            entries={changelogProps.entries}
            areas={changelogProps.areas}
            intensities={changelogProps.intensities}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
