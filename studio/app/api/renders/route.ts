import { UUID_RE, MAX_DRAFT_VERSION } from "@/lib/draftDocument";
import { errorResponse } from "@/server/http";
import { fromWriteError, guardWriteRequest } from "@/server/write/writeGuard";
import { startRender } from "@/server/render/renderQueue";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const gate = await guardWriteRequest(request);
  if (!gate.ok) return gate.response;
  try {
    const body = gate.body as { draftId?: unknown; expectedDraftVersion?: unknown } | null;
    const draftId =
      body !== null && typeof body === "object" && typeof body.draftId === "string"
        ? body.draftId
        : null;
    const expectedDraftVersion =
      body !== null && typeof body === "object" && typeof body.expectedDraftVersion === "number"
        ? body.expectedDraftVersion
        : null;
    if (
      draftId === null || !UUID_RE.test(draftId) ||
      expectedDraftVersion === null ||
      !Number.isSafeInteger(expectedDraftVersion) ||
      expectedDraftVersion < 1 || expectedDraftVersion > MAX_DRAFT_VERSION
    ) {
      return errorResponse(400, "invalid_body", "draftId and expectedDraftVersion are required.");
    }
    const job = await startRender(draftId, expectedDraftVersion);
    return Response.json(job, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fromWriteError(err);
  }
}
