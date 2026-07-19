import "server-only";
// Read-only repository over the engine's materialized per-project state:
//   input/selects/<slug>/           project discovery (directory names only)
//   input/metadata/<slug>.json      display metadata
//   .cache/render-props/<slug>.json full VerticalCoreProps incl. durations
//   public/runtime-selects/<slug>/  staged, browser-servable media
// Never executes engine scripts; never regenerates state; never writes.

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  COMPOSITION_FPS,
  COMPOSITION_HEIGHT,
  COMPOSITION_ID,
  COMPOSITION_WIDTH,
  durationInFramesFor,
  PROJECT_SCHEMA_VERSION,
  validateProps,
  type AssetRefV1,
  type Freshness,
  type ProjectDocumentV1,
  type ProjectSummaryV1,
  type VerticalCorePropsV1,
} from "@/lib/projectDocument";
import { getRoots, isValidSlug, PolicyError, resolveUnder } from "./pathPolicy";

export function encodeAssetId(slug: string, fileName: string): string {
  return Buffer.from(`${slug}/${fileName}`, "utf8").toString("base64url");
}

interface RawMetadata {
  title?: unknown;
  client_slug?: unknown;
}

async function readJsonOrNull(filePath: string | null): Promise<unknown | null> {
  if (filePath === null) return null;
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function mtimeOrNull(filePath: string | null): Promise<Date | null> {
  if (filePath === null) return null;
  try {
    return (await fs.stat(filePath)).mtime;
  } catch {
    return null;
  }
}

function displayName(metadata: unknown, slug: string): { name: string; clientSlug: string | null } {
  const m = (metadata ?? {}) as RawMetadata;
  const title = typeof m.title === "string" && m.title.trim().length > 0 ? m.title.trim() : null;
  const clientSlug =
    typeof m.client_slug === "string" && isValidSlug(m.client_slug) ? m.client_slug : null;
  return { name: (title ?? slug).slice(0, 200), clientSlug };
}

export async function listProjects(): Promise<ProjectSummaryV1[]> {
  const roots = await getRoots();
  if (roots.selects === null) return [];

  let entries: string[];
  try {
    entries = await fs.readdir(roots.selects);
  } catch {
    return [];
  }

  const summaries: ProjectSummaryV1[] = [];
  for (const slug of entries.sort()) {
    if (!isValidSlug(slug)) continue;
    const dir = await resolveUnder(roots.selects, slug);
    if (dir === null) continue;
    try {
      if (!(await fs.stat(dir)).isDirectory()) continue;
    } catch {
      continue;
    }
    const propsPath = await resolveUnder(roots.props, `${slug}.json`);
    const metadata = await readJsonOrNull(await resolveUnder(roots.metadata, `${slug}.json`));
    const { name, clientSlug } = displayName(metadata, slug);
    const cacheMtime = await mtimeOrNull(propsPath);
    summaries.push({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      projectId: slug,
      projectName: name,
      clientSlug,
      previewReady: await isPreviewReady(slug, propsPath, roots.media),
      cacheTimestamp: cacheMtime === null ? null : cacheMtime.toISOString(),
    });
  }
  return summaries;
}

/** Plan §7 semantics: previewReady = valid props cache AND every referenced
 *  clip staged. */
async function isPreviewReady(
  slug: string,
  propsPath: string | null,
  mediaRoot: string | null,
): Promise<boolean> {
  const rawProps = await readJsonOrNull(propsPath);
  if (rawProps === null) return false;
  const props = validateProps(rewriteForValidation(rawProps, slug));
  if (props === null) return false;
  for (const clip of props.clips) {
    if ((await resolveUnder(mediaRoot, slug, clip.file)) === null) return false;
  }
  return true;
}

async function computeFreshness(
  cacheMtime: Date | null,
  selectsDir: string | null,
  metadataPath: string | null,
): Promise<{ freshness: Freshness; warning: string | null }> {
  if (cacheMtime === null) return { freshness: "unknown", warning: null };
  try {
    let newest = 0;
    if (selectsDir !== null) {
      for (const entry of await fs.readdir(selectsDir)) {
        const stat = await fs.stat(path.join(selectsDir, entry)).catch(() => null);
        if (stat !== null) newest = Math.max(newest, stat.mtimeMs);
      }
      newest = Math.max(newest, (await fs.stat(selectsDir)).mtimeMs);
    }
    const metaMtime = await mtimeOrNull(metadataPath);
    if (metaMtime !== null) newest = Math.max(newest, metaMtime.getTime());
    if (newest > cacheMtime.getTime()) {
      return {
        freshness: "stale",
        warning:
          "Project sources changed after the cached props were materialized; the preview may not reflect the current selects.",
      };
    }
    return { freshness: "current", warning: null };
  } catch {
    return {
      freshness: "unknown",
      warning: "Cache freshness could not be verified against project sources.",
    };
  }
}

export async function getProject(slug: string): Promise<ProjectDocumentV1> {
  if (!isValidSlug(slug)) {
    throw new PolicyError("invalid_id", "Invalid project id.");
  }
  const roots = await getRoots();
  const selectsDir = await resolveUnder(roots.selects, slug);
  const propsPath = await resolveUnder(roots.props, `${slug}.json`);
  if (selectsDir === null && propsPath === null) {
    throw new PolicyError("not_found", "Unknown project.");
  }

  const metadataPath = await resolveUnder(roots.metadata, `${slug}.json`);
  const metadata = await readJsonOrNull(metadataPath);
  const { name, clientSlug } = displayName(metadata, slug);
  const cacheMtime = await mtimeOrNull(propsPath);
  const { freshness, warning: freshnessWarning } = await computeFreshness(
    cacheMtime,
    selectsDir,
    metadataPath,
  );

  const warnings: string[] = [];
  if (metadata === null) warnings.push("No metadata file; using defaults.");
  if (freshnessWarning !== null) warnings.push(freshnessWarning);
  warnings.push("Read-only preview derived from materialized cached props.");

  const base = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: slug,
    projectName: name,
    clientSlug,
    previewReady: false,
    cacheTimestamp: cacheMtime === null ? null : cacheMtime.toISOString(),
    readOnly: true as const,
    source: "materialized-cache" as const,
    freshness,
    composition: null,
    props: null,
    assets: [] as AssetRefV1[],
    captions: null,
    music: null,
  };

  const rawProps = await readJsonOrNull(propsPath);
  if (rawProps === null) {
    return {
      ...base,
      status: "props-missing",
      warnings: [
        ...warnings,
        `No materialized props cache for this project. Run: npm run render:vertical -- ${slug}`,
      ],
    };
  }

  const engineProps = validateProps(rewriteForValidation(rawProps, slug));
  if (engineProps === null) {
    return {
      ...base,
      status: "invalid",
      warnings: [...warnings, "Cached props failed validation and cannot be previewed."],
    };
  }

  // Every referenced clip must be staged under public/runtime-selects/<slug>/.
  const missing: string[] = [];
  const assets: AssetRefV1[] = [];
  for (const clip of engineProps.clips) {
    const staged = await resolveUnder(roots.media, slug, clip.file);
    if (staged === null) {
      missing.push(clip.file);
      continue;
    }
    const assetId = encodeAssetId(slug, clip.file);
    assets.push({
      assetId,
      fileName: clip.file,
      kind: "video",
      previewUrl: `/api/assets/${assetId}`,
    });
  }
  if (missing.length > 0) {
    return {
      ...base,
      assets,
      status: "media-missing",
      warnings: [...warnings, `Staged media missing: ${missing.join(", ")}`],
    };
  }

  return {
    ...base,
    previewReady: true,
    status: "ready",
    composition: {
      compositionId: COMPOSITION_ID,
      width: COMPOSITION_WIDTH,
      height: COMPOSITION_HEIGHT,
      fps: COMPOSITION_FPS,
      durationInFrames: durationInFramesFor(engineProps),
      aspectRatio: "9:16",
    },
    props: engineProps,
    assets,
    warnings,
  };
}

