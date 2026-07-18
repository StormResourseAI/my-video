// ProjectDocumentV1 — the only shape that crosses the server → client
// boundary. Client-safe module: types plus hand-rolled validators, no I/O.
// Validation runs on BOTH sides (server before responding, client after
// fetching) per studio/docs/PHASE2_READONLY_INTEGRATION_PLAN.md §7.

export const PROJECT_SCHEMA_VERSION = 1 as const;

// Fixed by the engine registration in src/Root.tsx (vertical-core).
export const COMPOSITION_ID = "vertical-core" as const;
export const COMPOSITION_WIDTH = 1080 as const;
export const COMPOSITION_HEIGHT = 1920 as const;
export const COMPOSITION_FPS = 30 as const;

export const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const ASSET_ID_RE = /^[A-Za-z0-9_-]{1,512}$/; // canonical unpadded base64url
export const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const CLIP_SRC_RE = /^api\/assets\/[A-Za-z0-9_-]{1,512}$/;
const MAX_CLIPS = 100;
const MAX_FRAMES = 108_000; // 60 min @ 30fps — sanity ceiling
const MAX_NAME = 200;

export type ProjectStatus = "ready" | "props-missing" | "media-missing" | "invalid";
export type Freshness = "current" | "stale" | "unknown";

export interface ProjectSummaryV1 {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  projectId: string;
  projectName: string;
  clientSlug: string | null;
  previewReady: boolean;
  cacheTimestamp: string | null;
}

export interface VerticalCoreClipV1 {
  file: string;
  /** Always "api/assets/<assetId>" — never a filesystem path. */
  src: string;
  durationInFrames: number;
  trimBefore: number;
  trimAfter: number;
}

/** Normalized-required mirror of the engine's VerticalCoreProps
 *  (src/VerticalCoreComposition.tsx) — assignable to the engine type. */
export interface VerticalCorePropsV1 {
  backgroundColor: string;
  clips: VerticalCoreClipV1[];
  title: string | null;
  titleFrames: number;
  transitionFrames: number;
}

export interface AssetRefV1 {
  assetId: string;
  fileName: string;
  kind: "video";
  previewUrl: string;
}

export interface CompositionMetaV1 {
  compositionId: typeof COMPOSITION_ID;
  width: typeof COMPOSITION_WIDTH;
  height: typeof COMPOSITION_HEIGHT;
  fps: typeof COMPOSITION_FPS;
  durationInFrames: number;
  aspectRatio: "9:16";
}

export interface ProjectDocumentV1 extends ProjectSummaryV1 {
  status: ProjectStatus;
  readOnly: true;
  /** Provenance label: preview derives from materialized cached props,
   *  never from live engine state. */
  source: "materialized-cache";
  freshness: Freshness;
  composition: CompositionMetaV1 | null;
  props: VerticalCorePropsV1 | null;
  assets: AssetRefV1[];
  /** Explicitly unavailable in the vertical-core flow (plan §7). */
  captions: null;
  music: null;
  warnings: string[];
}

export interface ProjectListV1 {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  projects: ProjectSummaryV1[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Validators. Each returns a freshly built object (unknown keys stripped) or
// null. `fail` collects the first reason for diagnostics without throwing.

type Raw = Record<string, unknown>;

const isRaw = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);

const asInt = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : null;

const asStr = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length >= 1 && v.length <= max ? v : null;

export function validateClip(raw: unknown): VerticalCoreClipV1 | null {
  if (!isRaw(raw)) return null;
  const file = asStr(raw.file, MAX_NAME);
  const src = asStr(raw.src, 600);
  const durationInFrames = asInt(raw.durationInFrames, 1, MAX_FRAMES);
  const trimBefore = asInt(raw.trimBefore, 0, MAX_FRAMES);
  const trimAfter = asInt(raw.trimAfter, 0, MAX_FRAMES);
  if (
    file === null || src === null || durationInFrames === null ||
    trimBefore === null || trimAfter === null || !CLIP_SRC_RE.test(src)
  ) {
    return null;
  }
  return { file, src, durationInFrames, trimBefore, trimAfter };
}

export function validateProps(raw: unknown): VerticalCorePropsV1 | null {
  if (!isRaw(raw)) return null;
  const backgroundColor = asStr(raw.backgroundColor, 9);
  if (backgroundColor === null || !COLOR_RE.test(backgroundColor)) return null;
  const title =
    raw.title === null ? null : asStr(raw.title, MAX_NAME);
  if (raw.title !== null && title === null) return null;
  const titleFrames = asInt(raw.titleFrames, 0, MAX_FRAMES);
  const transitionFrames = asInt(raw.transitionFrames, 0, MAX_FRAMES);
  if (titleFrames === null || transitionFrames === null) return null;
  if (!Array.isArray(raw.clips) || raw.clips.length > MAX_CLIPS) return null;
  const clips: VerticalCoreClipV1[] = [];
  for (const c of raw.clips) {
    const clip = validateClip(c);
    if (clip === null) return null;
    clips.push(clip);
  }
  return { backgroundColor, clips, title, titleFrames, transitionFrames };
}

/** Engine duration formula — mirrors calcVerticalCoreMetadata in
 *  src/Root.tsx (unexported there; Root.tsx must not be imported). */
export function durationInFramesFor(props: VerticalCorePropsV1): number {
  const total = props.clips.reduce((sum, c) => sum + c.durationInFrames, 0);
  const overlaps = Math.max(0, props.clips.length - 1) * props.transitionFrames;
  return Math.max(total - overlaps, 1);
}

const asIsoOrNull = (v: unknown): string | null | undefined => {
  if (v === null) return null;
  if (typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v))) return v;
  return undefined;
};

