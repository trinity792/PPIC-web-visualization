/**
 * GET /api/module-status?module=<schemaId>
 *
 * Returns a module's freshness for the editor: the timestamp of the newest
 * pipeline run that completed and wrote data (severity "success" or "recovered").
 * The Export step uses it to show "Data last updated: …" in Pacific time.
 *
 * The front-end schema id and the pipeline log module id mostly match; where they
 * diverge (projections), LOG_MODULE_BY_SCHEMA maps between them.
 */

import { getLatestSuccessfulRun } from "@/lib/logs/logs";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";

// Front-end module (schema) id → pipeline log module id.
const LOG_MODULE_BY_SCHEMA = {
  pophousing: "pophousing",
  "components-of-change": "components-of-change",
  "demographic-projections": "projections",
  "housing-stress": "housing-stress",
  "building-permits": "building-permits",
  "rhna-progress": "rhna-progress",
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const moduleId = searchParams.get("module");
  const schema = getModuleSchema(moduleId);
  if (!schema) {
    return Response.json(
      { error: "Unknown or missing 'module'." },
      { status: 404 },
    );
  }

  const logModule = LOG_MODULE_BY_SCHEMA[moduleId] || moduleId;
  const run = getLatestSuccessfulRun(logModule);
  return Response.json({
    module: moduleId,
    moduleLabel: schema.label,
    lastUpdated: run?.timestamp ?? null,
  });
}
