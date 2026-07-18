import { validateDocument } from "@/lib/projectDocument";
import { errorResponse, forbiddenHost, fromError, isLocalHost } from "@/server/http";
import { getProject } from "@/server/projectRepository";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  if (!isLocalHost(request)) return forbiddenHost();
  try {
    const { projectId } = await params;
    const document = await getProject(projectId);
    // Server-side contract check before responding (plan §7): a document we
    // cannot re-validate is a bug, not a client problem.
    if (validateDocument(document) === null) {
      return errorResponse(500, "props_unreadable", "Project document failed validation.");
    }
    return Response.json(document, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fromError(err);
  }
}