export function validateSummary(raw: unknown): ProjectSummaryV1 | null {
  if (!isRaw(raw)) return null;
  const projectId = asStr(raw.projectId, 64);
  const projectName = asStr(raw.projectName, MAX_NAME);
  const clientSlug = raw.clientSlug === null ? null : asStr(raw.clientSlug, 64);
  const cacheTimestamp = asIsoOrNull(raw.cacheTimestamp);
  if (
    raw.schemaVersion !== PROJECT_SCHEMA_VERSION ||
    projectId === null || !SLUG_RE.test(projectId) ||
    projectName === null ||
    (raw.clientSlug !== null && clientSlug === null) ||
    typeof raw.previewReady !== "boolean" ||
    cacheTimestamp === undefined
  ) {
    return null;
  }
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId,
    projectName,
    clientSlug,
    previewReady: raw.previewReady,
    cacheTimestamp,
  };
}

export function validateAssetRef(raw: unknown): AssetRefV1 | null {
  if (!isRaw(raw)) return null;
  const assetId = asStr(raw.assetId, 512);
  const fileName = asStr(raw.fileName, MAX_NAME);
  if (
    assetId === null || !ASSET_ID_RE.test(assetId) ||
    fileName === null || raw.kind !== "video" ||
    raw.previewUrl !== `/api/assets/${assetId}`
  ) {
    return null;
  }
  return { assetId, fileName, kind: "video", previewUrl: `/api/assets/${assetId}` };
}

const STATUSES: ProjectStatus[] = ["ready", "props-missing", "media-missing", "invalid"];
const FRESHNESS: Freshness[] = ["current", "stale", "unknown"];

export function validateDocument(raw: unknown): ProjectDocumentV1 | null {
  const summary = validateSummary(raw);
  if (summary === null || !isRaw(raw)) return null;
  const status = STATUSES.find((s) => s === raw.status);
  const freshness = FRESHNESS.find((f) => f === raw.freshness);
  if (
    status === undefined || freshness === undefined ||
    raw.readOnly !== true || raw.source !== "materialized-cache" ||
    raw.captions !== null || raw.music !== null ||
    !Array.isArray(raw.warnings) || raw.warnings.length > 32 ||
    !raw.warnings.every((w) => typeof w === "string" && w.length <= 500) ||
    !Array.isArray(raw.assets) || raw.assets.length > MAX_CLIPS
  ) {
    return null;
  }
  const assets: AssetRefV1[] = [];
  for (const a of raw.assets) {
    const ref = validateAssetRef(a);
    if (ref === null) return null;
    assets.push(ref);
  }

  let props: VerticalCorePropsV1 | null = null;
  let composition: CompositionMetaV1 | null = null;
  if (status === "ready") {
    props = validateProps(raw.props);
    if (props === null || !isRaw(raw.composition)) return null;
    const c = raw.composition;
    const durationInFrames = asInt(c.durationInFrames, 1, MAX_FRAMES * MAX_CLIPS);
    if (
      c.compositionId !== COMPOSITION_ID ||
      c.width !== COMPOSITION_WIDTH ||
      c.height !== COMPOSITION_HEIGHT ||
      c.fps !== COMPOSITION_FPS ||
      c.aspectRatio !== "9:16" ||
      durationInFrames === null ||
      durationInFrames !== durationInFramesFor(props)
    ) {
      return null;
    }
    composition = {
      compositionId: COMPOSITION_ID,
      width: COMPOSITION_WIDTH,
      height: COMPOSITION_HEIGHT,
      fps: COMPOSITION_FPS,
      durationInFrames,
      aspectRatio: "9:16",
    };
  } else if (raw.props !== null || raw.composition !== null) {
    return null;
  }

  return {
    ...summary,
    status,
    readOnly: true,
    source: "materialized-cache",
    freshness,
    composition,
    props,
    assets,
    captions: null,
    music: null,
    warnings: raw.warnings.slice() as string[],
  };
}

export function validateProjectList(raw: unknown): ProjectListV1 | null {
  if (!isRaw(raw) || raw.schemaVersion !== PROJECT_SCHEMA_VERSION) return null;
  if (!Array.isArray(raw.projects) || raw.projects.length > 500) return null;
  const projects: ProjectSummaryV1[] = [];
  for (const p of raw.projects) {
    const summary = validateSummary(p);
    if (summary === null) return null;
    projects.push(summary);
  }
  return { schemaVersion: PROJECT_SCHEMA_VERSION, projects };
}
