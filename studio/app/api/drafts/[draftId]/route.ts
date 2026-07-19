import { forbiddenHost, isLocalHost } from "@/server/http";
import { fromWriteError, guardWriteRequest } from "@/server/write/writeGuard";
import { getDraft, updateDraft } from "@/server/write/draftRepository";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
): Promise<Response> {
  if (!isLocalHost(request)) return forbiddenHost();
  try {
    const { draftId } = await params;
    const draft = await getDraft(draftId);
    return Response.json(draft, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fromWriteError(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
): Promise<Response> {
  const gate = await guardWriteRequest(request);
  if (!gate.ok) return gate.response;
  try {
    const { draftId } = await params;
    const draft = await updateDraft(draftId, gate.body);
    return Response.json(draft, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fromWriteError(err);
  }
}
