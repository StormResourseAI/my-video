import { parseRange, streamAsset } from "@/server/assetStream";
import { forbiddenHost, isLocalHost } from "@/server/http";
import { fromWriteError } from "@/server/write/writeGuard";
import { resolveRenderOutput } from "@/server/write/renderRepository";
import { getDraft } from "@/server/write/draftRepository";

export const dynamic = "force-dynamic";

/** Download filename derived from the sanitized draft title — plain ASCII
 *  word characters only, never a path. */
async function downloadName(draftId: string): Promise<string> {
  let title: string | null = null;
  try {
    title = (await getDraft(draftId)).draftTitle;
  } catch {
    title = null;
  }
  const cleaned = (title ?? "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${cleaned.length > 0 ? cleaned : "myvideo-draft"}.mp4`;
}

async function handle(
  request: Request,
  params: Promise<{ renderId: string }>,
  includeBody: boolean,
): Promise<Response> {
  if (!isLocalHost(request)) return forbiddenHost();
  try {
    const { renderId } = await params;
    const { job, absolutePath, size } = await resolveRenderOutput(renderId);
    const headers = new Headers({
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Disposition": `attachment; filename="${await downloadName(job.draftId)}"`,
    });
    const range = parseRange(request.headers.get("range"), size);

    if (range.kind === "unsatisfiable") {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    if (range.kind === "partial") {
      const length = range.end - range.start + 1;
      headers.set("Content-Length", String(length));
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
      return new Response(includeBody ? streamAsset(absolutePath, range.start, range.end) : null, {
        status: 206,
        headers,
      });
    }
    headers.set("Content-Length", String(size));
    return new Response(
      includeBody && size > 0 ? streamAsset(absolutePath, 0, size - 1) : null,
      { status: 200, headers },
    );
  } catch (err) {
    return fromWriteError(err);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ renderId: string }> },
): Promise<Response> {
  return handle(request, params, true);
}

export async function HEAD(
  request: Request,
  { params }: { params: Promise<{ renderId: string }> },
): Promise<Response> {
  return handle(request, params, false);
}
