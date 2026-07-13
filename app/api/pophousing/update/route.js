/**
 * POST /api/pophousing/update — trigger a Population & Housing data refresh.
 *
 * Runs the full Python pipeline (scrape the latest DoF E-5 → rewrite
 * PopHousing_Current.csv) in the background and returns immediately. The
 * pipeline writes its own run record to logs/pipeline-runs.jsonl via
 * execute_pipeline_run, so the outcome (success / recovered / error) surfaces on
 * the /logs page without this route waiting for it (refactor guide A2).
 *
 * The command is fixed and takes no request input, so there is no injection
 * surface. It does execute a server-side process, so in a shared deployment this
 * route should sit behind auth. A single-process module-level lock prevents a
 * double-click from launching two concurrent runs.
 *
 * GET /api/pophousing/update — report whether a refresh is currently running.
 */

/* global process */
import { spawn } from "node:child_process";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The default venv directory name is assembled from parts rather than written as
// a literal on purpose: a literal ".venv/bin/python" makes the bundler try to
// trace the venv's python symlink (which points out of the project root) and fail
// the build. Overridable with PIPELINE_PYTHON_BIN / PIPELINE_VENV elsewhere.
const DEFAULT_VENV = process.env.PIPELINE_VENV || [".", "venv"].join("");
const PYTHON_BIN =
  process.env.PIPELINE_PYTHON_BIN ||
  path.join(process.cwd(), DEFAULT_VENV, "bin", "python");
const PIPELINE_MODULE = "scripts.orchestrators.pophousing_pipeline";

// Single-process guard: `next start` runs one Node process, so this prevents a
// second run from being launched while one is in flight.
let isRunning = false;

export async function GET() {
  return Response.json({ running: isRunning });
}

export async function POST() {
  if (isRunning) {
    return Response.json(
      { started: false, running: true, message: "A data refresh is already in progress." },
      { status: 409 },
    );
  }

  let child;
  try {
    child = spawn(PYTHON_BIN, ["-m", PIPELINE_MODULE], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
    });
  } catch (error) {
    return Response.json(
      { started: false, error: error.message, source: "pophousing update: spawn" },
      { status: 500 },
    );
  }

  isRunning = true;
  child.on("error", () => {
    isRunning = false;
  });
  child.on("exit", () => {
    isRunning = false;
  });
  // Let the pipeline outlive this request/response cycle.
  child.unref();

  return Response.json(
    {
      started: true,
      running: true,
      message: "Data refresh started. Track progress on the Logs page.",
    },
    { status: 202 },
  );
}
