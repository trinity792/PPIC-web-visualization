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
  getModuleSchema,
} from "@/lib/visualization/moduleRegistry";
import {
  TOPICS,
  getTopicHref,
  getTopicLabel,
} from "@/lib/visualization/topicRegistry";

const EXPECTED_TOPICS = [
  {
    id: "pophousing",
    title: "People & housing units",
    href: "/pophousing",
  },
  {
    id: "components-of-change",
    title: "Births, deaths & migration",
    href: "/components-of-change",
  },
  {
    id: "demographic-projections",
    title: "Demographic projections",
    href: "/demographic-projections",
  },
  {
    id: "housing-stress",
    title: "Housing cost burden",
    href: "/housing-stress",
  },
  {
    id: "building-permits",
    title: "Residential permits",
    href: "/building-permits",
  },
  {
    id: "rhna-progress",
    title: "Housing goal tracking",
    href: "/rhna-progress",
  },
];

describe("landing-page topic registry", () => {
  it("lists the six built topics in mockup order", () => {
    expect(
      TOPICS.map((topic) => ({
        id: topic.id,
        title: topic.title,
        href: getTopicHref(topic),
      })),
    ).toEqual(EXPECTED_TOPICS);
  });

  it("derives a route for every topic that resolves to a registered module", () => {
    for (const topic of TOPICS) {
      expect(topic).not.toHaveProperty("href");
      expect(MODULE_IDS).toContain(getTopicHref(topic).slice(1));
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
});
