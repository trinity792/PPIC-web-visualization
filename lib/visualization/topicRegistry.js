/**
 * Landing-page topic directory: the six built data topics, in display order.
 *
 * One entry per topic, carrying what the directory cannot derive: the card
 * headline, the card body, the accent color, and the topic's documentation
 * route. Editor routes and display names are NOT stored here — `getTopicHref`
 * derives the route from the module id, and `getTopicLabel` reads the name off
 * the module schema. Documentation routes are intentionally hardcoded here
 * until document/topic relationships are represented in document metadata.
 *
 * Accents reference `COLORS` in lib/constants.js rather than repeating hex
 * strings, so the palette stays single-owner. Icons live beside the card in
 * components/landing/topicIcons.js; this module stays JSX-free because the
 * Navbar and the landing page both import it.
 */

import { COLORS } from "@/lib/constants";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";

export const TOPICS = Object.freeze([
  Object.freeze({
    id: "pophousing",
    title: "People & housing units",
    description:
      "Annual counts of residents and housing units with city-level detail - how much a place has grown and whether its housing stock kept pace.",
    accent: COLORS.dataBlue,
    documentationHref: "/documents/pophousing-pipeline-refractor",
  }),
  Object.freeze({
    id: "components-of-change",
    title: "Births, deaths & migration",
    description:
      "Natural increase and net migration, split into domestic and foreign. Explains why a place grew or shrank, and benchmarks California against every other state.",
    accent: COLORS.officialGreen,
    documentationHref: "/documents/components-of-change-refractor",
  }),
  Object.freeze({
    id: "demographic-projections",
    title: "Demographic projections",
    description:
      "Population by 5-year age group, sex, and race/ethnicity out to 2070 - who a population is made of and how its composition is expected to shift.",
    accent: COLORS.officialViolet,
    documentationHref: "/documents/age-sex-race-projections-refractor",
  }),
  Object.freeze({
    id: "housing-stress",
    title: "Housing cost burden",
    description:
      "Households spending over 30% and 50% of income on housing, cut by tenure and race/ethnicity. The affordability measure of the set, built for equity comparisons.",
    accent: COLORS.officialRed,
    documentationHref: "/documents/acs-housing-stress-refractor",
  }),
  Object.freeze({
    id: "building-permits",
    title: "Residential permits",
    description:
      "Monthly residential permits by structure size - the leading indicator of new supply, best for reading recent turning points.",
    accent: COLORS.primaryOrange,
    documentationHref: "/documents/building-permits-refractor",
  }),
  Object.freeze({
    id: "rhna-progress",
    title: "Housing goal tracking",
    description:
      "Progress toward state housing targets for 539 jurisdictions across the 5th and 6th cycles, with PPIC pace and on-track scoring by income level.",
    accent: COLORS.dataTeal,
    documentationHref: "/documents/rhna-progress-report-module",
  }),
]);

/** Route into the topic's chart editor. Module ids are the route segment. */
export function getTopicHref(topic) {
  return `/${topic.id}`;
}

/** Public display name, owned by the module schema. */
export function getTopicLabel(topic) {
  return getModuleSchema(topic.id).label;
}

/** Hardcoded document route for a registered module id, or null if unknown. */
export function getTopicDocumentationHref(moduleId) {
  return TOPICS.find((topic) => topic.id === moduleId)?.documentationHref || null;
}

/**
 * Topics as `{href, label}` pairs for the navbar's Topic menu, in registry
 * order. The navbar previously kept its own copy of this list, which had
 * already drifted from the schema on one label.
 */
export function getTopicLinks() {
  return TOPICS.map((topic) => ({
    href: getTopicHref(topic),
    label: getTopicLabel(topic),
  }));
}
