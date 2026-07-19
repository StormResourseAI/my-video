import "server-only";
// Server-derived fingerprint binding a draft to the exact source state it
// was created from: props-cache content/size/mtime, referenced asset names
// and sizes, and the metadata file hash (or absence marker). Media bytes are
// never hashed. Read-only over source roots.

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { getRoots, resolveUnder } from "../pathPolicy";
import { validateProps } from "@/lib/projectDocument";

const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

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
  const props = validateProps(parsed);
  if (props === null) return null;

  const assets: Array<[string, number | "missing"]> = [];
  for (const clip of props.clips) {
    const mediaPath = await resolveUnder(roots.media, projectId, clip.file);
    if (mediaPath === null) {
      assets.push([clip.file, "missing"]);
      continue;
    }
    try {
      const st = await fs.stat(mediaPath);
      assets.push([clip.file, st.size]);
    } catch {
      assets.push([clip.file, "missing"]);
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