/** The engine cache stores clip.src as "runtime-selects/<slug>/<file>"
 *  (scripts/render-vertical.mjs). Rewrite each src to the opaque asset URL
 *  BEFORE validation so no engine-relative path ever enters the DTO. */
function rewriteForValidation(rawProps: unknown, slug: string): unknown {
  if (typeof rawProps !== "object" || rawProps === null) return rawProps;
  const raw = rawProps as Record<string, unknown>;
  if (!Array.isArray(raw.clips)) return rawProps;
  return {
    ...raw,
    clips: raw.clips.map((c) => {
      if (typeof c !== "object" || c === null) return c;
      const clip = c as Record<string, unknown>;
      if (typeof clip.file !== "string") return c;
      return { ...clip, src: `api/assets/${encodeAssetId(slug, clip.file)}` };
    }),
  };
}

/** Membership gate for the asset route: fileName must be referenced by the
 *  project's materialized props cache. */
export async function isProjectAsset(slug: string, fileName: string): Promise<boolean> {
  if (!isValidSlug(slug)) return false;
  const roots = await getRoots();
  const propsPath = await resolveUnder(roots.props, `${slug}.json`);
  const rawProps = await readJsonOrNull(propsPath);
  if (rawProps === null) return false;
  const props = validateProps(rewriteForValidation(rawProps, slug));
  if (props === null) return false;
  return props.clips.some((c) => c.file === fileName);
}

export type { VerticalCorePropsV1 };
