// StudioDraftV1 — the non-destructive draft contract (Phase 3). Client-safe
// module: types plus hand-rolled validators, no I/O. A draft references its
// source project only through canonical asset ids and server-derived values;
// it never carries filesystem paths, commands, or environment data.
// Validation runs on BOTH sides, mirroring projectDocument.ts.

import {
  ASSET_ID_RE,
  COLOR_RE,
  COMPOSITION_ID,
  MAX_CLIPS,
  MAX_FRAMES,
  MAX_NAME,
  SLUG_RE,
  type VerticalCorePropsV1,
  type VerticalCoreClipV1,
} from "./projectDocument";

export const DRAFT_SCHEMA_VERSION = 1 as const;

/** Server-generated v4 UUIDs (drafts and renders). */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** SHA-256 hex digest produced by the server-side fingerprint routine. */
export const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

/** Plain-text guard: draft titles may not contain control characters. */
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

export type RenderEligibility = "eligible" | "no-enabled-clips" | "source-changed";

export interface StudioDraftClipV1 {
  /** Canonical asset id from the source project document. */
  sourceAssetId: string;
  fileName: string;
  /** Length in frames of the materialized source clip window. */
  sourceDurationInFrames: number;
  /** Frames removed from the start of the source window. */
  trimBefore: number;
  /** Frames removed from the end of the source window. */
  trimAfter: number;
  enabled: boolean;
  /** Must equal the clip's array index. */
  order: number;
}

export interface StudioDraftV1 {
  schemaVersion: typeof DRAFT_SCHEMA_VERSION;
  draftId: string;
  sourceProjectId: string;
  sourceProjectName: string;
  sourceCompositionId: typeof COMPOSITION_ID;
  sourceCacheTimestamp: string | null;
  sourceFingerprint: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  readOnlySource: true;
  draftTitle: string | null;
  backgroundColor: string;
  transitionFrames: number;
  clips: StudioDraftClipV1[];
  renderEligibility: RenderEligibility;
  warnings: string[];
}

/** The only fields a PUT may change. Clips are matched to the persisted
 *  draft by sourceAssetId; identity fields are never client-writable. */
export interface DraftEditsV1 {
  expectedVersion: number;
  draftTitle: string | null;
  backgroundColor: string;
  transitionFrames: number;
  clips: Array<{
    sourceAssetId: string;
    trimBefore: number;
    trimAfter: number;
    enabled: boolean;
  }>;
}

export const MAX_DRAFT_VERSION = 1_000_000;

type Raw = Record<string, unknown>;
const isRaw = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const asInt = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : null;
const asStr = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length >= 1 && v.length <= max ? v : null;

const asIso = (v: unknown): string | null =>
  typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : null;

function validateTitle(v: unknown): { ok: boolean; value: string | null } {
  if (v === null || v === "") return { ok: true, value: null };
  const s = asStr(v, MAX_NAME);
  if (s === null || CONTROL_CHARS_RE.test(s)) return { ok: false, value: null };
  return { ok: true, value: s };
}

export function validateDraftClip(raw: unknown, index: number): StudioDraftClipV1 | null {
  if (!isRaw(raw)) return null;
  const sourceAssetId = asStr(raw.sourceAssetId, 512);
  const fileName = asStr(raw.fileName, MAX_NAME);
  const sourceDurationInFrames = asInt(raw.sourceDurationInFrames, 1, MAX_FRAMES);
  const trimBefore = asInt(raw.trimBefore, 0, MAX_FRAMES);
  const trimAfter = asInt(raw.trimAfter, 0, MAX_FRAMES);
  if (
    sourceAssetId === null || !ASSET_ID_RE.test(sourceAssetId) ||
    fileName === null || sourceDurationInFrames === null ||
    trimBefore === null || trimAfter === null ||
    typeof raw.enabled !== "boolean" ||
    raw.order !== index ||
    trimBefore + trimAfter >= sourceDurationInFrames
  ) {
    return null;
  }
  return {
    sourceAssetId,
    fileName,
    sourceDurationInFrames,
    trimBefore,
    trimAfter,
    enabled: raw.enabled,
    order: index,
  };
}

