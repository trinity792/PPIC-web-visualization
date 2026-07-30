"use client";

/**
 * CategoriesSection.js — ordering, visibility, and ranking for values that are
 * not places.
 *
 * The fallback half of decision 3. When a chart's categories *are* places,
 * `GeographySection` owns these controls and shows them inline with the location
 * list. When they are not — a pie of housing types, a heatmap of age groups, any
 * bring-your-own-data table — they live here instead, behind a collapsed
 * disclosure so the sidebar's default state stays close to the mockup.
 *
 * Categories come from `config.categoryNames`, which the preview writes back
 * after each load, so the list always names what the chart actually drew.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Chart configuration from ChartConfigProvider
 *
 * UI Kit reference:
 *   - Implements the disclosure and draggable list-row patterns
 */

import React, { useState } from "react";

import { ChevronDown } from "lucide-react";

import { cn } from "@/components/ui/utils";

import { useAdvancedMode } from "@/components/chart-builder/advancedMode";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import {
  CategoryList,
  RankingControls,
  orderedCategories,
} from "@/components/chart-builder/sections/categoryControls";

// Matches the row count the standalone comparison panel used before the split.
const COLLAPSED_CATEGORY_COUNT = 5;

/** Only worth rendering once a load has reported what the chart drew. */
export function hasCategories(config) {
  return (config?.categoryNames || []).length > 0;
}

export default function CategoriesSection() {
  const { config, dispatch } = useChartConfig();
  const { advanced } = useAdvancedMode();
  const [open, setOpen] = useState(false);

  const names = orderedCategories(
    config.categoryNames || [],
    config.appearance?.categoryOrder,
  );

  return (
    <div className="grid gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-left text-sm font-medium"
      >
        Categories
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="grid gap-3">
          <p className="text-xs text-muted-foreground">
            Drag rows to reorder them, and use each switch to show or hide a value.
          </p>
          <CategoryList
            names={names}
            collapsed={COLLAPSED_CATEGORY_COUNT}
            reorderable
            hidden={config.appearance?.hiddenCategories || []}
            onReorder={(value) =>
              dispatch({ type: "SET_APPEARANCE", key: "categoryOrder", value })
            }
            onVisibility={(value) =>
              dispatch({ type: "SET_APPEARANCE", key: "hiddenCategories", value })
            }
          />
          {/* Ranked values is the one block behind Advanced Mode: ordering and
              visibility answer "which values, in what order", and Top/Bottom N
              re-issues that whole arrangement from the data. */}
          {advanced ? (
            <RankingControls
              idPrefix="categories-ranking"
              topN={config.filters?.topN ?? 20}
              sort={config.appearance?.sort || "value"}
              onChange={({ topN, sort }) => dispatch({ type: "SET_RANKING", topN, sort })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
