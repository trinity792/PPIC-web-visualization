/**
 * Client-safe JS mirror of the shared California CBSA-metro geography.
 *
 * This is the JavaScript counterpart of
 * `scripts/shared/geography/california_geography.py` (which owns the canonical
 * source). It is duplicated here — rather than derived at runtime — so the
 * frontend never imports Python; the two must be kept in sync. The metro→region
 * grouping is composed from whole-county membership: every CA CBSA is a union of
 * whole counties that nest within exactly one of the 9 shared regions (the San
 * Jose CBSA's rural San Benito county is folded into Santa Clara so it nests in
 * the Bay Area).
 *
 * To regenerate after a Python change:
 *   .venv/bin/python -c "import json; from scripts.shared.geography.california_geography \
 *     import get_california_geography as g; d=g(); \
 *     print(json.dumps(d['metro_to_region_mapping'], indent=2))"
 */

/** Metro display name → whole member counties (used to broadcast values onto county polygons). */
export const METRO_TO_COUNTIES = Object.freeze({
  Bakersfield: ["Kern"],
  Chico: ["Butte"],
  "El Centro": ["Imperial"],
  Fresno: ["Fresno"],
  Hanford: ["Kings"],
  "Inland Empire": ["San Bernardino", "Riverside"],
  "Los Angeles": ["Los Angeles", "Orange"],
  Madera: ["Madera"],
  Merced: ["Merced"],
  Modesto: ["Stanislaus"],
  Napa: ["Napa"],
  Redding: ["Shasta"],
  Sacramento: ["Sacramento", "El Dorado", "Placer", "Yolo"],
  Salinas: ["Monterey"],
  "San Diego": ["San Diego"],
  "San Francisco": ["San Francisco", "Alameda", "Marin", "Contra Costa", "San Mateo"],
  "San Jose": ["Santa Clara"],
  "San Luis Obispo": ["San Luis Obispo"],
  "Santa Barbara": ["Santa Barbara"],
  "Santa Cruz": ["Santa Cruz"],
  "Santa Rosa": ["Sonoma"],
  Stockton: ["San Joaquin"],
  Vallejo: ["Solano"],
  Ventura: ["Ventura"],
  Visalia: ["Tulare"],
  "Yuba City": ["Sutter", "Yuba"],
});

/** Metro display name → the single shared region it aggregates into. */
export const METRO_TO_REGION = Object.freeze({
  Bakersfield: "South San Joaquin Valley",
  Chico: "Far North",
  "El Centro": "San Diego (Regional)",
  Fresno: "South San Joaquin Valley",
  Hanford: "South San Joaquin Valley",
  "Inland Empire": "Inland Empire",
  "Los Angeles": "Los Angeles (Regional)",
  Madera: "South San Joaquin Valley",
  Merced: "North San Joaquin Valley",
  Modesto: "North San Joaquin Valley",
  Napa: "Bay Area",
  Redding: "Far North",
  Sacramento: "Sacramento (Regional)",
  Salinas: "Central Coast",
  "San Diego": "San Diego (Regional)",
  "San Francisco": "Bay Area",
  "San Jose": "Bay Area",
  "San Luis Obispo": "Central Coast",
  "Santa Barbara": "Central Coast",
  "Santa Cruz": "Central Coast",
  "Santa Rosa": "Bay Area",
  Stockton: "North San Joaquin Valley",
  Vallejo: "Bay Area",
  Ventura: "Los Angeles (Regional)",
  Visalia: "South San Joaquin Valley",
  "Yuba City": "Far North",
});

/** The 26 canonical CA CBSA metro display names. */
export const CBSA_METROS = Object.freeze(Object.keys(METRO_TO_REGION).sort());

/** The 9 shared region names that metros aggregate into. */
export const REGION_NAMES = Object.freeze([...new Set(Object.values(METRO_TO_REGION))].sort());

/** Region name → the member metros summed to form its aggregate. */
export const REGION_TO_METROS = Object.freeze(
  REGION_NAMES.reduce((accumulator, region) => {
    accumulator[region] = Object.entries(METRO_TO_REGION)
      .filter(([, metroRegion]) => metroRegion === region)
      .map(([metro]) => metro)
      .sort();
    return accumulator;
  }, {}),
);
