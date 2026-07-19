import "server-only";
// The ONLY module that turns names into absolute filesystem paths.
// Read-only by construction: it exposes resolution + validation, never
// write-capable APIs. See PHASE2_READONLY_INTEGRATION_PLAN.md §6.

import { promises as fs } from "node:fs";
import path from "node:path";

import { SLUG_RE } from "@/lib/projectDocument";

export class PolicyError extends Error {
  constructor(
    public readonly code:
      | "repo_root_unavailable"
      | "invalid_id"
      | "not_found",
    message: string,
  ) {
    super(message);
  }
}

export interface PolicyRoots {
  repoRoot: string;
  /** Allowlisted, realpath-resolved roots. A null value means the directory
   *  does not exist in this checkout (e.g. CI without local media). */
  selects: string | null;
  metadata: string | null;
  props: string | null;
  media: string | null;
}

let cachedRoots: PolicyRoots | null = null;

async function realpathOrNull(p: string): Promise<string | null> {
  try {
    return await fs.realpath(p);
  } catch {
    return null;
  }
}

/** Resolve and sentinel-check the engine repository root exactly once.
 *  Anchored via MYVIDEO_REPO_ROOT (set by the studio dev/start scripts);
 *  falls back to the parent of the studio working directory. Never derived
 *  from any client input. */
export async function getRoots(): Promise<PolicyRoots> {
  if (cachedRoots !== null) return cachedRoots;

  const anchor = process.env.MYVIDEO_REPO_ROOT ?? path.resolve(process.cwd(), "..");
  const repoRoot = await realpathOrNull(anchor);
  if (repoRoot === null) {
    throw new PolicyError("repo_root_unavailable", "Engine repository root not found.");
  }
  // Sentinel: must be the my-video engine repo, not an arbitrary directory.
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8")) as {
      name?: string;
    };
    if (pkg.name !== "my-video") {
      throw new Error("wrong package");
    }
  } catch {
    throw new PolicyError(
      "repo_root_unavailable",
      "MYVIDEO_REPO_ROOT does not point at the my-video repository.",
    );
  }

  cachedRoots = {
    repoRoot,
    selects: await realpathOrNull(path.join(repoRoot, "input", "selects")),
    metadata: await realpathOrNull(path.join(repoRoot, "input", "metadata")),
    props: await realpathOrNull(path.join(repoRoot, ".cache", "render-props")),
    media: await realpathOrNull(path.join(repoRoot, "public", "runtime-selects")),
  };
  return cachedRoots;
}

/** Test seam: clear the cached roots (used with a temp MYVIDEO_REPO_ROOT). */
export function resetRootsForTesting(): void {
  cachedRoots = null;
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !slug.includes("..");
}

export function isValidFileName(name: string): boolean {
  return (
    name.length >= 1 &&
    name.length <= 200 &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("\0") &&
    name === path.basename(name) &&
    name !== "." &&
    name !== ".."
  );
}

/** Resolve root/<segments...> to a real path, requiring the result to stay
 *  strictly under the allowlisted root (symlink-escape and prefix-collision
 *  safe: comparison includes the trailing separator on the resolved root).
 *  Returns null when the target does not exist or escapes. */
export async function resolveUnder(
  root: string | null,
  ...segments: string[]
): Promise<string | null> {
  if (root === null) return null;
  for (const s of segments) {
    if (!isValidFileName(s) && !isValidSlug(s)) return null;
  }
  const candidate = path.join(root, ...segments);
  const resolved = await realpathOrNull(candidate);
  if (resolved === null) return null;
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}
