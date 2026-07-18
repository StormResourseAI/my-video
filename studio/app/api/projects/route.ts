import { PROJECT_SCHEMA_VERSION } from "@/lib/projectDocument";
import { forbiddenHost, fromError, isLocalHost } from "@/server/http";
import { listProjects } from "@/server/projectRepository";

// Read-only, filesystem-backed: never prerender at build time.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!isLocalHost(request)) return forbiddenHost();
  try {
    const projects = await listProjects();
    return Response.json(
      { schemaVersion: PROJECT_SCHEMA_VERSION, projects },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return fromError(err);
  }
}
