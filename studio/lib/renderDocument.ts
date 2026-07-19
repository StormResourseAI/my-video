// RenderJobV1 — render job status contract (Phase 3). Client-safe: types
// plus hand-rolled validators, no I/O. Never carries filesystem paths,
// commands, or environment data.

import { MAX_FRAMES, SLUG_RE } from "./projectDocument";
import { MAX_DRAFT_VERSION, UUID_RE } from "./draftDocument";

export const RENDER_SCHEMA_VERSION = 1 as const;

export type RenderStatus = "queued" | "running" | "succeeded" | "failed" | "timed-out";

export interface RenderJobV1 {
  schemaVersion: typeof RENDER_SCHEMA_VERSION;
  renderId: string;
  draftId: string;
  draftVersion: number;
  sourceProjectId: string;
  status: RenderStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  /** Controlled, bounded message — never a stack trace or a path. */
  error: string | null;
  durationInFrames: number;
  outputBytes: number | null;
}

const STATUSES: RenderStatus[] = ["queued", "running", "succeeded", "failed", "timed-out"];

type Raw = Record<string, unknown>;
const isRaw = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const asInt = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : null;
const asIso = (v: unknown): string | null =>
  typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : null;

export function validateRenderJob(raw: unknown): RenderJobV1 | null {
  if (!isRaw(raw)) return null;
  const status = STATUSES.find((s) => s === raw.status);
  const draftVersion = asInt(raw.draftVersion, 1, MAX_DRAFT_VERSION);
  const durationInFrames = asInt(raw.durationInFrames, 1, MAX_FRAMES);
  const createdAt = asIso(raw.createdAt);
  const startedAt = raw.startedAt === null ? null : asIso(raw.startedAt);
  const finishedAt = raw.finishedAt === null ? null : asIso(raw.finishedAt);
  const exitCode = raw.exitCode === null ? null : asInt(raw.exitCode, -1024, 1024);
  const outputBytes = raw.outputBytes === null ? null : asInt(raw.outputBytes, 0, Number.MAX_SAFE_INTEGER);
  const error =
    raw.error === null
      ? null
      : typeof raw.error === "string" && raw.error.length >= 1 && raw.error.length <= 500
        ? raw.error
        : undefined;
  if (
    raw.schemaVersion !== RENDER_SCHEMA_VERSION ||
    typeof raw.renderId !== "string" || !UUID_RE.test(raw.renderId) ||
    typeof raw.draftId !== "string" || !UUID_RE.test(raw.draftId) ||
    typeof raw.sourceProjectId !== "string" || !SLUG_RE.test(raw.sourceProjectId) ||
    status === undefined || draftVersion === null || durationInFrames === null ||
    createdAt === null ||
    (raw.startedAt !== null && startedAt === null) ||
    (raw.finishedAt !== null && finishedAt === null) ||
    (raw.exitCode !== null && exitCode === null) ||
    (raw.outputBytes !== null && outputBytes === null) ||
    error === undefined
  ) {
    return null;
  }
  return {
    schemaVersion: RENDER_SCHEMA_VERSION,
    renderId: raw.renderId,
    draftId: raw.draftId,
    draftVersion,
    sourceProjectId: raw.sourceProjectId,
    status,
    createdAt,
    startedAt,
    finishedAt,
    exitCode,
    error,
    durationInFrames,
    outputBytes,
  };
}
