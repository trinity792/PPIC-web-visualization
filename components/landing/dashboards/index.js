/**
 * index.js — category-to-dashboard component registry for the landing page.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Category identifiers from lib/visualization/categoryRegistry.js
 *
 * UI Kit reference:
 *   - None — registry utility that does not render UI
 */

import PopulationHousingDashboard from "@/components/landing/dashboards/PopulationHousingDashboard";

export const DASHBOARDS = Object.freeze({
  "population-housing": PopulationHousingDashboard,
});

export function getDashboard(categoryId) {
  return DASHBOARDS[categoryId];
}
