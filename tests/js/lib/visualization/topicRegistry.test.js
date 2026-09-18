/**
 * Contract tests for the landing-page topic directory registry.
 *
 * The expected ids, titles, and routes are deliberately written here rather
 * than inferred from the registry. That lets the suite catch ordering, copy,
 * and route regressions instead of restating whatever production declared.
 */

import { describe, expect, it } from "vitest";

import { COLORS } from "@/lib/constants";
import {
  MODULE_IDS,
  MODULE_SCHEMAS,
  getModuleSchema,
} from "@/lib/visualization/moduleRegistry";
import { calculationOptionsFor } from "@/lib/data/visualization/calculationRegistry";
import { FIELD_KINDS, UNITS } from "@/lib/visualization/fieldTypes";
import {
  TOPICS,
  getTopicDocumentationHref,
  getTopicHref,
  getTopicLabel,
} from "@/lib/visualization/topicRegistry";

const EXPECTED_TOPICS = [
  {
    id: "pophousing",
    title: "People & housing units",
    href: "/pophousing",
    documentationHref: "/documents/pophousing-pipeline-refractor",
  },
  {
    id: "components-of-change",
    title: "Births, deaths & migration",
    href: "/components-of-change",
    documentationHref: "/documents/components-of-change-refractor",
  },
  {
    id: "demographic-projections",
    title: "Demographic projections",
    href: "/demographic-projections",
    documentationHref: "/documents/age-sex-race-projections-refractor",
  },
  {
    id: "housing-stress",
    title: "Housing cost burden",
    href: "/housing-stress",
    documentationHref: "/documents/acs-housing-stress-refractor",
  },
  {
    id: "building-permits",
    title: "Residential permits",
    href: "/building-permits",
    documentationHref: "/documents/building-permits-refractor",
  },
  {
    id: "rhna-progress",
    title: "Housing goal tracking",
    href: "/rhna-progress",
    documentationHref: "/documents/rhna-progress-report-module",
  },
];

describe("landing-page topic registry", () => {
  it("lists the six built topics in mockup order", () => {
    expect(
      TOPICS.map((topic) => ({
        id: topic.id,
        title: topic.title,
        href: getTopicHref(topic),
        documentationHref: getTopicDocumentationHref(topic.id),
      })),
    ).toEqual(EXPECTED_TOPICS);
  });

  it("provides an editor route for every registered topic", () => {
    for (const topic of TOPICS) {
      expect(topic).not.toHaveProperty("href");
      expect(MODULE_IDS).toContain(topic.id);
      expect(getTopicHref(topic)).toMatch(/^\//);
    }
  });

  it("does not expose the mockup's /projections path", () => {
    expect(TOPICS.map(getTopicHref)).not.toContain("/projections");
  });

  it("takes each display label from the module schema", () => {
    for (const topic of TOPICS) {
      expect(topic).not.toHaveProperty("label");
      expect(getTopicLabel(topic)).toBe(getModuleSchema(topic.id).label);
    }
  });

  it("gives every topic a non-empty title and description", () => {
    for (const topic of TOPICS) {
      expect(topic.title.trim()).not.toBe("");
      expect(topic.description.trim()).not.toBe("");
    }
  });

  it("gives every topic an accent that exists in COLORS", () => {
    const projectColors = Object.values(COLORS);

    for (const topic of TOPICS) {
      expect(projectColors).toContain(topic.accent);
    }
  });

  it("excludes the retired coming-soon categories", () => {
    const ids = TOPICS.map((topic) => topic.id);

    expect(ids).not.toContain("economics");
    expect(ids).not.toContain("state-law");
    expect(ids).not.toContain("climate");
  });

  it("offers percentage-point change for every percentage and rate topic outcome", () => {
    const rateUnits = new Set([UNITS.PERCENT, UNITS.RATE_PER_THOUSAND]);

    for (const schema of Object.values(MODULE_SCHEMAS)) {
      for (const [id, field] of Object.entries(schema.fields || {})) {
        if (field.kind !== FIELD_KINDS.MEASURE || !rateUnits.has(field.unit)) continue;
        const options = calculationOptionsFor(
          { id, ...field },
          { chartType: "line" },
        );
        expect(options, `${schema.id}: ${id}`).toContain("percentagePointChange");
        expect(options, `${schema.id}: ${id}`).not.toContain("percentChange");
      }
    }
  });
});
