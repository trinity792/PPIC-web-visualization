/* global process */

import React from "react";

import VisualizationWizard, {
  DEFAULT_STEPS,
} from "@/components/chart-builder/wizard/VisualizationWizard";
import { getDefaultQuestion } from "@/lib/visualization/defaultQuestions";
import { BYOD_SCHEMA } from "@/lib/visualization/moduleRegistry";
import VisualizationV3FlowFixture from "@/app/%5F%5Fvisual/visualization-v3/visualization-v3-flow-fixture";

export const metadata = {
  title: "Visualization Tool | PPIC Data Explorer",
};

export default async function VisualizationToolPage({ searchParams }) {
  if (process.env.VISUALIZATION_V3_TEST_FIXTURE === "1") {
    return <VisualizationV3FlowFixture />;
  }
  const query = await searchParams;
  // Standalone bring-your-own-data editor: the byod schema has no server
  // dataset, so start on an empty inline v3 question — the Import step fills
  // in the table, and the store maps its columns onto the chart's roles.
  const initialConfig = getDefaultQuestion(BYOD_SCHEMA.id);

  return (
    <VisualizationWizard
      schema={BYOD_SCHEMA}
      initialConfig={initialConfig}
      steps={DEFAULT_STEPS}
      viewId={query?.view || null}
      embedded={query?.embed === "1"}
    />
  );
}
