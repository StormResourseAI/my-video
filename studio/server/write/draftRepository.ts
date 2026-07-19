import "server-only";
// Versioned non-destructive drafts under the writable data root. Reads the
// source project strictly through the read-only repository; never writes to
// any source root. Layout: drafts/<draftId>/draft.json plus immutable
// drafts/<draftId>/history/<version>.json revisions.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { getProject, encodeAssetId } from "../projectRepository";
import {
  applyDraftEdits,
  validateDraft,
  validateDraftEdits,
  DRAFT_SCHEMA_VERSION,
  MAX_DRAFT_VERSION,
  UUID_RE,
  type RenderEligibility,
  type StudioDraftClipV1,
  type StudioDraftV1,
} from "@/lib/draftDocument";
import { ensureDataDir, WriteError } from "./dataRootPolicy";
import { readJsonOrNull, writeJsonAtomic, writeJsonExclusive } from "./atomicJson";
import { computeSourceFingerprint } from "./sourceFingerprint";

export const SOURCE_CHANGED_WARNING =
  "Source project changed after this draft was created. Rendering is blocked; " +
  "create a new draft from the latest source to render current media.";

const invalidDraftId = (): WriteError =>
  new WriteError("invalid_id", "Draft id is not valid.", 400);
const draftNotFound = (): WriteError =>
  new WriteError("not_found", "Draft not found.", 404);

function eligibilityFor(clips: StudioDraftClipV1[], sourceChanged: boolean): RenderEligibility {
  if (sourceChanged) return "source-changed";
  if (!clips.some((c) => c.enabled)) return "no-enabled-clips";
  return "eligible";
}

// All draft mutations in this process run strictly one at a time so a
// version check and its write are atomic relative to other requests.
// ponytail: in-process queue; a lock file if Studio ever runs multi-process.
let writeChain: Promise<unknown> = Promise.resolve();
function serialized<T>(op: () => Promise<T>): Promise<T> {
  const next = writeChain.then(op, op);
  writeChain = next.catch(() => undefined);
  return next;
}

/** Create version 1 of a draft from a preview-ready source project. All
 *  defaults are derived server-side from the materialized cache. */
export async function createDraft(sourceProjectId: string): Promise<StudioDraftV1> {
  return serialized(async () => {
    const doc = await getProject(sourceProjectId);
    if (doc.status !== "ready" || doc.props === null) {
      throw new WriteError(
        "source_not_ready",
        "Source project has no previewable materialized state.",
        409,
      );
    }
    const sourceFingerprint = await computeSourceFingerprint(sourceProjectId);
    if (sourceFingerprint === null) {
      throw new WriteError("source_not_ready", "Source project state could not be fingerprinted.", 409);
    }
    const now = new Date().toISOString();
    const draft: StudioDraftV1 = {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      draftId: randomUUID(),
      sourceProjectId: doc.projectId,
      sourceProjectName: doc.projectName,
      sourceCompositionId: "vertical-core",
      sourceCacheTimestamp: doc.cacheTimestamp,
      sourceFingerprint,
      createdAt: now,
      updatedAt: now,
      version: 1,
      readOnlySource: true,
      draftTitle: doc.props.title,
      backgroundColor: doc.props.backgroundColor,
      transitionFrames: doc.props.transitionFrames,
      clips: doc.props.clips.map((clip, index) => ({
        sourceAssetId: encodeAssetId(doc.projectId, clip.file),
        fileName: clip.file,
        sourceDurationInFrames: clip.durationInFrames,
        trimBefore: 0,
        trimAfter: 0,
        enabled: true,
        order: index,
      })),
      renderEligibility: "eligible",
      warnings: [],
    };
    if (validateDraft(draft) === null) {
      throw new WriteError("internal", "Constructed draft failed validation.", 500);
    }
    const draftDir = await ensureDataDir("drafts", draft.draftId);
    const historyDir = await ensureDataDir("drafts", draft.draftId, "history");
    await writeJsonExclusive(historyDir, "1.json", draft);
    await writeJsonAtomic(draftDir, "draft.json", draft);
    return draft;
  });
}

/** Load and validate a persisted draft. */
export async function getDraft(draftId: string): Promise<StudioDraftV1> {
  if (!UUID_RE.test(draftId)) throw invalidDraftId();
  const draftDir = await ensureDataDir("drafts", draftId);
  const raw = await readJsonOrNull(path.join(draftDir, "draft.json"));
  if (raw === null) throw draftNotFound();
  const draft = validateDraft(raw);
  if (draft === null || draft.draftId !== draftId) {
    throw new WriteError("draft_unreadable", "Persisted draft failed validation.", 500);
  }
  return draft;
}

/** Apply approved edits with optimistic concurrency. Saving stays available
 *  when the source changed — the draft is marked and render is blocked. */
export async function updateDraft(draftId: string, body: unknown): Promise<StudioDraftV1> {
  if (!UUID_RE.test(draftId)) throw invalidDraftId();
  return serialized(async () => {
    const persisted = await getDraft(draftId);
    const edits = validateDraftEdits(body, persisted);
    if (edits === null) {
      throw new WriteError("invalid_body", "Draft edits failed validation.", 400);
    }
    if (edits.expectedVersion !== persisted.version) {
      throw new WriteError(
        "version_conflict",
        "Draft was modified by another save. Reload the latest version.",
        409,
      );
    }
    if (persisted.version >= MAX_DRAFT_VERSION) {
      throw new WriteError("invalid_body", "Draft version limit reached.", 400);
    }
    const currentFingerprint = await computeSourceFingerprint(persisted.sourceProjectId);
    const sourceChanged =
      currentFingerprint === null || currentFingerprint !== persisted.sourceFingerprint;
    const clips = applyDraftEdits(persisted, edits);
    const next: StudioDraftV1 = {
      ...persisted,
      draftTitle: edits.draftTitle,
      backgroundColor: edits.backgroundColor,
      transitionFrames: edits.transitionFrames,
      clips,
      version: persisted.version + 1,
      updatedAt: new Date().toISOString(),
      renderEligibility: eligibilityFor(clips, sourceChanged),
      warnings: sourceChanged ? [SOURCE_CHANGED_WARNING] : [],
    };
    if (validateDraft(next) === null) {
      throw new WriteError("internal", "Updated draft failed validation.", 500);
    }
    const draftDir = await ensureDataDir("drafts", draftId);
    const historyDir = await ensureDataDir("drafts", draftId, "history");
    await writeJsonExclusive(historyDir, `${next.version}.json`, next);
    await writeJsonAtomic(draftDir, "draft.json", next);
    return next;
  });
}

/** Recompute staleness for render gating without persisting anything. */
export async function isDraftSourceCurrent(draft: StudioDraftV1): Promise<boolean> {
  const current = await computeSourceFingerprint(draft.sourceProjectId);
  return current !== null && current === draft.sourceFingerprint;
}
