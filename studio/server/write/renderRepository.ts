import "server-only";
// Render job persistence under the writable data root:
// renders/<renderId>/{job.json, props.json, output.mp4, render.log}.
// All path components are server-generated. Job status transitions are
// atomic; terminal statuses written by the worker are never overwritten.

import path from "node:path";
import fs from "node:fs/promises";
import { validateRenderJob, type RenderJobV1 } from "@/lib/renderDocument";
import { UUID_RE } from "@/lib/draftDocument";
import { ensureDataDir, WriteError } from "./dataRootPolicy";
import { readJsonOrNull, writeJsonAtomic, writeJsonExclusive } from "./atomicJson";

const invalidRenderId = (): WriteError =>
  new WriteError("invalid_id", "Render id is not valid.", 400);
const renderNotFound = (): WriteError =>
  new WriteError("not_found", "Render not found.", 404);

export async function renderDir(renderId: string): Promise<string> {
  if (!UUID_RE.test(renderId)) throw invalidRenderId();
  return ensureDataDir("renders", renderId);
}

export async function createRenderJob(job: RenderJobV1, props: unknown): Promise<void> {
  const dir = await renderDir(job.renderId);
  await writeJsonExclusive(dir, "job.json", job);
  await writeJsonExclusive(dir, "props.json", props);
}

export async function getRenderJob(renderId: string): Promise<RenderJobV1> {
  const dir = await renderDir(renderId);
  const raw = await readJsonOrNull(path.join(dir, "job.json"));
  if (raw === null) throw renderNotFound();
  const job = validateRenderJob(raw);
  if (job === null || job.renderId !== renderId) {
    throw new WriteError("render_unreadable", "Persisted render job failed validation.", 500);
  }
  return job;
}

/** Parent-side finalization after the worker exits: only applies when the
 *  worker did not already record a terminal status. */
export async function finalizeRenderJob(
  renderId: string,
  outcome: { status: "failed" | "timed-out"; exitCode: number | null; error: string },
): Promise<void> {
  const dir = await renderDir(renderId);
  const job = await getRenderJob(renderId);
  if (job.status !== "queued" && job.status !== "running") return;
  await writeJsonAtomic(dir, "job.json", {
    ...job,
    status: outcome.status,
    finishedAt: new Date().toISOString(),
    exitCode: outcome.exitCode,
    error: outcome.error.slice(0, 500),
  });
}

/** Resolve a succeeded render's MP4 for streaming. */
export async function resolveRenderOutput(
  renderId: string,
): Promise<{ job: RenderJobV1; absolutePath: string; size: number }> {
  const job = await getRenderJob(renderId);
  if (job.status !== "succeeded") {
    throw new WriteError("output_not_ready", "Render output is not available.", 409);
  }
  const dir = await renderDir(renderId);
  const absolutePath = path.join(dir, "output.mp4");
  try {
    const st = await fs.stat(absolutePath);
    if (!st.isFile()) throw new Error("not a file");
    return { job, absolutePath, size: st.size };
  } catch {
    throw renderNotFound();
  }
}
