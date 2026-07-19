import { forbiddenHost, isLocalHost } from "@/server/http";
import { fromWriteError } from "@/server/write/writeGuard";
import { getRenderJob } from "@/server/write/renderRepository";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ renderId: string }> },
): Promise<Response> {
  if (!isLocalHost(request)) return forbiddenHost();
  try {
    const { renderId } = await params;
    const job = await getRenderJob(renderId);
    return Response.json(job, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fromWriteError(err);
  }
}
