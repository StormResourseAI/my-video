import "server-only";
// Writable data-root boundary (Phase 3). The ONLY subsystem allowed to turn
// MYVIDEO_STUDIO_DATA_ROOT into filesystem paths. Structurally split into
// WRITE mode (getOrCreateDataRoot/ensureDataDir — may create directories;
// callable only from explicit write operations) and READ mode
// (getExistingDataRoot/resolveExistingDataDir — never mkdir, never chmod,
// never create; unknown identifiers and missing roots resolve to "absent").
// Fails closed: every failure is a controlled error.

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
// Whether the cached root has passed WRITE-mode preparation (mkdir+chmod).
// A read may prime the path cache, but the first write must still enforce
// owner-only permissions on a pre-existing root.
let cachedWriteReady = false;

function configuredRoot(): string | null {
  const raw = process.env.MYVIDEO_STUDIO_DATA_ROOT;
  if (raw === undefined || raw.trim() === "" || !path.isAbsolute(raw)) return null;
  return raw;
}

/** Shared validation of an EXISTING root path: plain directory, no symlink,
 *  realpath-resolved, never the repository or inside it. Never creates. */
async function validateExistingRoot(raw: string): Promise<string | null> {
  const { repoRoot } = await getRoots();
  let resolved: string;
  try {
    const lst = await fs.lstat(raw);
    if (lst.isSymbolicLink() || !lst.isDirectory()) return null;
    resolved = await fs.realpath(raw);
  } catch {
    return null;
  }
  if (resolved === repoRoot || resolved.startsWith(repoRoot + path.sep)) return null;
  return resolved;
}

/** WRITE MODE ONLY. Resolve the data root, creating it (owner-only) when
 *  missing. Callable exclusively from explicit write operations that have
 *  already passed the write-request guards. */
export async function getOrCreateDataRoot(): Promise<string> {
  if (cachedDataRoot !== null && cachedWriteReady) return cachedDataRoot;
  const raw = configuredRoot();
  if (raw === null) throw dataRootUnavailable();
  try {
    await fs.mkdir(raw, { recursive: true, mode: 0o700 });
    await fs.chmod(raw, 0o700);
  } catch {
    throw dataRootUnavailable();
  }
  const resolved = await validateExistingRoot(raw);
  if (resolved === null) throw dataRootUnavailable();
  cachedDataRoot = resolved;
  cachedWriteReady = true;
  return resolved;
}

/** READ MODE. Resolve an ALREADY EXISTING data root without creating,
 *  chmodding, or otherwise touching the filesystem. Returns null when the
 *  root is unconfigured or absent. */
export async function getExistingDataRoot(): Promise<string | null> {
  if (cachedDataRoot !== null) return cachedDataRoot;
  const raw = configuredRoot();
  if (raw === null) return null;
  const resolved = await validateExistingRoot(raw);
  if (resolved === null) return null;
  cachedDataRoot = resolved;
  return resolved;
}

/** Test seam: clear the cached data root. */
export function resetDataRootForTesting(): void {
  cachedDataRoot = null;
  cachedWriteReady = false;
}

function assertPlainSegments(segments: string[]): void {
  for (const segment of segments) {
    if (
      segment.includes("/") || segment.includes("\\") || segment.includes("\0") ||
      segment === "" || segment === "." || segment === ".."
    ) {
      throw dataRootUnavailable();
    }
  }
}

/** WRITE MODE ONLY. Ensure and return an owner-only subdirectory built from
 *  server-generated components, proving the real path stays under the root. */
export async function ensureDataDir(...segments: string[]): Promise<string> {
  const root = await getOrCreateDataRoot();
  assertPlainSegments(segments);
  const dir = path.join(root, ...segments);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  // Containment proof: the created directory must realpath under the root
  // (rejects a pre-planted symlink at any nested component).
  let resolved: string;
  try {
    resolved = await fs.realpath(dir);
  } catch {
    throw dataRootUnavailable();
  }
  if (!resolved.startsWith(root + path.sep)) throw dataRootUnavailable();
  return resolved;
}

/** READ MODE. Resolve an existing subdirectory without creating anything.
 *  Returns null when any component is missing, is not a directory, or
 *  escapes the data root via symlink. */
export async function resolveExistingDataDir(...segments: string[]): Promise<string | null> {
  const root = await getExistingDataRoot();
  if (root === null) return null;
  assertPlainSegments(segments);
  const dir = path.join(root, ...segments);
  let resolved: string;
  try {
    // No symlink is expected anywhere in the server-generated layout —
    // reject symlinked components outright rather than following them.
    const lst = await fs.lstat(dir);
    if (lst.isSymbolicLink() || !lst.isDirectory()) return null;
    resolved = await fs.realpath(dir);
  } catch {
    return null;
  }
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}
