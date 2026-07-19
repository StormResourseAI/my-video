import { parseRange, resolveAsset, streamAsset } from "@/server/assetStream";
import { errorResponse, forbiddenHost, fromError, isLocalHost } from "@/server/http";

export const dynamic = "force-dynamic";

function baseHeaders(contentType: string): Headers {
  return new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=0, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
}

async function handle(
  request: Request,
  params: Promise<{ assetId: string }>,
  includeBody: boolean,
): Promise<Response> {
  if (!isLocalHost(request)) return forbiddenHost();
  try {
    const { assetId } = await params;
    const asset = await resolveAsset(assetId);
    if (asset === null) {
      return errorResponse(404, "asset_not_found", "Unknown asset.");
    }
    const headers = baseHeaders(asset.contentType);
    const range = parseRange(request.headers.get("range"), asset.size);

    if (range.kind === "unsatisfiable") {
      headers.set("Content-Range", `bytes */${asset.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (range.kind === "partial") {
      const length = range.end - range.start + 1;
      headers.set("Content-Length", String(length));
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${asset.size}`);
      return new Response(
        includeBody ? streamAsset(asset.absolutePath, range.start, range.end) : null,
        { status: 206, headers },
      );
    }
    headers.set("Content-Length", String(asset.size));
    return new Response(
      includeBody && asset.size > 0 ? streamAsset(asset.absolutePath, 0, asset.size - 1) : null,
      { status: 200, headers },
    );
  } catch (err) {
    return fromError(err);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  return handle(request, params, true);
}

export async function HEAD(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  return handle(request, params, false);
}