const ELIGIBILITY: RenderEligibility[] = ["eligible", "no-enabled-clips", "source-changed"];

export function validateDraft(raw: unknown): StudioDraftV1 | null {
  if (!isRaw(raw)) return null;
  const draftId = asStr(raw.draftId, 36);
  const sourceProjectId = asStr(raw.sourceProjectId, 64);
  const sourceProjectName = asStr(raw.sourceProjectName, MAX_NAME);
  const sourceCacheTimestamp = raw.sourceCacheTimestamp === null ? null : asIso(raw.sourceCacheTimestamp);
  const sourceFingerprint = asStr(raw.sourceFingerprint, 64);
  const createdAt = asIso(raw.createdAt);
  const updatedAt = asIso(raw.updatedAt);
  const version = asInt(raw.version, 1, MAX_DRAFT_VERSION);
  const title = validateTitle(raw.draftTitle);
  const backgroundColor = asStr(raw.backgroundColor, 9);
  const transitionFrames = asInt(raw.transitionFrames, 0, MAX_FRAMES);
  const renderEligibility = ELIGIBILITY.find((e) => e === raw.renderEligibility);
  if (
    raw.schemaVersion !== DRAFT_SCHEMA_VERSION ||
    draftId === null || !UUID_RE.test(draftId) ||
    sourceProjectId === null || !SLUG_RE.test(sourceProjectId) ||
    sourceProjectName === null ||
    (raw.sourceCacheTimestamp !== null && sourceCacheTimestamp === null) ||
    raw.sourceCompositionId !== COMPOSITION_ID ||
    sourceFingerprint === null || !FINGERPRINT_RE.test(sourceFingerprint) ||
    createdAt === null || updatedAt === null || version === null ||
    raw.readOnlySource !== true ||
    !title.ok ||
    backgroundColor === null || !COLOR_RE.test(backgroundColor) ||
    transitionFrames === null ||
    renderEligibility === undefined ||
    !Array.isArray(raw.clips) || raw.clips.length < 1 || raw.clips.length > MAX_CLIPS ||
    !Array.isArray(raw.warnings) || raw.warnings.length > 32 ||
    !raw.warnings.every((w) => typeof w === "string" && w.length <= 500)
  ) {
    return null;
  }
  const clips: StudioDraftClipV1[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.clips.length; i += 1) {
    const clip = validateDraftClip(raw.clips[i], i);
    if (clip === null || seen.has(clip.sourceAssetId)) return null;
    seen.add(clip.sourceAssetId);
    clips.push(clip);
  }
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    draftId,
    sourceProjectId,
    sourceProjectName,
    sourceCompositionId: COMPOSITION_ID,
    sourceCacheTimestamp,
    sourceFingerprint,
    createdAt,
    updatedAt,
    version,
    readOnlySource: true,
    draftTitle: title.value,
    backgroundColor,
    transitionFrames,
    clips,
    renderEligibility,
    warnings: raw.warnings.slice() as string[],
  };
}

/** Validates a PUT body against the persisted draft. Clips must be a
 *  permutation of the persisted clip set (same asset ids, each exactly
 *  once) — the client can reorder, trim, and toggle, never add or remove. */
