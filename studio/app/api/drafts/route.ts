import { SLUG_RE } from "@/lib/projectDocument";
import { errorResponse } from "@/server/http";
import { fromWriteError, guardWriteRequest } from "@/server/write/writeGuard";
import { createDraft } from "@/server/write/draftRepository";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const gate = await guardWriteRequest(request);
  if (!gate.ok) return gate.response;
  try {
    const body = gate.body as { sourceProjectId?: unknown } | null;
    const sourceProjectId =
      body !== null && typeof body === "object" && typeof body.sourceProjectId === "string"
        ? body.sourceProjectId
        : null;
    if (sourceProjectId === null || !SLUG_RE.test(sourceProjectId)) {
      return errorResponse(400, "invalid_id", "sourceProjectId is not a valid project id.");
    }
    const draft = await createDraft(sourceProjectId);
    return Response.json(draft, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fromWriteError(err);
  }
}
