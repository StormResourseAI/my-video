import "server-only";
// Shared route-handler guards: local-host enforcement and error shaping.
// Error responses never include stacks or filesystem paths.

import { PolicyError } from "./pathPolicy";

// Loopback-only contract (plan §5.1): reject non-local Host headers before
// any repository access. Closes DNS rebinding, where an attacker hostname
// re-resolves to 127.0.0.1 and becomes same-origin.
const LOCAL_HOST_RE = /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/i;

export function isLocalHost(request: Request): boolean {
  const host = request.headers.get("host");
  return host !== null && LOCAL_HOST_RE.test(host.trim());
}

export function errorResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function forbiddenHost(): Response {
  return errorResponse(403, "forbidden_host", "Studio only serves local requests.");
}

export function fromError(err: unknown): Response {
  if (err instanceof PolicyError) {
    if (err.code === "invalid_id") return errorResponse(400, err.code, err.message);
    if (err.code === "not_found") return errorResponse(404, err.code, err.message);
    return errorResponse(500, err.code, err.message);
  }
  return errorResponse(500, "internal", "Internal error.");
}
