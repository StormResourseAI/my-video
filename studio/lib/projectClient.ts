// The ONLY module in the Studio client allowed to call fetch (enforced by
// tests/safety.test.tsx). Same-origin, relative /api/ URLs. Reads are GET;
// the only mutations are the Phase 3 draft/render calls, which carry the
// Studio write-intent header and JSON bodies.

import {
  validateDocument,
  validateProjectList,
  type ProjectDocumentV1,
  type ProjectSummaryV1,
  SLUG_RE,
} from "./projectDocument";
import {
  UUID_RE,
  validateDraft,
  WRITE_INTENT_HEADER,
  WRITE_INTENT_VALUE,
  type DraftEditsV1,
  type StudioDraftV1,
} from "./draftDocument";
import { validateRenderJob, type RenderJobV1 } from "./renderDocument";

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
  return parseResult(res);
}

async function parseResult(res: Response): Promise<ClientResult<unknown>> {
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

async function sendJson(
  url: string,
  method: "POST" | "PUT",
  payload: unknown,
): Promise<ClientResult<unknown>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        [WRITE_INTENT_HEADER]: WRITE_INTENT_VALUE,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, code: "network", message: "Studio server unreachable." };
  }
  return parseResult(res);
}

function asDraft(res: ClientResult<unknown>): ClientResult<StudioDraftV1> {
  if (!res.ok) return res;
  const draft = validateDraft(res.value);
  if (draft === null) {
    return { ok: false, code: "invalid_contract", message: "Draft failed validation." };
  }
  return { ok: true, value: draft };
}

export async function createDraftApi(sourceProjectId: string): Promise<ClientResult<StudioDraftV1>> {
  if (!SLUG_RE.test(sourceProjectId)) {
    return { ok: false, code: "invalid_id", message: "Invalid project id." };
  }
  return asDraft(await sendJson("/api/drafts", "POST", { sourceProjectId }));
}

export async function saveDraftApi(
  draftId: string,
  edits: DraftEditsV1,
): Promise<ClientResult<StudioDraftV1>> {
  if (!UUID_RE.test(draftId)) {
    return { ok: false, code: "invalid_id", message: "Invalid draft id." };
  }
  return asDraft(await sendJson(`/api/drafts/${encodeURIComponent(draftId)}`, "PUT", edits));
}

export async function fetchDraft(draftId: string): Promise<ClientResult<StudioDraftV1>> {
  if (!UUID_RE.test(draftId)) {
    return { ok: false, code: "invalid_id", message: "Invalid draft id." };
  }
  return asDraft(await getJson(`/api/drafts/${encodeURIComponent(draftId)}`));
}

function asRenderJob(res: ClientResult<unknown>): ClientResult<RenderJobV1> {
  if (!res.ok) return res;
  const job = validateRenderJob(res.value);
  if (job === null) {
    return { ok: false, code: "invalid_contract", message: "Render job failed validation." };
  }
  return { ok: true, value: job };
}

export async function startRenderApi(
  draftId: string,
  expectedDraftVersion: number,
): Promise<ClientResult<RenderJobV1>> {
  if (!UUID_RE.test(draftId)) {
    return { ok: false, code: "invalid_id", message: "Invalid draft id." };
  }
  return asRenderJob(await sendJson("/api/renders", "POST", { draftId, expectedDraftVersion }));
}

export async function fetchRenderJob(renderId: string): Promise<ClientResult<RenderJobV1>> {
  if (!UUID_RE.test(renderId)) {
    return { ok: false, code: "invalid_id", message: "Invalid render id." };
  }
  return asRenderJob(await getJson(`/api/renders/${encodeURIComponent(renderId)}`));
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
