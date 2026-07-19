import "server-only";
// Server-derived fingerprint binding a draft to the exact source state it
// was created from: props-cache content/size/mtime, referenced asset names
// and sizes, and the metadata file hash (or absence marker). Media bytes are
// never hashed. Read-only over source roots.

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { getRoots, isValidFileName, resolveUnder } from "../pathPolicy";

const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

/** Extract the referenced clip file names from the RAW engine props cache
 *  (whose src fields are engine-relative, not the rewritten API form).
 *  Returns null when the cache is structurally unusable. */
function clipFileNames(parsed: unknown): string[] | null {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const clips = (parsed as { clips?: unknown }).clips;
  if (!Array.isArray(clips) || clips.length > 100) return null;
  const files: string[] = [];
  for (const clip of clips) {
    const file = (clip as { file?: unknown } | null)?.file;
    if (typeof file !== "string" || !isValidFileName(file)) return null;
    files.push(file);
  }
  return files;
}

/** Returns the fingerprint hex digest, or null when the source project has
 *  no valid materialized props cache. */
export async function computeSourceFingerprint(projectId: string): Promise<string | null> {
  const roots = await getRoots();
  const propsPath = await resolveUnder(roots.props, `${projectId}.json`);
  if (propsPath === null) return null;

  let propsRaw: Buffer;
  let propsStat: { size: number; mtimeMs: number };
  try {
    propsRaw = await fs.readFile(propsPath);
    const st = await fs.stat(propsPath);
    propsStat = { size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(propsRaw.toString("utf8"));
  } catch {
    return null;
  }
  const files = clipFileNames(parsed);
  if (files === null) return null;

  const assets: Array<[string, number | "missing"]> = [];
  for (const file of files) {
    const mediaPath = await resolveUnder(roots.media, projectId, file);
    if (mediaPath === null) {
      assets.push([file, "missing"]);
      continue;
    }
    try {
      const st = await fs.stat(mediaPath);
      assets.push([file, st.size]);
    } catch {
      assets.push([file, "missing"]);
    }
  }

  let metadataHash = "absent";
  const metadataPath = await resolveUnder(roots.metadata, `${projectId}.json`);
  if (metadataPath !== null) {
    try {
      metadataHash = sha256(await fs.readFile(metadataPath));
    } catch {
      metadataHash = "absent";
    }
  }

  return sha256(
    JSON.stringify({
      projectId,
      propsHash: sha256(propsRaw),
      propsSize: propsStat.size,
      propsMtimeMs: propsStat.mtimeMs,
      assets,
      metadataHash,
    }),
  );
}
