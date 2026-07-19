import "server-only";
// Crash-resistant JSON persistence: serialize, write a uniquely named temp
// file in the destination directory (owner-only, exclusive create), flush,
// then rename into place. Only the operation's own temp file is cleaned on
// failure. Destination names are server-generated — never client input.

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

async function writeTemp(destDir: string, fileName: string, value: unknown): Promise<string> {
  const tmpPath = path.join(destDir, `.${fileName}.${randomUUID()}.tmp`);
  const handle = await fs.open(tmpPath, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2) + "\n", "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return tmpPath;
}

async function fsyncDir(dir: string): Promise<void> {
  try {
    const handle = await fs.open(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Directory fsync is best-effort (unsupported on some platforms).
  }
}

/** Atomically create or replace destDir/fileName. */
export async function writeJsonAtomic(destDir: string, fileName: string, value: unknown): Promise<void> {
  const tmpPath = await writeTemp(destDir, fileName, value);
  try {
    await fs.rename(tmpPath, path.join(destDir, fileName));
  } catch (err) {
    await fs.rm(tmpPath, { force: true });
    throw err;
  }
  await fsyncDir(destDir);
}

/** Atomically create destDir/fileName, failing if it already exists —
 *  used for immutable revision history and render outputs' job records. */
export async function writeJsonExclusive(destDir: string, fileName: string, value: unknown): Promise<void> {
  const tmpPath = await writeTemp(destDir, fileName, value);
  try {
    // link() is atomic and refuses to overwrite an existing destination.
    await fs.link(tmpPath, path.join(destDir, fileName));
  } finally {
    await fs.rm(tmpPath, { force: true });
  }
  await fsyncDir(destDir);
}

/** Read + parse JSON, returning null on any error. */
export async function readJsonOrNull(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}
