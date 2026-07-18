// The ONLY module in the Studio client allowed to call fetch (enforced by
// tests/safety.test.tsx). Same-origin, GET-only, relative /api/ URLs.

import {
  validateDocument,
  validateProjectList,
  type ProjectDocumentV1,
  type ProjectSummaryV1,
  SLUG_RE,
} from "./projectDocument";

export type ClientResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string };

async function getJson(url: string): Promise<ClientResult<unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", cache: "no-store" });
  } catch {
    return { ok: false, code: "network", message: "Studio server unreachable." };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: "bad_response", message: "Malformed server response." };
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } })?.error;
    return {
      ok: false,
      code: typeof err?.code === "string" ? err.code : "http_error",
      message: typeof err?.message === "string" ? err.message : `Request failed (${res.status}).`,
    };
  }
  return { ok: true, value: body };
}

export async function fetchProjects(): Promise<ClientResult<ProjectSummaryV1[]>> {
  const res = await getJson("/api/projects");
  if (!res.ok) return res;
  const list = validateProjectList(res.value);
  if (list === null) {
    return { ok: false, code: "invalid_contract", message: "Project list failed validation." };
  }
  return { ok: true, value: list.projects };
}

export async function fetchProject(projectId: string): Promise<ClientResult<ProjectDocumentV1>> {
  if (!SLUG_RE.test(projectId)) {
    return { ok: false, code: "invalid_id", message: "Invalid project id." };
  }
  const res = await getJson(`/api/projects/${encodeURIComponent(projectId)}`);
  if (!res.ok) return res;
  const doc = validateDocument(res.value);
  if (doc === null) {
    return { ok: false, code: "invalid_contract", message: "Project document failed validation." };
  }
  return { ok: true, value: doc };
}
