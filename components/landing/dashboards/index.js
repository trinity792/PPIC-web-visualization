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
import RHNAProgressDashboard from "@/components/landing/dashboards/RHNAProgressDashboard";

export const DASHBOARDS = Object.freeze({
  "population-housing": PopulationHousingDashboard,
  "rhna-progress": RHNAProgressDashboard,
});

export function getDashboard(categoryId) {
  return DASHBOARDS[categoryId];
}
