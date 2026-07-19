import "server-only";
// Writable data-root boundary (Phase 3). The ONLY subsystem allowed to turn
// MYVIDEO_STUDIO_DATA_ROOT into filesystem paths. Fails closed: read-only
// browsing never calls this module, and every failure is a controlled error.
// Successful resolution is cached; failures are re-evaluated per request.

import fs from "node:fs/promises";
import path from "node:path";
import { getRoots } from "../pathPolicy";

export class WriteError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "WriteError";
  }
}

export const dataRootUnavailable = (): WriteError =>
  new WriteError(
    "data_root_unavailable",
    "Writable Studio data root is not configured or not usable.",
    503,
  );

let cachedDataRoot: string | null = null;

/** Resolve, create, and containment-check the writable data root. */
export async function getDataRoot(): Promise<string> {
  if (cachedDataRoot !== null) return cachedDataRoot;

  const raw = process.env.MYVIDEO_STUDIO_DATA_ROOT;
  if (raw === undefined || raw.trim() === "" || !path.isAbsolute(raw)) {
    throw dataRootUnavailable();
  }
  const { repoRoot } = await getRoots();

  let resolved: string;
  try {
    await fs.mkdir(raw, { recursive: true, mode: 0o700 });
    const lst = await fs.lstat(raw);
    if (lst.isSymbolicLink() || !lst.isDirectory()) throw new Error("not a plain directory");
    resolved = await fs.realpath(raw);
    await fs.chmod(resolved, 0o700);
  } catch {
    throw dataRootUnavailable();
  }
  // The data root must never live in (or be) the engine repository.
  if (resolved === repoRoot || resolved.startsWith(repoRoot + path.sep)) {
    throw dataRootUnavailable();
  }
  cachedDataRoot = resolved;
  return resolved;
}

/** Test seam: clear the cached data root. */
export function resetDataRootForTesting(): void {
  cachedDataRoot = null;
}

/** Ensure and return an owner-only subdirectory built from server-generated
 *  components only (never client input). */
export async function ensureDataDir(...segments: string[]): Promise<string> {
  const root = await getDataRoot();
  for (const segment of segments) {
    if (segment.includes("/") || segment.includes("\\") || segment.includes("\0") ||
        segment === "" || segment === "." || segment === "..") {
      throw dataRootUnavailable();
    }
  }
  const dir = path.join(root, ...segments);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}
