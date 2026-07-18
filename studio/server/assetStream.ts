import "server-only";
// Asset resolution + byte-range streaming for staged preview media.
// Canonical asset id: unpadded base64url of "<slug>/<fileName>", where the
// file must be a member of the project's materialized props cache.

import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";

import { ASSET_ID_RE } from "@/lib/projectDocument";
import { getRoots, isValidFileName, isValidSlug, resolveUnder } from "./pathPolicy";
import { isProjectAsset } from "./projectRepository";

// Extensions the engine stages (scripts/render-vertical.mjs VIDEO_EXTS).
const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".mkv": "video/x-matroska",
};

export interface ResolvedAsset {
  absolutePath: string;
  size: number;
  contentType: string;
}

/** Strict decode: canonical unpadded base64url, valid UTF-8, exactly one
 *  "/", byte-equal on re-encode. Returns null on any deviation. */
export function decodeAssetId(assetId: string): { slug: string; fileName: string } | null {
  if (!ASSET_ID_RE.test(assetId)) return null;
  let decoded: string;
  try {
    const buf = Buffer.from(assetId, "base64url");
    decoded = buf.toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== assetId) return null;
  } catch {
    return null;
  }
  const firstSlash = decoded.indexOf("/");
  if (firstSlash <= 0 || firstSlash !== decoded.lastIndexOf("/")) return null;
  const slug = decoded.slice(0, firstSlash);
  const fileName = decoded.slice(firstSlash + 1);
  if (!isValidSlug(slug) || !isValidFileName(fileName)) return null;
  return { slug, fileName };
}

export async function resolveAsset(assetId: string): Promise<ResolvedAsset | null> {
  const decoded = decodeAssetId(assetId);
  if (decoded === null) return null;
  const contentType = MIME[path.extname(decoded.fileName).toLowerCase()];
  if (contentType === undefined) return null;
  if (!(await isProjectAsset(decoded.slug, decoded.fileName))) return null;
  const roots = await getRoots();
  const absolutePath = await resolveUnder(roots.media, decoded.slug, decoded.fileName);
  if (absolutePath === null) return null;
  let size: number;
  try {
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) return null;
    size = stat.size;
  } catch {
    return null;
  }
  return { absolutePath, size, contentType };
}

export type RangeResult =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

/** RFC 9110 single byte range. Multi-range and malformed specs degrade to a
 *  full 200 response; syntactically valid but unsatisfiable ranges → 416. */
export function parseRange(header: string | null, size: number): RangeResult {
  if (header === null) return { kind: "full" };
  const match = /^bytes=(\d{0,15})-(\d{0,15})$/.exec(header.trim());
  if (match === null) return { kind: "full" };
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return { kind: "full" };

  if (rawStart === "") {
    // suffix: last N bytes
    const suffix = Number(rawEnd);
    if (suffix === 0 || size === 0) return { kind: "unsatisfiable" };
    const start = Math.max(0, size - suffix);
    return { kind: "partial", start, end: size - 1 };
  }
  const start = Number(rawStart);
  if (start >= size) return { kind: "unsatisfiable" };
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (end < start) return { kind: "full" };
  return { kind: "partial", start, end };
}

/** Wrap a bounded read stream as a web ReadableStream for the Response body. */
export function streamAsset(
  absolutePath: string,
  start: number,
  end: number,
): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(absolutePath, { start, end });
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        controller.enqueue(
          typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk),
        );
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", () => controller.error(new Error("stream error")));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}
