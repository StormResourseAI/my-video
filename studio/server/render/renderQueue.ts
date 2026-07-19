import "server-only";
// Single-job render queue (Phase 3 Stage I). Validates the saved draft,
// re-checks the source fingerprint, derives engine props server-side, and
// launches exactly one constrained worker at a time. Every identifier and
// path component is server-generated; the client supplies only a draft id
// and its expected version.

import { randomUUID } from "node:crypto";
import { deriveEngineProps } from "@/lib/draftDocument";
import { RENDER_SCHEMA_VERSION, type RenderJobV1 } from "@/lib/renderDocument";
import { getProject } from "../projectRepository";
import { getOrCreateDataRoot, WriteError } from "../write/dataRootPolicy";
import { getDraft, isDraftSourceCurrent } from "../write/draftRepository";
import { createRenderJob, finalizeRenderJob } from "../write/renderRepository";
import { getRoots } from "../pathPolicy";
import { spawnRenderWorker, type RenderRunner } from "./renderRunner";

export const RENDER_TIMEOUT_MS = 30 * 60_000;

let activeRender: { renderId: string; kill: () => void } | null = null;
// Reserved synchronously before the first await in startRender so two
// concurrent POSTs cannot both pass the single-job check (TOCTOU).
let renderStarting = false;
let runner: RenderRunner = spawnRenderWorker;

/** Test seam: replace the process-spawning runner with a fake. */
export function setRenderRunnerForTesting(next: RenderRunner | null): void {
  runner = next ?? spawnRenderWorker;
}

/** Test seam: forget a stuck active render between tests. */
export function resetRenderQueueForTesting(): void {
  activeRender = null;
  renderStarting = false;
}

export function isRenderActive(): boolean {
  return activeRender !== null;
}

export async function startRender(draftId: string, expectedDraftVersion: number): Promise<RenderJobV1> {
  if (activeRender !== null || renderStarting) {
    throw new WriteError("render_busy", "A render is already running.", 409);
  }
  renderStarting = true;
  try {
    return await startRenderLocked(draftId, expectedDraftVersion);
  } finally {
    renderStarting = false;
  }
}

async function startRenderLocked(draftId: string, expectedDraftVersion: number): Promise<RenderJobV1> {
  const draft = await getDraft(draftId);
  if (draft.version !== expectedDraftVersion) {
    throw new WriteError(
      "draft_version_conflict",
      "Draft has unsaved or newer changes. Save the draft, then render.",
      409,
    );
  }
  if (!(await isDraftSourceCurrent(draft))) {
    throw new WriteError(
      "source_changed",
      "Source project changed since this draft was created. Create a new draft from the latest source.",
      409,
    );
  }
  const doc = await getProject(draft.sourceProjectId);
  if (doc.status !== "ready" || doc.props === null) {
    throw new WriteError("source_not_ready", "Source project is not previewable.", 409);
  }
  const derivation = deriveEngineProps(
    draft,
    doc.props,
    (clip) => `runtime-selects/${draft.sourceProjectId}/${clip.fileName}`,
  );
  if (derivation === null) {
    throw new WriteError(
      "not_renderable",
      "Draft has no enabled clips or exceeds the duration bounds.",
      409,
    );
  }

  const job: RenderJobV1 = {
    schemaVersion: RENDER_SCHEMA_VERSION,
    renderId: randomUUID(),
    draftId: draft.draftId,
    draftVersion: draft.version,
    sourceProjectId: draft.sourceProjectId,
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    error: null,
    durationInFrames: derivation.durationInFrames,
    outputBytes: null,
  };
  await createRenderJob(job, derivation.props);

  const { repoRoot } = await getRoots();
  const dataRoot = await getOrCreateDataRoot();
  let process_: Awaited<ReturnType<RenderRunner>>;
  try {
    process_ = await runner({ repoRoot, dataRoot, renderId: job.renderId });
  } catch {
    await finalizeRenderJob(job.renderId, {
      status: "failed",
      exitCode: null,
      error: "Render worker failed to start.",
    });
    throw new WriteError("render_spawn_failed", "Render worker failed to start.", 500);
  }

  activeRender = { renderId: job.renderId, kill: process_.kill };
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    process_.kill();
  }, RENDER_TIMEOUT_MS);
  timer.unref?.();

  process_.onExit((code) => {
    clearTimeout(timer);
    if (activeRender?.renderId === job.renderId) activeRender = null;
    void finalizeRenderJob(job.renderId, {
      status: timedOut ? "timed-out" : "failed",
      exitCode: code,
      error: timedOut
        ? "Render exceeded the maximum allowed time."
        : `Render worker exited without completing (code ${code ?? "unknown"}).`,
    }).catch(() => undefined);
  });

  return job;
}
