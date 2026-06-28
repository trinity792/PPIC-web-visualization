/**
 * Category dashboard registry: maps a category id to the dashboard component that
 * renders its landing-page tiles. Adding a new category means adding a dashboard
 * component here (plus its entry in lib/visualization/categoryRegistry.js).
 */
import PopulationHousingDashboard from "./PopulationHousingDashboard";

export const DASHBOARDS = Object.freeze({
  "population-housing": PopulationHousingDashboard,
});

export function getDashboard(categoryId) {
  return DASHBOARDS[categoryId];
}