export function validateDraftEdits(raw: unknown, base: StudioDraftV1): DraftEditsV1 | null {
  if (!isRaw(raw)) return null;
  const expectedVersion = asInt(raw.expectedVersion, 1, MAX_DRAFT_VERSION);
  const title = validateTitle(raw.draftTitle);
  const backgroundColor = asStr(raw.backgroundColor, 9);
  const transitionFrames = asInt(raw.transitionFrames, 0, MAX_FRAMES);
  if (
    expectedVersion === null || !title.ok ||
    backgroundColor === null || !COLOR_RE.test(backgroundColor) ||
    transitionFrames === null ||
    !Array.isArray(raw.clips) || raw.clips.length !== base.clips.length
  ) {
    return null;
  }
  const byAssetId = new Map(base.clips.map((c) => [c.sourceAssetId, c]));
  const clips: DraftEditsV1["clips"] = [];
  const seen = new Set<string>();
  for (const entry of raw.clips) {
    if (!isRaw(entry)) return null;
    const sourceAssetId = asStr(entry.sourceAssetId, 512);
    if (sourceAssetId === null || seen.has(sourceAssetId)) return null;
    const baseClip = byAssetId.get(sourceAssetId);
    if (baseClip === undefined) return null;
    const trimBefore = asInt(entry.trimBefore, 0, MAX_FRAMES);
    const trimAfter = asInt(entry.trimAfter, 0, MAX_FRAMES);
    if (
      trimBefore === null || trimAfter === null ||
      typeof entry.enabled !== "boolean" ||
      trimBefore + trimAfter >= baseClip.sourceDurationInFrames
    ) {
      return null;
    }
    seen.add(sourceAssetId);
    clips.push({ sourceAssetId, trimBefore, trimAfter, enabled: entry.enabled });
  }
  return {
    expectedVersion,
    draftTitle: title.value,
    backgroundColor,
    transitionFrames,
    clips,
  };
}

/** Applies validated edits to the persisted draft (identity and source
 *  binding untouched). Caller supplies version/updatedAt. */
export function applyDraftEdits(base: StudioDraftV1, edits: DraftEditsV1): StudioDraftClipV1[] {
  const byAssetId = new Map(base.clips.map((c) => [c.sourceAssetId, c]));
  return edits.clips.map((entry, index) => {
    const baseClip = byAssetId.get(entry.sourceAssetId) as StudioDraftClipV1;
    return {
      ...baseClip,
      trimBefore: entry.trimBefore,
      trimAfter: entry.trimAfter,
      enabled: entry.enabled,
      order: index,
    };
  });
}

export interface DraftEngineDerivation {
  props: VerticalCorePropsV1;
  durationInFrames: number;
}

/** Builds engine props from a draft against its source props. The source
 *  props supply the base trim window and titleFrames; `srcFor` maps a draft
 *  clip to the correct playback/render source reference. Returns null when
 *  the draft no longer matches the source or nothing is enabled. */
export function deriveEngineProps(
  draft: Pick<StudioDraftV1, "draftTitle" | "backgroundColor" | "transitionFrames" | "clips">,
  sourceProps: VerticalCorePropsV1,
  srcFor: (clip: StudioDraftClipV1) => string,
): DraftEngineDerivation | null {
  const bySourceFile = new Map(sourceProps.clips.map((c) => [c.file, c]));
  const clips: VerticalCoreClipV1[] = [];
  for (const clip of draft.clips) {
    if (!clip.enabled) continue;
    const base = bySourceFile.get(clip.fileName);
    if (base === undefined || base.durationInFrames !== clip.sourceDurationInFrames) return null;
    const durationInFrames = clip.sourceDurationInFrames - clip.trimBefore - clip.trimAfter;
    if (durationInFrames < 1) return null;
    const trimBefore = base.trimBefore + clip.trimBefore;
    clips.push({
      file: clip.fileName,
      src: srcFor(clip),
      durationInFrames,
      trimBefore,
      trimAfter: trimBefore + durationInFrames,
    });
  }
  if (clips.length === 0) return null;
  const props: VerticalCorePropsV1 = {
    backgroundColor: draft.backgroundColor,
    clips,
    title: draft.draftTitle,
    titleFrames: sourceProps.titleFrames,
    transitionFrames: draft.transitionFrames,
  };
  const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
  const overlaps = Math.max(0, clips.length - 1) * props.transitionFrames;
  const durationInFrames = Math.max(total - overlaps, 1);
  if (durationInFrames > MAX_FRAMES) return null;
  return { props, durationInFrames };
}
