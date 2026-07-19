import "server-only";
// Mutation-request gate (Phase 3 Stage E). Every write route passes here
// before touching any repository: local Host, local same-origin proof,
// strict JSON content type, bounded body, and the custom write-intent
// header (a mandatory CSRF barrier — cross-origin HTML forms and simple
// requests cannot set it). No CORS relaxation exists anywhere in Studio.

import { errorResponse, forbiddenHost, fromError, isLocalHost } from "../http";
import { WriteError } from "./dataRootPolicy";

export const WRITE_INTENT_HEADER = "x-myvideo-intent";
export const WRITE_INTENT_VALUE = "studio-write-v1";
export const MAX_WRITE_BODY_BYTES = 262_144;

const LOCAL_ORIGIN_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/i;
const CONTENT_TYPE_RE = /^application\/json\s*(;.*)?$/i;

export type WriteGate =
  | { ok: true; body: unknown }
  | { ok: false; response: Response };

const reject = (status: number, code: string, message: string): WriteGate => ({
  ok: false,
  response: errorResponse(status, code, message),
});

export async function guardWriteRequest(request: Request): Promise<WriteGate> {
  if (!isLocalHost(request)) return { ok: false, response: forbiddenHost() };

  // Browsers attach Origin to every fetch POST/PUT; require it (or a local
  // Referer) so cross-site navigations and rebound origins fail closed.
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (origin !== null) {
    if (!LOCAL_ORIGIN_RE.test(origin.trim())) {
      return reject(403, "forbidden_origin", "Write requests must originate from local Studio.");
    }
  } else if (referer !== null) {
    let refOrigin: string | null = null;
    try {
      refOrigin = new URL(referer).origin;
    } catch {
      refOrigin = null;
    }
    if (refOrigin === null || !LOCAL_ORIGIN_RE.test(refOrigin)) {
      return reject(403, "forbidden_origin", "Write requests must originate from local Studio.");
    }
  } else {
    return reject(403, "forbidden_origin", "Write requests must carry a local Origin.");
  }

  if (request.headers.get(WRITE_INTENT_HEADER) !== WRITE_INTENT_VALUE) {
    return reject(403, "missing_write_intent", "Write requests must declare the Studio write intent.");
  }

  const contentType = request.headers.get("content-type");
  if (contentType === null || !CONTENT_TYPE_RE.test(contentType.trim())) {
    return reject(415, "unsupported_media_type", "Write requests must be application/json.");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WRITE_BODY_BYTES) {
    return reject(413, "body_too_large", "Write request body exceeds the allowed size.");
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return reject(400, "invalid_json", "Write request body could not be read.");
  }
  if (text.length > MAX_WRITE_BODY_BYTES) {
    return reject(413, "body_too_large", "Write request body exceeds the allowed size.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reject(400, "invalid_json", "Write request body is not valid JSON.");
  }
  return { ok: true, body };
}

/** Error → response mapping for write routes: controlled codes only.
 *  Falls through to the read-side mapping for PolicyError. */
export function fromWriteError(err: unknown): Response {
  if (err instanceof WriteError) {
    return errorResponse(err.status, err.code, err.message);
  }
  return fromError(err);
}
