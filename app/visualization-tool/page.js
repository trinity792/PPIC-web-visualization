import React from "react";

import VisualizationWizard, {
  DEFAULT_STEPS,
} from "@/components/chart-builder/wizard/VisualizationWizard";
import { BYOD_SCHEMA } from "@/lib/visualization/moduleRegistry";

export const metadata = {
  title: "Visualization Tool | PPIC Data Explorer",
};

export default function VisualizationToolPage() {
  // Standalone bring-your-own-data editor: the byod schema has no server
  // dataset, so start in the inline data source with an empty table — the
  // Import step populates it from a paste or upload.
  const initialConfig = { module: BYOD_SCHEMA.id, data: { source: "inline" } };

  return (
    <VisualizationWizard
      schema={BYOD_SCHEMA}
      initialConfig={initialConfig}
      steps={DEFAULT_STEPS}
    />
  );
}
